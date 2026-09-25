import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { ClassificationStep } from '../../src/components/ClassificationStep';
import { CompletionStep } from '../../src/components/CompletionStep';
import { calculateLoan } from '../../src/domain';
import { createMemorySessionStorage, loadStudentSession, saveStudentSession } from '../../src/persistence';
import { STUDENT_STEPS, applyStudentAction, classificationStage, createStudentState } from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import type { StudentPostingLine } from '../../src/validation';
import { r1 } from '../fixtures/r1';
import { r6 } from '../fixtures/r6';
import type { GoldenFixture } from '../fixtures/types';

const take = (state: StudentState, action: StudentAction) => {
  const next = applyStudentAction(state, action);
  return next.sessionStatus === 'active' && next.viewingStep === next.currentStep && next.completedSteps.includes(next.currentStep) ? applyStudentAction(next, { type: 'continueToNextStep' }) : next;
};
const dk = (value: string) => value.replace('.', ',');
const formula = (value: { toFixed(scale: number): string }) => `=${dk(value.toFixed(2))}+0`;
const renderClassification = (state: StudentState) => renderToStaticMarkup(createElement(ClassificationStep, { state, onAction: () => {}, readOnly: state.currentStep !== 'classification' || state.sessionStatus === 'completed' }));
const renderCompletion = (state: StudentState) => renderToStaticMarkup(createElement(CompletionStep, { state, onAction: () => {}, readOnly: state.sessionStatus === 'completed' }));

function atClassification(fixture: GoldenFixture): StudentState {
  const state = createStudentState({ generatorVersion: '1.0.0', seed: 91, loanType: fixture.input.loanType, attempts: 1, caseInput: fixture.input });
  return { ...state, currentStep: 'classification', viewingStep: 'classification', completedSteps: [...STUDENT_STEPS.slice(0, 6)] };
}

function throughUpcoming(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  state = take(state, { type: 'editClassificationField', field: 'carryingAmount', raw: dk(model.classification.carryingAmount.toFixed(2)) });
  state = take(state, { type: 'checkClassificationField', field: 'carryingAmount' });
  for (const row of model.contract.rows.filter((entry) => entry.date > '2026-12-31' && entry.date <= '2027-12-31')) {
    state = take(state, { type: 'editUpcomingRepayment', term: row.term, raw: dk(row.principalRepayment.toFixed(2)) });
    state = take(state, { type: 'checkUpcomingRepayment', term: row.term });
  }
  return state;
}

function throughDistribution(state: StudentState): StudentState {
  state = throughUpcoming(state);
  const expected = calculateLoan(state.generatedCase.caseInput).classification;
  for (const name of ['shortTerm', 'longTerm'] as const) {
    state = take(state, { type: 'editClassificationField', field: name, raw: formula(expected[name]) });
    state = take(state, { type: 'checkClassificationField', field: name });
  }
  return take(state, { type: 'checkClassification' });
}

function throughClassification(fixture: GoldenFixture): StudentState {
  let state = throughDistribution(atClassification(fixture));
  const model = calculateLoan(fixture.input);
  if (model.classification.reclassificationRequired) {
    const event = model.postingEvents.find((entry) => entry.kind === 'reclassification')!;
    const lines: StudentPostingLine[] = event.movements.map((entry) => ({
      account: entry.account, side: entry.amount.isNegative() ? 'K' : 'D', amount: dk(entry.amount.abs().toFixed(2)),
    }));
    state = take(state, { type: 'setReclassificationBlock', lines });
    return take(state, { type: 'checkReclassification' });
  }
  state = take(state, { type: 'setReclassificationAnswer', answer: 'no' });
  return take(state, { type: 'checkReclassificationAnswer' });
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
  it('starts with only the carrying amount and does not expose upcoming answers', () => {
    const state = atClassification(r1);
    const html = renderClassification(state);
    expect(html).toContain('Samlet amortiseret kostpris');
    expect(html).not.toContain('Kortfristet del = summen');
    expect(html).not.toContain(dk(state.caseResult.classification.shortTerm.toFixed(2)));
    expect(state.caseResult.accountBalances).toBeNull();
  });

  it('asks for contractual principal repayments dated after 2026 through 2027', () => {
    const state = throughUpcoming(atClassification(r1));
    const html = renderClassification(state);
    const matching = state.caseResult.contract.rows.filter((row) => row.date > '2026-12-31' && row.date <= '2027-12-31');
    expect(Object.keys(state.classification.upcomingRepayments)).toHaveLength(matching.length);
    for (const row of matching) expect(html).toContain(`Termin ${row.term}`);
    expect(html).toContain('kontraktuelle');
    expect(classificationStage(state)).toBe('shortTerm');
  });

  it('requires a real equals calculation for the short and long portions', () => {
    let state = throughUpcoming(atClassification(r1));
    const expected = calculateLoan(r1.input).classification.shortTerm;
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: dk(expected.toFixed(2)) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(state.classification.fields.shortTerm?.errorCode).toBe('MISSING_EQUALS');
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: formula(expected) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(classificationStage(state)).toBe('longTerm');
    expect(state.caseResult.accountBalances).toBeNull();
  });

  it('requires the posting block when the short portion is positive', () => {
    let state = throughDistribution(atClassification(r1));
    expect(classificationStage(state)).toBe('reclassification');
    expect(renderClassification(state)).toContain('Kontrollér postering');
    expect(take(state, { type: 'setReclassificationAnswer', answer: 'no' })).toBe(state);
    state = take(state, { type: 'checkReclassification' });
    expect(state.currentStep).toBe('classification');
    expect(state.caseResult.accountBalances).toBeNull();
  });

  it('accepts Nej for a zero short portion without creating a zero posting', () => {
    let state = throughDistribution(atClassification(r6));
    expect(classificationStage(state)).toBe('noReclassification');
    state = take(state, { type: 'setReclassificationAnswer', answer: 'yes' });
    state = take(state, { type: 'checkReclassificationAnswer' });
    expect(state.currentStep).toBe('classification');
    expect(renderClassification(state)).toContain('Beregningen stemmer ikke endnu.');
    state = take(state, { type: 'setReclassificationAnswer', answer: 'no' });
    state = take(state, { type: 'checkReclassificationAnswer' });
    expect(state.currentStep).toBe('completion');
    expect(state.classification.reclassification.lines).toEqual([]);
    expect(state.caseResult.postingEvents.some((event) => event.kind === 'reclassification')).toBe(false);
  });

  it('shows noBalance read-only and creates final balances only in step eight', () => {
    const state = throughClassification(r6);
    expect(state.caseResult.accountBalances).not.toBeNull();
    expect(state.completion.balances['6760']).toBeUndefined();
    const html = renderCompletion(state);
    expect(html).toContain('Ingen saldo');
    expect(html).not.toContain('balance-6760');
    expect(take(state, { type: 'editFinalBalance', account: '6760', formula: '=0+0' })).toBe(state);
  });

  it('requires both an equals formula and a separate correct D/K choice', () => {
    let state = throughClassification(r1);
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
    let state = throughClassification(r1);
    expect(take(state, { type: 'runFinalChecks' })).toBe(state);
    state = approveBalances(state);
    expect(renderCompletion(state)).toContain('0 af 3 kontroller korrekte');
    for (const check of ['debtReconciles', 'financialExpenseReconciles', 'accountsReconcile'] as const) {
      state = take(state, { type: 'runFinalChecks', check });
    }
    expect(renderCompletion(state)).toContain('3 af 3 kontroller korrekte');
    expect(renderCompletion(state)).toContain('Afslut Niveau 1');
    expect(state.sessionStatus).toBe('active');
    expect(state.completedSteps).toHaveLength(7);
  });

  it('shows the completed summary and keeps the finished work read-only', () => {
    let state = approveBalances(throughClassification(r1));
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
    let state = approveBalances(throughClassification(r1));
    state = take(state, { type: 'runFinalChecks' });
    state = take(state, { type: 'finishLevel1' });
    const adapter = createMemorySessionStorage();
    expect(saveStudentSession(adapter, state).status).toBe('saved');
    const restored = loadStudentSession(adapter);
    expect(restored.status).toBe('restored');
    if (restored.status !== 'restored') throw new Error('Restore failed');
    expect(restored.state.classification.fields).toEqual(state.classification.fields);
    expect(restored.state.classification.reclassification.lines).toEqual(state.classification.reclassification.lines);
    expect(restored.state.completion).toEqual(state.completion);
    expect(restored.state.sessionStatus).toBe('completed');
  });
});
