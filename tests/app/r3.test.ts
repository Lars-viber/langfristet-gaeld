import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { EffectiveInterestStep } from '../../src/components/EffectiveInterestStep';
import { deserializeStudentSession, serializeStudentSession } from '../../src/persistence';
import { applyStudentAction, cashFlowRowStatus, createStudentState } from '../../src/student';
import type { StudentState } from '../../src/student';
import type { GoldenFixture } from '../fixtures/types';
import { r1 } from '../fixtures/r1';
import { r3 } from '../fixtures/r3';
import { r6 } from '../fixtures/r6';

function step3(fixture: GoldenFixture): StudentState {
  const state = createStudentState({ generatorVersion: '1.0.0', seed: 1, loanType: fixture.input.loanType, attempts: 1, caseInput: fixture.input });
  return { ...state, currentStep: 'effectiveInterest', viewingStep: 'effectiveInterest', completedSteps: ['proceeds', 'contractSchedule'],
    proceeds: { ...state.proceeds, proceeds: { raw: '=1+1', approved: true, errorCode: null } },
    schedule: { ...state.schedule, remainingCalculated: true } };
}
const edit = (state: StudentState, term: number, amount: string, sign: '+' | '-') => applyStudentAction(state, { type: 'editCashFlowRow', term, amount, sign });
const check = (state: StudentState, term: number) => applyStudentAction(state, { type: 'checkCashFlowRow', term });
function approve(state: StudentState, term: number): StudentState {
  const row = state.caseResult.cashFlows[term]!;
  return check(edit(state, term, row.amount.toFixed(2).replace('.', ','), term === 0 ? '+' : '-'), term);
}
const html = (state: StudentState) => renderToStaticMarkup(createElement(EffectiveInterestStep, { state, onAction: () => {}, readOnly: false }));

describe('R3 effective interest', () => {
  it('requires the entered positive proceeds and separate correct sign in term 0', () => {
    let state = step3(r1);
    expect(cashFlowRowStatus(state, 0)).toBe('active');
    expect(cashFlowRowStatus(state, 1)).toBe('locked');
    state = check(edit(state, 0, '-6590000', '+'), 0);
    expect(state.effectiveInterest.rows[0]?.errorCode).toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(html(state)).toContain('Indtast beløbet som et positivt beløb. Vælg fortegnet separat.');
    state = check(edit(state, 0, '6590000', '-'), 0);
    expect(state.effectiveInterest.rows[0]?.errorCode).toBe('WRONG_SIGN');
    expect(html(state)).toContain('Kontrollér fortegnet.');
    state = check(edit(state, 0, '1', '+'), 0);
    expect(state.effectiveInterest.rows[0]?.errorCode).toBe('WRONG_RESULT');
    expect(html(state)).toContain('Beregningen stemmer ikke endnu.');
    state = approve(state, 0);
    expect(state.effectiveInterest.approvedTerms).toEqual([0]);
    expect(cashFlowRowStatus(state, 1)).toBe('active');
  });

  it.each([r1, r3])('opens terms 1 and 2 in order and auto-calculates the visible payments for $id', (fixture) => {
    let state = step3(fixture);
    expect(applyStudentAction(state, { type: 'calculateEffectiveRate' })).toBe(state);
    state = approve(state, 0);
    const row1 = state.caseResult.cashFlows[1]!;
    state = check(edit(state, 1, row1.amount.toFixed(2).replace('.', ','), '+'), 1);
    expect(state.effectiveInterest.rows[1]?.errorCode).toBe('WRONG_SIGN');
    state = approve(state, 1);
    expect(cashFlowRowStatus(state, 2)).toBe('active');
    expect(state.effectiveInterest.remainingCalculated).toBe(false);
    state = approve(state, 2);
    expect(state.effectiveInterest.approvedTerms).toEqual([0, 1, 2]);
    expect(state.effectiveInterest.remainingCalculated).toBe(true);
    expect(cashFlowRowStatus(state, 3)).toBe('appCalculated');
    expect(state.caseResult.cashFlows[3]?.amount.toFixed(2)).toBe(state.caseResult.contract.rows[2]?.payment.toFixed(2));
    expect(state.caseResult.cashFlows.at(-1)?.amount.toFixed(2)).toBe(state.caseResult.contract.rows.at(-1)?.payment.toFixed(2));
    expect(html(state)).toContain(new Intl.NumberFormat('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(state.caseResult.contract.rows.at(-1)!.payment.toFixed(2))));
  });

  it('requires the standing-loan last term before auto-calculating intervening rows', () => {
    let state = step3(r6);
    for (const term of [0, 1, 2]) state = approve(state, term);
    expect(state.effectiveInterest.remainingCalculated).toBe(false);
    expect(cashFlowRowStatus(state, 3)).toBe('locked');
    expect(cashFlowRowStatus(state, 8)).toBe('active');
    expect(state.caseResult.cashFlows[8]?.amount.toFixed(2)).toBe('8200000.00');
    state = approve(state, 8);
    expect(state.effectiveInterest.remainingCalculated).toBe(true);
    expect(cashFlowRowStatus(state, 3)).toBe('appCalculated');
  });

  it('calculates the rate only on explicit action, preserves full precision and continues explicitly', () => {
    let state = step3(r1);
    for (const term of [0, 1, 2]) state = approve(state, term);
    expect(state.completedSteps).not.toContain('effectiveInterest');
    const before = state.currentStep;
    state = applyStudentAction(state, { type: 'calculateEffectiveRate' });
    expect(state.completedSteps).toContain('effectiveInterest');
    expect(state.currentStep).toBe(before);
    expect(state.viewingStep).toBe(before);
    expect(state.caseResult.effectiveInterest.displayedPercent).toMatch(/^\d+\.\d{4}$/);
    expect(state.caseResult.effectiveInterest.rate.toFixed().length).toBeGreaterThan(10);
    expect(html(state)).toContain('Effektiv rente pr. termin');
    expect(html(state)).toContain('Den viste rente er afrundet. Appen anvender den fulde beregnede præcision i de efterfølgende beregninger.');
    state = applyStudentAction(state, { type: 'continueToNextStep' });
    expect(state.currentStep).toBe('amortizedCost');
  });

  it('renders approved references, required instructions and compact historical action', () => {
    const current = step3(r1);
    const currentHtml = html(current);
    expect(currentHtml).toContain('Godkendt provenu');
    expect(currentHtml).toContain('6.590.000,00 kr.');
    expect(currentHtml).toContain('2.113.445,64 kr.');
    expect(currentHtml).toContain('Din opgave: Udfyld termin 0, termin 1 og termin 2.');
    expect(currentHtml).toMatch(/<th scope="col">Termin<\/th><th scope="col">Dato<\/th><th scope="col">Fortegn<\/th><th scope="col">Beløb<\/th>/);
    expect(currentHtml).toContain('placeholder="Indtast positivt beløb"');
    expect(currentHtml).toMatch(/class="interest-table-top"[^>]*>[\s\S]*Din opgave:[\s\S]*Kontrollér termin 0[\s\S]*<\/div>/);
    expect(currentHtml.match(/Kontrollér termin 0/g)).toHaveLength(1);
    expect(html(step3(r6))).toContain('termin 2 og sidste termin');
    const historical = { ...current, currentStep: 'amortizedCost' as const, viewingStep: 'effectiveInterest' as const,
      completedSteps: [...current.completedSteps, 'effectiveInterest' as const] };
    const shellHtml = renderToStaticMarkup(createElement(AppShell, { state: historical, onAction: () => {}, onReset: () => {}, onNewCase: () => {} }));
    expect(shellHtml).not.toContain('historical-banner');
    expect(shellHtml).toMatch(/class="interest-reference"[^>]*>[\s\S]*Tilbage til aktuelt trin[\s\S]*<\/aside>/);
    expect(shellHtml).not.toContain('Fortsæt til Amortiseret kostpris');
    expect(applyStudentAction(historical, { type: 'editCashFlowRow', term: 0, amount: '1' })).toBe(historical);
    expect(applyStudentAction(historical, { type: 'returnToCurrentStep' }).currentStep).toBe('amortizedCost');
  });

  it('restores Step 3 raw work, signs, approvals and full precision in v2', () => {
    let state = step3(r1);
    state = approve(state, 0);
    state = edit(state, 1, '2.113.445,63', '-');
    const stored = JSON.parse(JSON.stringify(serializeStudentSession(state)));
    expect(stored.schemaVersion).toBe(2);
    const result = deserializeStudentSession(stored);
    expect(result.status).toBe('restored');
    if (result.status !== 'restored') return;
    expect(result.state.effectiveInterest).toEqual(state.effectiveInterest);
    expect(result.state.caseResult.effectiveInterest.rate.toFixed()).toBe(state.caseResult.effectiveInterest.rate.toFixed());
    expect(result.state.currentStep).toBe('effectiveInterest');
    expect(result.state.viewingStep).toBe('effectiveInterest');
    delete stored.studentState.effectiveInterest;
    const older = deserializeStudentSession(stored);
    expect(older.status).toBe('restored');
    if (older.status === 'restored') expect(older.state.effectiveInterest).toEqual({ rows: {}, approvedTerms: [], remainingCalculated: false, rateCalculated: false });
  });
});
