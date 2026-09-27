import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { ClassificationStep } from '../../src/components/ClassificationStep';
import { CompletionStep } from '../../src/components/CompletionStep';
import { calculateLoan } from '../../src/domain';
import { createMemorySessionStorage, deserializeStudentSession, loadStudentSession, saveStudentSession, serializeStudentSession } from '../../src/persistence';
import { STUDENT_STEPS, applyStudentAction, classificationRepaymentCount, classificationStage, createStudentState } from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';
import { r3 } from '../fixtures/r3';
import { r4 } from '../fixtures/r4';
import { r6 } from '../fixtures/r6';
import type { GoldenFixture } from '../fixtures/types';

const take = (state: StudentState, action: StudentAction) => {
  return applyStudentAction(state, action);
};
const dk = (value: string) => value.replace('.', ',');
const dateLabelForTest = (value: string) => value.split('-').reverse().join('.');
const formula = (value: { toFixed(scale: number): string }) => `=${dk(value.toFixed(2))}+0`;
const renderClassification = (state: StudentState) => renderToStaticMarkup(createElement(ClassificationStep, { state, onAction: () => {}, readOnly: state.currentStep !== 'classification' || state.sessionStatus === 'completed' }));
const renderCompletion = (state: StudentState) => renderToStaticMarkup(createElement(CompletionStep, { state, onAction: () => {}, readOnly: state.sessionStatus === 'completed' }));

function atClassification(fixture: GoldenFixture): StudentState {
  const state = createStudentState({ generatorVersion: '1.0.0', seed: 91, loanType: fixture.input.loanType, attempts: 1, caseInput: fixture.input });
  return { ...state, currentStep: 'classification', viewingStep: 'classification', completedSteps: [...STUDENT_STEPS.slice(0, 4)] };
}

function throughDistribution(state: StudentState): StudentState {
  const expected = calculateLoan(state.generatedCase.caseInput).classification;
  if (expected.shortTerm.isZero()) {
    state = take(state, { type: 'setShortTermAnswer', answer: 'no' });
    state = take(state, { type: 'checkShortTermAnswer' });
  } else {
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: classificationRepaymentCount(state) === 1
      ? dk(expected.shortTerm.toFixed(2)) : formula(expected.shortTerm) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
  }
  state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: formula(expected.longTerm) });
  return take(state, { type: 'checkClassificationField', field: 'longTerm' });
}

function throughClassification(fixture: GoldenFixture): StudentState {
  return throughDistribution(atClassification(fixture));
}

function atCompletion(fixture: GoldenFixture): StudentState {
  const bookkeeping = take(throughClassification(fixture), { type: 'continueToNextStep' });
  return { ...bookkeeping, currentStep: 'completion', viewingStep: 'completion',
    completedSteps: [...STUDENT_STEPS.slice(0, 6)] };
}

function approveBalances(state: StudentState): StudentState {
  for (const balance of calculateLoan(state.generatedCase.caseInput).accountBalances) {
    if (balance.status === 'noBalance') continue;
    state = take(state, { type: 'editFinalBalance', account: balance.account, formula: formula(balance.amount), side: balance.side });
    state = take(state, { type: 'checkFinalBalance', account: balance.account });
  }
  return state;
}

describe('L8D classification and completion', () => {
  it('shows the full approved Balance and the 2026 carrying amount without a duplicate 2027 table', () => {
    const state = atClassification(r1);
    const html = renderClassification(state);
    expect(html).toContain('Amortiseret kostpris pr. 31.12.2026');
    expect(html).toContain(new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2 }).format(Number(state.caseResult.classification.carryingAmount.toFixed(2))));
    expect(html).toMatch(/Termin<\/th><th scope="col">Dato<\/th><th scope="col">Kostpris primo<\/th><th scope="col">Afdrag<\/th><th scope="col">Amortisering<\/th><th scope="col">Kostpris ultimo/);
    for (const row of state.caseResult.carryingSchedule) expect(html).toContain(dateLabelForTest(row.date));
    expect(html).not.toContain('Afdrag med forfald i 2027');
    expect(html).not.toContain(dk(state.caseResult.classification.shortTerm.toFixed(2)));
    expect(state.caseResult.accountBalances).toBeNull();
  });

  it('uses only principal repayments after 2026 and through 2027', () => {
    const state = atClassification(r1);
    const rows = state.caseResult.contract.rows.filter((row) => row.date > '2026-12-31' && row.date <= '2027-12-31');
    const principal = rows.reduce((sum, row) => sum + Number(row.principalRepayment.toFixed(2)), 0);
    const payments = rows.reduce((sum, row) => sum + Number(row.payment.toFixed(2)), 0);
    const interest = rows.reduce((sum, row) => sum + Number(row.nominalInterest.toFixed(2)), 0);
    const amortization = state.caseResult.carryingSchedule.filter((row) => row.date > '2026-12-31' && row.date <= '2027-12-31')
      .reduce((sum, row) => sum + Number(row.amortization.toFixed(2)), 0);
    expect(principal.toFixed(2)).toBe(state.caseResult.classification.shortTerm.toFixed(2));
    expect(principal).not.toBe(payments);
    expect(principal).not.toBe(interest);
    expect(principal).not.toBe(amortization);
    expect(rows.every((row) => row.date > '2026-12-31' && row.date <= '2027-12-31')).toBe(true);
  });

  it('accepts one direct positive repayment in sequence and completes without navigating', () => {
    let state = atClassification(r1);
    const expected = calculateLoan(r1.input).classification.shortTerm;
    expect(classificationRepaymentCount(state)).toBe(1);
    expect(renderClassification(state)).toContain('placeholder="Indtast beløb"');
    expect(take(state, { type: 'editClassificationField', field: 'longTerm', raw: '=1+1' })).toBe(state);
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: '1600000' });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(state.classification.fields.shortTerm?.errorCode).toBe('WRONG_RESULT');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: `-${dk(expected.toFixed(2))}` });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(renderClassification(state)).toContain('Fradraget vises allerede med');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: dk(expected.toFixed(2)) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(classificationStage(state)).toBe('longTerm');
    expect(state.classification.fields.shortTerm?.raw).toBe(dk(expected.toFixed(2)));
    const long = state.caseResult.classification.longTerm;
    state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: dk(long.toFixed(2)) });
    state = take(state, { type: 'checkClassificationField', field: 'longTerm' });
    expect(state.classification.fields.longTerm?.errorCode).toBe('MISSING_EQUALS');
    state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: `=${dk(state.caseResult.classification.carryingAmount.toFixed(2))}-${dk(expected.toFixed(2))}` });
    state = take(state, { type: 'checkClassificationField', field: 'longTerm' });
    expect(state.completedSteps).toContain('classification');
    expect(state.currentStep).toBe('classification');
    expect(expected.plus(long).eq(state.caseResult.classification.carryingAmount)).toBe(true);
    expect(renderClassification(state)).toContain('Fortsæt til Bogføring');
    expect(take(state, { type: 'setReclassificationBlock', lines: [] })).toBe(state);
    expect(state.caseResult.accountBalances).toBeNull();
  });

  it('requires a real sum for two or more 2027 repayments and explains a bare answer', () => {
    let state = atClassification(r3);
    const expected = state.caseResult.classification.shortTerm;
    const rows = state.caseResult.contract.rows.filter((row) => row.date > '2026-12-31'
      && row.date <= '2027-12-31' && row.principalRepayment.gt(0));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(classificationRepaymentCount(state)).toBe(rows.length);
    expect(renderClassification(state)).toContain('placeholder="Beregn et positivt beløb med ="');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: dk(expected.toFixed(2)) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(state.classification.fields.shortTerm?.approved).toBe(false);
    expect(renderClassification(state)).toContain('Vis beregningen ved at lægge de relevante afdrag sammen.');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: `=${dk(expected.toFixed(2))}` });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(state.classification.fields.shortTerm?.errorCode).toBe('NO_ACTUAL_OPERATION');
    expect(renderClassification(state)).toContain('Vis beregningen ved at lægge de relevante afdrag sammen.');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: `=${rows.map((row) => dk(row.principalRepayment.toFixed(2))).join('+')}` });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(classificationStage(state)).toBe('longTerm');
    state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: formula(state.caseResult.classification.longTerm) });
    state = take(state, { type: 'checkClassificationField', field: 'longTerm' });
    expect(state.completedSteps).toContain('classification');
  });

  it('transfers the single 1.625.000,00 serial repayment without arithmetic', () => {
    const input = { ...r4.input, nominalPrincipal: '6500000.00', years: 4 as const, paymentsPerYear: 1 as const };
    const initial = createStudentState({ generatorVersion: '1.0.0', seed: 91,
      loanType: 'serial', attempts: 1, caseInput: input });
    let state: StudentState = { ...initial, currentStep: 'classification', viewingStep: 'classification',
      completedSteps: [...STUDENT_STEPS.slice(0, 4)] };
    expect(classificationRepaymentCount(state)).toBe(1);
    expect(state.caseResult.contract.rows.filter((row) => row.date > '2026-12-31' && row.date <= '2027-12-31')
      .map((row) => row.principalRepayment.toFixed(2))).toEqual(['1625000.00']);
    expect(renderClassification(state)).toContain('placeholder="Indtast beløb"');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: '1625000' });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(state.classification.fields.shortTerm).toMatchObject({ raw: '1625000', approved: true });
    expect(classificationStage(state)).toBe('longTerm');
  });

  it('restores a directly entered short-term amount in v2', () => {
    let state = atClassification(r1);
    const raw = dk(state.caseResult.classification.shortTerm.toFixed(2));
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    const restored = deserializeStudentSession(serializeStudentSession(state));
    expect(restored.status).toBe('restored');
    if (restored.status !== 'restored') throw new Error('Restore failed');
    expect(restored.state.classification.fields.shortTerm).toMatchObject({ raw, approved: true });
    expect(renderClassification({ ...restored.state, currentStep: 'yearBookkeeping', viewingStep: 'classification' })).toContain(`value="${raw}"`);
  });

  it('continues explicitly to bookkeeping and returns from read-only history', () => {
    const completed = throughClassification(r1);
    const moved = take(completed, { type: 'continueToNextStep' });
    expect(moved.currentStep).toBe('yearBookkeeping');
    const historical = take(moved, { type: 'viewHistoricalStep', step: 'classification' });
    const html = renderClassification(historical);
    expect(html).toContain('Tilbage til aktuelt trin');
    expect(html).not.toContain('Fortsæt til Bogføring');
    expect(html).toContain('readOnly');
    expect(take(historical, { type: 'editClassificationField', field: 'longTerm', raw: '=1+1' })).toBe(historical);
    expect(take(historical, { type: 'returnToCurrentStep' }).viewingStep).toBe('yearBookkeeping');
  });

  it('accepts Nej for zero short term without an artificial =0 formula or posting', () => {
    let state = atClassification(r6);
    expect(renderClassification(state)).toContain('Forfalder der afdrag på hovedstolen');
    state = take(state, { type: 'setShortTermAnswer', answer: 'yes' });
    state = take(state, { type: 'checkShortTermAnswer' });
    expect(state.currentStep).toBe('classification');
    expect(renderClassification(state)).toContain('Beregningen stemmer ikke endnu.');
    state = take(state, { type: 'setShortTermAnswer', answer: 'no' });
    state = take(state, { type: 'checkShortTermAnswer' });
    expect(state.classification.fields.shortTerm).toMatchObject({ raw: '', approved: true });
    expect(classificationStage(state)).toBe('longTerm');
    state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: formula(state.caseResult.classification.carryingAmount) });
    state = take(state, { type: 'checkClassificationField', field: 'longTerm' });
    expect(state.completedSteps).toContain('classification');
    expect(state.currentStep).toBe('classification');
    expect(state.classification.reclassification.lines).toEqual([]);
    expect(state.caseResult.postingEvents.some((event) => event.kind === 'reclassification')).toBe(false);
  });

  it('shows noBalance read-only and creates final balances only in step eight', () => {
    const state = atCompletion(r6);
    expect(state.caseResult.accountBalances).not.toBeNull();
    expect(state.completion.balances['6760']).toBeUndefined();
    const html = renderCompletion(state);
    expect(html).toContain('Ingen saldo');
    expect(html).not.toContain('balance-6760');
    expect(take(state, { type: 'editFinalBalance', account: '6760', formula: '=0+0' })).toBe(state);
  });

  it('requires both an equals formula and a separate correct D/K choice', () => {
    let state = atCompletion(r1);
    const expected = calculateLoan(r1.input).accountBalances.find((entry) => entry.account === '4410')!;
    if (expected.status !== 'balance') throw new Error('Expected 4410 balance');
    state = take(state, { type: 'editFinalBalance', account: '4410', formula: dk(expected.amount.toFixed(2)), side: expected.side });
    state = take(state, { type: 'checkFinalBalance', account: '4410' });
    expect(state.completion.balances['4410']?.errorCode).toBe('MISSING_EQUALS');
    state = take(state, { type: 'editFinalBalance', account: '4410', formula: formula(expected.amount), side: expected.side === 'D' ? 'K' : 'D' });
    state = take(state, { type: 'checkFinalBalance', account: '4410' });
    expect(state.completion.balances['4410']?.errorCode).toBe('WRONG_DEBIT_CREDIT_SIDE');
    state = take(state, { type: 'editFinalBalance', account: '4410', side: expected.side });
    state = take(state, { type: 'checkFinalBalance', account: '4410' });
    expect(state.completion.balances['4410']?.approved).toBe(true);
    expect(take(state, { type: 'editFinalBalance', account: '4410', formula: '=1+1' })).toBe(state);
  });

  it('keeps A/B/C separate and leaves 3 of 3 active until the learner finishes', () => {
    let state = atCompletion(r1);
    expect(take(state, { type: 'runFinalChecks' })).toBe(state);
    state = approveBalances(state);
    expect(renderCompletion(state)).toContain('0 af 3 kontroller korrekte');
    for (const check of ['debtReconciles', 'financialExpenseReconciles', 'accountsReconcile'] as const) {
      state = take(state, { type: 'runFinalChecks', check });
    }
    expect(renderCompletion(state)).toContain('3 af 3 kontroller korrekte');
    expect(renderCompletion(state)).toContain('Afslut Niveau 1');
    expect(state.sessionStatus).toBe('active');
    expect(state.completedSteps).toHaveLength(6);
  });

  it('shows the completed summary and keeps the finished work read-only', () => {
    let state = approveBalances(atCompletion(r1));
    state = take(state, { type: 'runFinalChecks' });
    state = take(state, { type: 'finishLevel1' });
    const shell = renderToStaticMarkup(createElement(AppShell, { state, onAction: () => {}, onReset: () => {}, onNewCase: () => {} }));
    expect(shell).toContain('Niveau 1 er afsluttet');
    expect(shell).toContain('Se afsluttet opgave');
    expect(shell).toContain('Kortfristet gæld');
    expect(shell).not.toContain('Kontrollér saldo');
    const work = renderCompletion(state);
    expect(work).not.toContain('Afslut Niveau 1');
    expect(work).not.toContain('Kontrollér A');
    expect(work).toContain('readOnly');
    expect(take(state, { type: 'editFinalBalance', account: '4410', formula: '=1+1' })).toBe(state);
  });

  it('restores formulas, posting lines, checks, and completed state from persistence', () => {
    let state = approveBalances(atCompletion(r1));
    state = take(state, { type: 'runFinalChecks' });
    state = take(state, { type: 'finishLevel1' });
    const adapter = createMemorySessionStorage();
    expect(saveStudentSession(adapter, state).status).toBe('saved');
    const restored = loadStudentSession(adapter);
    expect(restored.status).toBe('restored');
    if (restored.status !== 'restored') throw new Error('Restore failed');
    expect(restored.state.classification.fields).toEqual(state.classification.fields);
    expect(restored.state.classification.shortTermAnswer).toBe(state.classification.shortTermAnswer);
    expect(restored.state.classification.reclassification.lines).toEqual(state.classification.reclassification.lines);
    expect(restored.state.completion).toEqual(state.completion);
    expect(restored.state.sessionStatus).toBe('completed');
  });

  it('restores an older v2 session without Step 5 work using safe defaults', () => {
    const snapshot = serializeStudentSession(atClassification(r1)) as Record<string, unknown>;
    const studentState = snapshot.studentState as Record<string, unknown>;
    delete studentState.classification;
    const restored = deserializeStudentSession(snapshot);
    expect(restored.status).toBe('restored');
    if (restored.status !== 'restored') throw new Error('Restore failed');
    expect(restored.state.classification.fields).toEqual({});
    expect(restored.state.classification.shortTermAnswer).toBeNull();
    expect(classificationStage(restored.state)).toBe('shortTerm');
  });
});
