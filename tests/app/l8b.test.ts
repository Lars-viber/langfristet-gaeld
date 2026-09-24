import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { transitionStudentSession } from '../../src/app/controller';
import { createMemorySessionStorage, loadStudentSession } from '../../src/persistence';
import {
  applyStudentAction, createStudentState, cashFlowRowStatus, scheduleRowStatus,
} from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';
import { r3 } from '../fixtures/r3';
import { r5 } from '../fixtures/r5';
import type { GoldenFixture } from '../fixtures/types';

const take = (state: StudentState, action: StudentAction) => applyStudentAction(state, action);
const render = (state: StudentState) => renderToStaticMarkup(createElement(AppShell, {
  state, onAction: () => {}, onReset: () => {}, onNewCase: () => {},
}));
const number = (value: { toFixed(places: number): string }) => value.toFixed(2).replace('.', ',');
const formula = (value: { toFixed(places: number): string }) => `=${number(value)}+0`;

function atSchedule(fixture: GoldenFixture): StudentState {
  let state = createStudentState({
    generatorVersion: '1.0.0', seed: 29, loanType: fixture.input.loanType,
    attempts: 1, caseInput: fixture.input,
  });
  if (state.caseResult.proceeds.financingType !== 'bank') throw new Error('Test requires a bank case');
  state = take(state, { type: 'editProceedsFormula', field: 'variableCost',
    raw: formula(state.caseResult.proceeds.variableCost) });
  state = take(state, { type: 'checkProceedsField', field: 'variableCost' });
  state = take(state, { type: 'editProceedsFormula', field: 'proceeds',
    raw: formula(state.caseResult.proceeds.proceeds) });
  state = take(state, { type: 'checkProceedsField', field: 'proceeds' });
  const event = state.caseResult.postingEvents.find((entry) => entry.kind === 'origination')!;
  state = take(state, { type: 'setInitialRecognitionLines', lines: event.movements.map((movement) => ({
    account: movement.account,
    side: movement.amount.isNegative() ? 'K' : 'D',
    amount: number(movement.amount.abs()),
  })) });
  state = take(state, { type: 'checkInitialRecognition' });
  expect(state.currentStep).toBe('contractSchedule');
  return state;
}

function approvePrerequisites(state: StudentState): StudentState {
  const input = state.generatedCase.caseInput;
  const checks = [
    ['termCount', `=${input.years}*${input.paymentsPerYear}`],
    ['termRate', `=${input.nominalAnnualRate.replace('.', ',')}/${input.paymentsPerYear}`],
    ...(input.loanType === 'serial'
      ? [['fixedRepayment', `=${input.nominalPrincipal.replace('.', ',')}/${input.years * input.paymentsPerYear}`]]
      : []),
  ] as Array<['termCount' | 'termRate' | 'fixedRepayment', string]>;
  for (const [field, raw] of checks) {
    state = take(state, { type: 'editSchedulePrerequisite', field, raw });
    state = take(state, { type: 'checkSchedulePrerequisite', field });
    expect(state.schedule.prerequisites[field], field).toMatchObject({ approved: true, errorCode: null });
  }
  return state;
}

function approveScheduleRow(state: StudentState, term: number): StudentState {
  const expected = state.caseResult.contract.rows[term - 1]!;
  const fields = ['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'] as const;
  for (const field of fields) {
    if (field === 'payment' && state.generatedCase.loanType === 'annuity') continue;
    state = take(state, { type: 'editScheduleField', term, field, raw: formula(expected[field]) });
  }
  state = take(state, { type: 'checkScheduleRow', term });
  expect(state.schedule.approvedTerms).toContain(term);
  return state;
}

function atEffectiveInterest(fixture: GoldenFixture): StudentState {
  let state = approvePrerequisites(atSchedule(fixture));
  if (fixture.input.loanType === 'annuity') state = take(state, { type: 'calculateAnnuityPayment' });
  const last = state.caseResult.contract.rows.length;
  for (const term of [1, 2, ...(fixture.input.loanType === 'bullet' ? [last] : [])]) {
    state = approveScheduleRow(state, term);
  }
  state = take(state, { type: 'calculateRemainingSchedule' });
  expect(state.currentStep).toBe('effectiveInterest');
  return state;
}

function approveCashFlow(state: StudentState, term: number): StudentState {
  const expected = state.caseResult.cashFlows[term]!;
  state = take(state, { type: 'editCashFlowRow', term, amount: number(expected.amount),
    sign: expected.direction === 'inflow' ? '+' : '-' });
  state = take(state, { type: 'checkCashFlowRow', term });
  expect(state.effectiveInterest.approvedTerms).toContain(term);
  return state;
}

describe('L8B payment schedule and effective interest UI', () => {
  it('requires manual equals calculations before opening the annuity payment action', () => {
    let state = atSchedule(r1);
    expect(render(state)).not.toContain('2.113.445,63');
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termCount', raw: '4' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termCount' });
    expect(state.schedule.prerequisites.termCount?.errorCode).toBe('MISSING_EQUALS');
    expect(scheduleRowStatus(state, 1)).toBe('locked');
    expect(render(state)).toContain('Brug = til at foretage beregningen.');
  });

  it('uses calculateAnnuityPayment and then opens exactly the first manual row', () => {
    let state = approvePrerequisites(atSchedule(r1));
    expect(scheduleRowStatus(state, 1)).toBe('locked');
    expect(render(state)).toContain('Beregn ydelse');
    state = take(state, { type: 'calculateAnnuityPayment' });
    expect(state.schedule.annuityPaymentCalculated).toBe(true);
    expect(scheduleRowStatus(state, 1)).toBe('active');
    expect(scheduleRowStatus(state, 2)).toBe('locked');
    expect(render(state)).toContain('Ydelse pr. termin:');
  });

  it('locks approved fields within an active row and keeps the next row locked', () => {
    let state = approvePrerequisites(atSchedule(r3));
    const row = state.caseResult.contract.rows[0]!;
    state = take(state, { type: 'editScheduleField', term: 1,
      field: 'openingPrincipal', raw: formula(row.openingPrincipal) });
    state = take(state, { type: 'checkScheduleRow', term: 1 });
    expect(state.schedule.rows[1]?.openingPrincipal?.approved).toBe(true);
    expect(state.schedule.rows[1]?.payment?.approved).toBe(false);
    const attempted = take(state, { type: 'editScheduleField', term: 1,
      field: 'openingPrincipal', raw: '=1+1' });
    expect(attempted).toBe(state);
    expect(scheduleRowStatus(state, 2)).toBe('locked');
    expect(render(state)).toContain('1 af 5 felter godkendt');
  });

  it('advances annuity rows one by one and shows app calculated remainder only after the action', () => {
    let state = approvePrerequisites(atSchedule(r1));
    state = take(state, { type: 'calculateAnnuityPayment' });
    state = approveScheduleRow(state, 1);
    expect(scheduleRowStatus(state, 2)).toBe('active');
    expect(render(state)).not.toContain('3768833,09');
    state = approveScheduleRow(state, 2);
    expect(scheduleRowStatus(state, 3)).toBe('locked');
    state = take(state, { type: 'calculateRemainingSchedule' });
    expect(state.currentStep).toBe('effectiveInterest');
    expect(scheduleRowStatus(state, 3)).toBe('appCalculated');
    const history = take(state, { type: 'viewHistoricalStep', step: 'contractSchedule' });
    expect(render(history)).toContain('3768833,09');
    expect(render(history)).toContain('Kun visning');
  });

  it('uses manual fixed repayment for serial loans and then calculates the remaining rows', () => {
    let state = atSchedule(r3);
    expect(render(state)).toContain('Fast afdrag pr. termin');
    expect(render(state)).not.toContain('Beregn ydelse');
    state = approvePrerequisites(state);
    state = approveScheduleRow(state, 1);
    state = approveScheduleRow(state, 2);
    state = take(state, { type: 'calculateRemainingSchedule' });
    expect(state.schedule.remainingCalculated).toBe(true);
    expect(scheduleRowStatus(state, 3)).toBe('appCalculated');
  });

  it('requires the last bullet schedule row manually before calculating the middle', () => {
    let state = approvePrerequisites(atSchedule(r5));
    const last = state.caseResult.contract.rows.length;
    expect(render(state)).not.toContain('Beregn ydelse');
    state = approveScheduleRow(state, 1);
    state = approveScheduleRow(state, 2);
    expect(scheduleRowStatus(state, last)).toBe('active');
    expect(take(state, { type: 'calculateRemainingSchedule' })).toBe(state);
    state = approveScheduleRow(state, last);
    state = take(state, { type: 'calculateRemainingSchedule' });
    expect(scheduleRowStatus(state, 3)).toBe('appCalculated');
  });

  it('separates positive amount from sign and rejects a correct amount with the wrong sign', () => {
    let state = atEffectiveInterest(r1);
    const amount = number(state.caseResult.cashFlows[0]!.amount);
    state = take(state, { type: 'editCashFlowRow', term: 0, amount, sign: '-' });
    state = take(state, { type: 'checkCashFlowRow', term: 0 });
    expect(state.effectiveInterest.rows[0]?.approved).toBe(false);
    expect(state.effectiveInterest.rows[0]?.errorCode).toBe('WRONG_SIGN');
    expect(render(state)).toContain('Kontrollér fortegnet.');
    expect(render(state)).toContain('Positivt beløb');
    state = take(state, { type: 'editCashFlowRow', term: 0, sign: '+' });
    state = take(state, { type: 'checkCashFlowRow', term: 0 });
    expect(state.effectiveInterest.rows[0]?.approved).toBe(true);
  });

  it('gates IA until annuity t0, t1 and t2 are approved and app rows are calculated', () => {
    let state = atEffectiveInterest(r1);
    expect(cashFlowRowStatus(state, 0)).toBe('active');
    expect(render(state)).not.toContain('10,7642 %');
    state = approveCashFlow(state, 0);
    expect(cashFlowRowStatus(state, 1)).toBe('active');
    state = approveCashFlow(state, 1);
    expect(cashFlowRowStatus(state, 2)).toBe('active');
    state = approveCashFlow(state, 2);
    expect(take(state, { type: 'calculateEffectiveRate' })).toBe(state);
    state = take(state, { type: 'calculateRemainingCashFlows' });
    expect(cashFlowRowStatus(state, 3)).toBe('appCalculated');
    expect(render(state)).not.toContain('10,7642 %');
    state = take(state, { type: 'calculateEffectiveRate' });
    expect(state.currentStep).toBe('amortizedCost');
    expect(state.effectiveInterest.rateCalculated).toBe(true);
  });

  it('applies t0, t1 and t2 progression to serial cash flows', () => {
    let state = atEffectiveInterest(r3);
    for (const term of [0, 1, 2]) state = approveCashFlow(state, term);
    state = take(state, { type: 'calculateRemainingCashFlows' });
    expect(cashFlowRowStatus(state, 3)).toBe('appCalculated');
    expect(state.effectiveInterest.remainingCalculated).toBe(true);
  });

  it('requires the final bullet cash flow after t2', () => {
    let state = atEffectiveInterest(r5);
    const last = state.caseResult.cashFlows.length - 1;
    for (const term of [0, 1, 2]) state = approveCashFlow(state, term);
    expect(cashFlowRowStatus(state, last)).toBe('active');
    expect(take(state, { type: 'calculateRemainingCashFlows' })).toBe(state);
    state = approveCashFlow(state, last);
    state = take(state, { type: 'calculateRemainingCashFlows' });
    expect(cashFlowRowStatus(state, 3)).toBe('appCalculated');
  });

  it('restores formulas, signs, app rows and the full precision IA result in read-only history', () => {
    const adapter = createMemorySessionStorage();
    let state = atEffectiveInterest(r1);
    for (const term of [0, 1, 2]) state = approveCashFlow(state, term);
    state = transitionStudentSession(adapter, state, { type: 'calculateRemainingCashFlows' }).state;
    state = transitionStudentSession(adapter, state, { type: 'calculateEffectiveRate' }).state;
    const loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.schedule.annuityPaymentCalculated).toBe(true);
    expect(loaded.state.schedule.rows[1]?.openingPrincipal?.raw).toBe(
      formula(state.caseResult.contract.rows[0]!.openingPrincipal));
    expect(loaded.state.schedule.remainingCalculated).toBe(true);
    expect(loaded.state.effectiveInterest.rows[0]?.sign).toBe('+');
    expect(loaded.state.effectiveInterest.rows[1]?.sign).toBe('-');
    expect(loaded.state.effectiveInterest.remainingCalculated).toBe(true);
    expect(loaded.state.effectiveInterest.rateCalculated).toBe(true);
    expect(loaded.state.caseResult.effectiveInterest.rate.toString()).toBe(
      state.caseResult.effectiveInterest.rate.toString());
    expect(loaded.state.caseResult.effectiveInterest.rate.toString()).not.toBe(
      loaded.state.caseResult.effectiveInterest.displayedPercent);
    const history = take(loaded.state, { type: 'viewHistoricalStep', step: 'effectiveInterest' });
    const html = render(history);
    expect(html).toContain('10,7642 %');
    expect(html).toContain('Kun visning');
    expect(html).not.toContain('Kontrollér termin 0');
  });
});
