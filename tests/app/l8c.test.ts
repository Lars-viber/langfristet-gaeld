import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { transitionStudentSession } from '../../src/app/controller';
import { createMemorySessionStorage, loadStudentSession } from '../../src/persistence';
import { amortizationSubrowStatus, applyStudentAction, createStudentState, deriveStudentView } from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import type { StudentPostingLine } from '../../src/validation';
import { r1 } from '../fixtures/r1';
import { r3 } from '../fixtures/r3';
import { r5 } from '../fixtures/r5';
import type { GoldenFixture } from '../fixtures/types';

const take = (state: StudentState, action: StudentAction) => {
  const next = applyStudentAction(state, action);
  return next.sessionStatus === 'active' && next.viewingStep === next.currentStep && next.completedSteps.includes(next.currentStep) ? applyStudentAction(next, { type: 'continueToNextStep' }) : next;
};
const render = (state: StudentState) => renderToStaticMarkup(createElement(AppShell, {
  state, onAction: () => {}, onReset: () => {}, onNewCase: () => {},
}));
const number = (value: { toFixed(places: number): string }) => value.toFixed(2).replace('.', ',');
const formula = (value: { toFixed(places: number): string }) => `=${number(value)}+0`;

function atStep5(fixture: GoldenFixture): StudentState {
  const state = createStudentState({
    generatorVersion: '1.0.0', seed: 29, loanType: fixture.input.loanType,
    attempts: 1, caseInput: fixture.input,
  });
  // Earlier steps are covered by L8A/L8B; focus this fixture on the Step 5 boundary.
  return { ...state, currentStep: 'amortizedCost', viewingStep: 'amortizedCost',
    completedSteps: ['proceeds', 'initialRecognition', 'contractSchedule', 'effectiveInterest'] };
}

function approveSubrow(state: StudentState, term: number, subtable: 'income' | 'balance'): StudentState {
  const row = subtable === 'income' ? state.caseResult.incomeSchedule[term - 1]! : state.caseResult.carryingSchedule[term - 1]!;
  const fields = subtable === 'income'
    ? ['nominalInterest', 'amortization', 'totalInterestExpense'] as const
    : ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'] as const;
  for (const field of fields) {
    state = take(state, { type: 'editAmortizationField', term, subtable, field, raw: formula((row as unknown as Record<string, { toFixed(places: number): string }>)[field]!) });
  }
  state = take(state, { type: 'checkAmortizationSubrow', term, subtable });
  expect(state.amortization.terms[term]?.[`${subtable}Approved`]).toBe(true);
  return state;
}

function atStep6(fixture: GoldenFixture): StudentState {
  let state = atStep5(fixture);
  for (const term of [1, 2]) {
    state = approveSubrow(state, term, 'income');
    state = approveSubrow(state, term, 'balance');
  }
  state = take(state, { type: 'calculateRemainingAmortization' });
  expect(state.currentStep).toBe('yearBookkeeping');
  return state;
}

function eventLines(state: StudentState, term: number, kind: 'payment' | 'amortization'): StudentPostingLine[] {
  const event = state.caseResult.postingEvents.find((entry) => entry.kind === kind && entry.term === term)!;
  return event.movements.map((movement) => ({ account: movement.account,
    side: movement.amount.isNegative() ? 'K' : 'D', amount: number(movement.amount.abs()) }));
}

function approveBlock(state: StudentState, term: number, block: 'payment' | 'amortization', lines = eventLines(state, term, block)): StudentState {
  state = take(state, { type: 'setBookkeepingBlock', term, block, lines });
  state = take(state, { type: 'checkBookkeepingBlock', term, block });
  expect(state.bookkeeping[term]?.[block].approved).toBe(true);
  return state;
}

describe('L8C amortization and year bookkeeping', () => {
  it('starts with result term 1 and keeps both tables in fixed column order without leaking answers', () => {
    const state = atStep5(r1);
    const html = render(state);
    expect(deriveStudentView(state)).toMatchObject({ activeAmortizationTerm: 1, activeAmortizationSubtable: 'income' });
    expect(html).toMatch(/Termin<\/th><th scope="col">Dato<\/th><th scope="col">Nominel rente<\/th><th scope="col">Amortisering<\/th><th scope="col">Renteomkostning i alt/);
    expect(html).toMatch(/Termin<\/th><th scope="col">Dato<\/th><th scope="col">Kostpris primo<\/th><th scope="col">Afdrag<\/th><th scope="col">Amortisering<\/th><th scope="col">Kostpris ultimo/);
    expect(html).not.toContain('149.359,86');
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('locked');
  });

  it('locks only correct fields in an active result row', () => {
    let state = atStep5(r1);
    state = take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'nominalInterest', raw: '=560000+0' });
    state = take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'amortization', raw: '=1+1' });
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(state.amortization.terms[1]?.income.nominalInterest?.approved).toBe(true);
    expect(state.amortization.terms[1]?.income.amortization?.approved).toBe(false);
    expect(take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'nominalInterest', raw: '=2+2' })).toBe(state);
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('locked');
    expect(render(state)).toContain('1 af 3 felter godkendt');
  });

  it('opens balance term 1 only after the complete result row', () => {
    let state = atStep5(r1);
    state = approveSubrow(state, 1, 'income');
    expect(amortizationSubrowStatus(state, 1, 'income')).toBe('approved');
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('active');
    expect(amortizationSubrowStatus(state, 2, 'income')).toBe('locked');
  });

  it('progresses result T1, balance T1, result T2, balance T2, then app remainder', () => {
    let state = atStep5(r3);
    for (const term of [1, 2]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
      expect(state.amortization.terms[term]?.approved).toBe(true);
    }
    expect(render(state)).toContain('Beregn resterende terminer efter samme princip');
    state = take(state, { type: 'calculateRemainingAmortization' });
    expect(state.currentStep).toBe('yearBookkeeping');
    expect(amortizationSubrowStatus(state, 3, 'income')).toBe('appCalculated');
    const history = take(state, { type: 'viewHistoricalStep', step: 'amortizedCost' });
    expect(render(history)).toContain('Beregnet af appen');
    expect(render(history)).toContain('Kun visning');
  });

  it('has no final manual amortization term for a standing loan', () => {
    let state = atStep5(r5);
    for (const term of [1, 2]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
    }
    expect(amortizationSubrowStatus(state, 20, 'income')).toBe('locked');
    state = take(state, { type: 'calculateRemainingAmortization' });
    expect(amortizationSubrowStatus(state, 20, 'income')).toBe('appCalculated');
  });

  it('accepts the full precision IA reference and preserves raw formulas through restore', () => {
    const adapter = createMemorySessionStorage();
    let state = atStep5(r1);
    state = transitionStudentSession(adapter, state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'totalInterestExpense', raw: '=6.590.000*[Effektiv rente · fuld præcision]' }).state;
    state = transitionStudentSession(adapter, state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' }).state;
    expect(state.amortization.terms[1]?.income.totalInterestExpense?.approved).toBe(true);
    expect(state.amortization.terms[1]?.income.nominalInterest?.approved).toBe(false);
    const loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.amortization.terms[1]?.income.totalInterestExpense?.raw).toBe('=6.590.000*[Effektiv rente · fuld præcision]');
    expect(deriveStudentView(loaded.state).activeAmortizationSubtable).toBe('income');
    expect(loaded.state.caseResult.effectiveInterest.rate.toString()).toBe(state.caseResult.effectiveInterest.rate.toString());
  });

  it('shows only actual 2026 terms and gates amortization behind payment', () => {
    const state = atStep6(r1);
    const html = render(state);
    expect(state.caseResult.actual2026Terms).toHaveLength(1);
    expect(html).toContain('1 faktisk termin i 2026');
    expect(html).toContain('Ydelse/betaling');
    expect(html).toContain('Amortiseringsblokken åbner');
    expect(html).not.toContain('2. Amortisering');
    expect(html).not.toContain('Saldo Bankkonto');
    expect(html).not.toContain('Indsæt rente');
  });

  it('keeps every line editable after a wrong payment block', () => {
    let state = atStep6(r1);
    state = take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: [
      { account: '4410', side: 'D', amount: '560000' },
      { account: '5820', side: 'K', amount: '1' },
    ] });
    state = take(state, { type: 'checkBookkeepingBlock', term: 1, block: 'payment' });
    expect(state.bookkeeping[1]?.payment.approved).toBe(false);
    expect(state.bookkeeping[1]?.payment.errors.length).toBeGreaterThan(0);
    const html = render(state);
    expect(html).toContain('Slet linje');
    expect(html).toContain('Tilføj linje');
    expect(html).not.toContain('2. Amortisering');
  });

  it('accepts split gross lines by net movement and locks the complete payment block', () => {
    let state = atStep6(r1);
    const lines: StudentPostingLine[] = [
      { account: '4410', side: 'D', amount: '560100' },
      { account: '4410', side: 'K', amount: '100' },
      { account: '6320', side: 'D', amount: '1553445,63' },
      { account: '5820', side: 'K', amount: '2113445,63' },
    ];
    state = approveBlock(state, 1, 'payment', lines);
    expect(state.bookkeeping[1]?.payment.lines).toEqual(lines);
    expect(take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: [] })).toBe(state);
    const html = render(state);
    expect(html).toContain('2. Amortisering');
    expect(html).toContain('Hele posteringen godkendt');
    expect(html).not.toContain('Slet linje');
  });

  it('does not require a zero-principal line on ordinary standing-loan payments', () => {
    let state = atStep6(r5);
    expect(state.caseResult.actual2026Terms).toHaveLength(4);
    const lines = eventLines(state, 1, 'payment');
    expect(lines).toHaveLength(2);
    expect(lines.some((line) => line.account === '6320')).toBe(false);
    state = approveBlock(state, 1, 'payment', lines);
    expect(state.bookkeeping[1]?.payment.approved).toBe(true);
  });

  it('opens multiple actual terms in order and restores original lines in read-only history', () => {
    const adapter = createMemorySessionStorage();
    let state = atStep6(r3);
    expect(state.caseResult.actual2026Terms).toHaveLength(2);
    expect(deriveStudentView(state).activeBookkeepingTerm).toBe(1);
    const firstLines = eventLines(state, 1, 'payment');
    state = transitionStudentSession(adapter, state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: firstLines }).state;
    state = transitionStudentSession(adapter, state, { type: 'checkBookkeepingBlock', term: 1, block: 'payment' }).state;
    state = approveBlock(state, 1, 'amortization');
    expect(deriveStudentView(state).activeBookkeepingTerm).toBe(2);
    state = approveBlock(state, 2, 'payment');
    state = approveBlock(state, 2, 'amortization');
    expect(state.currentStep).toBe('classification');
    state = transitionStudentSession(adapter, state, { type: 'viewHistoricalStep', step: 'yearBookkeeping' }).state;
    const loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.bookkeeping[1]?.payment.lines).toEqual(firstLines);
    expect(loaded.state.viewingStep).toBe('yearBookkeeping');
    expect(loaded.state.currentStep).toBe('classification');
    const html = render(loaded.state);
    expect(html).toContain('Kun visning');
    expect(html).toContain('Bogføring af termin 2');
    expect(html).not.toContain('Tilføj linje');
    expect(html).not.toContain('Saldo Bankkonto');
  });
});
