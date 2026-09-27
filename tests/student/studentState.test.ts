import { describe, expect, it } from 'vitest';
import { calculateLoan, lastManualTermValues } from '../../src/domain';
import type { LoanResult, NetMovement } from '../../src/domain';
import type { GeneratedLevel1Case } from '../../src/generator';
import {
  applyStudentAction, canEditStep, canViewStep, classificationStage, createStudentState,
  deriveCompletedSummary, deriveStudentView, scheduleRowStatus, cashFlowRowStatus,
  amortizationSubrowStatus, resetCurrentCase, startNewCase, stepStatus,
  STUDENT_STATE_VERSION,
} from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import type { StudentPostingLine } from '../../src/validation';
import { r1 } from '../fixtures/r1';
import { r3 } from '../fixtures/r3';
import { r6 } from '../fixtures/r6';
import type { GoldenFixture } from '../fixtures/types';

function generated(fixture: GoldenFixture, seed = 1): GeneratedLevel1Case {
  return { generatorVersion: '1.0.0', seed, loanType: fixture.input.loanType, attempts: 1, caseInput: fixture.input };
}
function take(state: StudentState, action: StudentAction): StudentState {
  return applyStudentAction(state, action);
}
function dk(value: string): string { return value.replace('.', ','); }
function formula(value: { toFixed(scale: number): string }): string { return `=${dk(value.toFixed(2))}+0`; }
function lines(movements: readonly NetMovement[]): StudentPostingLine[] {
  return movements.filter((entry) => !entry.amount.isZero()).map((entry) => ({
    account: entry.account, side: entry.amount.isNegative() ? 'K' : 'D', amount: dk(entry.amount.abs().toFixed(2)),
  }));
}
function approveProceeds(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  const fields = model.proceeds.financingType === 'bank'
    ? [['variableCost', model.proceeds.variableCost], ['proceeds', model.proceeds.proceeds]] as const
    : [['marketValue', model.proceeds.marketValue], ['brokerage', model.proceeds.brokerage], ['proceeds', model.proceeds.proceeds]] as const;
  for (const [field, expected] of fields) {
    state = take(state, { type: 'editProceedsFormula', field, raw: formula(expected) });
    state = take(state, { type: 'checkProceedsField', field });
  }
  return state;
}
function approveSchedule(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  const prerequisites = [
    ['principal', dk(state.generatedCase.caseInput.nominalPrincipal)],
    ['termRate', `=${dk(state.generatedCase.caseInput.nominalAnnualRate)}/${state.generatedCase.caseInput.paymentsPerYear}`],
    ['termCount', `=${state.generatedCase.caseInput.years}*${state.generatedCase.caseInput.paymentsPerYear}`],
    ...(state.generatedCase.loanType === 'serial' ? [['fixedRepayment', formula(model.contract.standardPayment!)]] : []),
  ] as Array<['principal' | 'termCount' | 'termRate' | 'fixedRepayment', string]>;
  for (const [field, raw] of prerequisites) {
    state = take(state, { type: 'editSchedulePrerequisite', field, raw });
    state = take(state, { type: 'checkSchedulePrerequisite', field });
  }
  if (state.generatedCase.loanType === 'annuity') state = take(state, { type: 'calculateAnnuityPayment' });
  const count = model.contract.rows.length;
  const terms = state.generatedCase.loanType === 'bullet' ? [1, 2, count] : [1, 2];
  for (const term of terms) {
    const row = model.contract.rows[term - 1]!;
    const fields = state.generatedCase.loanType === 'annuity'
      ? ['openingPrincipal', 'nominalInterest', 'principalRepayment', 'closingPrincipal'] as const
      : state.generatedCase.loanType === 'serial'
        ? ['openingPrincipal', 'payment', 'nominalInterest', 'closingPrincipal'] as const
        : ['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'] as const;
    for (const field of fields) {
      const raw = field === 'openingPrincipal' || (state.generatedCase.loanType === 'bullet' && field === 'principalRepayment' && term !== count)
        ? dk(row[field].toFixed(2)) : formula(row[field]);
      state = take(state, { type: 'editScheduleField', term, field, raw });
    }
    state = take(state, { type: 'checkScheduleRow', term });
  }
  return state;
}
function atSchedule(fixture: GoldenFixture): StudentState {
  return take(approveProceeds(createStudentState(generated(fixture))), { type: 'continueToNextStep' });
}
function approveCashFlows(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  const count = model.contract.rows.length;
  for (const term of state.generatedCase.loanType === 'bullet' ? [0, 1, 2, count] : [0, 1, 2]) {
    const row = model.cashFlows[term]!;
    state = take(state, { type: 'editCashFlowRow', term, amount: dk(row.amount.toFixed(2)), sign: term === 0 ? '+' : '-' });
    state = take(state, { type: 'checkCashFlowRow', term });
  }
  state = take(state, { type: 'calculateRemainingCashFlows' });
  return take(state, { type: 'calculateEffectiveRate' });
}
function approveAmortization(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  const count = model.contract.rows.length;
  for (const term of state.generatedCase.loanType === 'bullet' ? [1, 2, count] : [1, 2]) {
    const income = model.incomeSchedule[term - 1]!;
    const ordinary = state.generatedCase.loanType === 'bullet' && term === count
      ? lastManualTermValues(income, model.carryingSchedule[term - 1]!, model.effectiveInterest.rate) : null;
    for (const field of ['nominalInterest', 'totalInterestExpense', 'amortization'] as const) {
      const value = ordinary && field !== 'nominalInterest' ? ordinary[field] : income[field];
      state = take(state, { type: 'editAmortizationField', term, subtable: 'income', field,
        raw: field === 'nominalInterest' ? dk(value.toFixed(2)) : formula(value) });
      state = take(state, { type: 'checkAmortizationSubrow', term, subtable: 'income' });
    }
    const balance = model.carryingSchedule[term - 1]!;
    for (const field of ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'] as const) {
      const value = ordinary && (field === 'amortization' || field === 'closingCarryingAmount') ? ordinary[field] : balance[field];
      state = take(state, { type: 'editAmortizationField', term, subtable: 'balance', field,
        raw: field === 'closingCarryingAmount' ? formula(value) : dk(value.toFixed(2)) });
    }
    state = take(state, { type: 'checkAmortizationSubrow', term, subtable: 'balance' });
  }
  return state;
}
function approveBookkeeping(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  for (const row of model.actual2026Terms) {
    for (const block of ['payment', 'amortization'] as const) {
      const event = model.postingEvents.find((entry) => entry.kind === block && entry.term === row.term)!;
      state = take(state, { type: 'setBookkeepingBlock', term: row.term, block, lines: lines(event.movements) });
      state = take(state, { type: 'checkBookkeepingBlock', term: row.term, block });
    }
  }
  return state;
}
function approveClassification(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  if (model.classification.shortTerm.isZero()) {
    state = take(state, { type: 'setShortTermAnswer', answer: 'no' });
    state = take(state, { type: 'checkShortTermAnswer' });
  } else {
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: formula(model.classification.shortTerm) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
  }
  state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: formula(model.classification.longTerm) });
  return take(state, { type: 'checkClassificationField', field: 'longTerm' });
}
function approveBalances(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  for (const expected of model.accountBalances) {
    if (expected.status === 'noBalance') continue;
    state = take(state, { type: 'editFinalBalance', account: expected.account, formula: formula(expected.amount), side: expected.side });
    state = take(state, { type: 'checkFinalBalance', account: expected.account });
  }
  return state;
}
function throughSchedule(fixture: GoldenFixture): StudentState {
  return take(approveSchedule(atSchedule(fixture)), { type: 'continueToNextStep' });
}
function throughAmortization(fixture: GoldenFixture): StudentState {
  return approveAmortization(take(approveCashFlows(throughSchedule(fixture)), { type: 'continueToNextStep' }));
}
function atClassification(fixture: GoldenFixture): StudentState {
  return take(throughAmortization(fixture), { type: 'continueToNextStep' });
}
function throughBookkeeping(fixture: GoldenFixture): StudentState {
  return approveBookkeeping(take(throughClassification(fixture), { type: 'continueToNextStep' }));
}
function throughClassification(fixture: GoldenFixture): StudentState {
  return approveClassification(atClassification(fixture));
}
function throughCompletion(fixture: GoldenFixture): StudentState {
  return take(throughBookkeeping(fixture), { type: 'continueToNextStep' });
}

describe('L5 student progression', () => {
  it('starts at step one with future steps locked and a schema version', () => {
    const state = createStudentState(generated(r1));
    expect(state.schemaVersion).toBe(STUDENT_STATE_VERSION);
    expect(state.currentStep).toBe('proceeds');
    expect(stepStatus(state, 'proceeds')).toBe('current');
    expect(stepStatus(state, 'completion')).toBe('locked');
    expect(canViewStep(state, 'completion')).toBe(false);
  });
  it('views history without rewinding progression or permitting edits', () => {
    const state = throughSchedule(r1);
    const viewed = take(state, { type: 'viewHistoricalStep', step: 'contractSchedule' });
    expect(viewed.currentStep).toBe('effectiveInterest');
    expect(viewed.viewingStep).toBe('contractSchedule');
    expect(canEditStep(viewed, 'contractSchedule')).toBe(false);
    expect(take(viewed, { type: 'editCashFlowRow', term: 0, amount: '1' })).toBe(viewed);
    expect(take(viewed, { type: 'returnToCurrentStep' }).viewingStep).toBe('effectiveInterest');
  });
  it('ignores future step edits', () => {
    const state = createStudentState(generated(r1));
    expect(take(state, { type: 'editFinalBalance', account: '4410', formula: '=1+1' })).toBe(state);
  });
  it('approves bank variable cost before proceeds and preserves wrong input', () => {
    let state = createStudentState(generated(r1));
    state = take(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=1+1' });
    state = take(state, { type: 'checkProceedsField', field: 'variableCost' });
    expect(state.proceeds.variableCost).toMatchObject({ raw: '=1+1', approved: false, errorCode: 'WRONG_RESULT' });
    expect(take(state, { type: 'checkProceedsField', field: 'proceeds' })).toBe(state);
    state = approveProceeds(state);
    expect(state.currentStep).toBe('proceeds');
  });
  it('requires bond market value then brokerage then proceeds', () => {
    let state = createStudentState(generated(r6));
    expect(take(state, { type: 'checkProceedsField', field: 'brokerage' })).toBe(state);
    state = approveProceeds(state);
    expect(state.proceeds.marketValue?.approved).toBe(true);
    expect(state.proceeds.brokerage?.approved).toBe(true);
    expect(state.currentStep).toBe('proceeds');
  });
  it('locks approved calculation fields', () => {
    let state = createStudentState(generated(r1));
    state = take(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=7.000.000*3%' });
    state = take(state, { type: 'checkProceedsField', field: 'variableCost' });
    expect(take(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=1+1' })).toBe(state);
  });
  it('clears old error feedback when an incorrect field is edited', () => {
    let state = createStudentState(generated(r1));
    state = take(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=1+1' });
    state = take(state, { type: 'checkProceedsField', field: 'variableCost' });
    state = take(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=7.000.000*3%' });
    expect(state.proceeds.variableCost?.errorCode).toBeNull();
  });
  it('does not expose the former separate initial-recognition step', () => {
    const state = approveProceeds(createStudentState(generated(r1)));
    expect(state.currentStep).toBe('proceeds');
    expect(take(state, { type: 'continueToNextStep' }).currentStep).toBe('contractSchedule');
    expect(take(state, { type: 'viewHistoricalStep', step: 'initialRecognition' })).toBe(state);
  });
  it('requires schedule prerequisites before term one', () => {
    const state = atSchedule(r1);
    expect(scheduleRowStatus(state, 1)).toBe('locked');
    expect(take(state, { type: 'editScheduleField', term: 1, field: 'nominalInterest', raw: '=1+1' })).toBe(state);
  });
  it('rejects literal term counts and accepts an equivalent manual formula', () => {
    let state = atSchedule(r1);
    state = take(state, { type: 'editSchedulePrerequisite', field: 'principal', raw: '7000000' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'principal' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termRate', raw: '=8%/1' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termRate' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termCount', raw: '4' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termCount' });
    expect(state.schedule.prerequisites.termCount).toMatchObject({ approved: false, errorCode: 'MISSING_EQUALS' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termCount', raw: '=4' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termCount' });
    expect(state.schedule.prerequisites.termCount).toMatchObject({ approved: false, errorCode: 'NO_ACTUAL_OPERATION' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termCount', raw: '=3,6+0' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termCount' });
    expect(state.schedule.prerequisites.termCount).toMatchObject({ approved: false, errorCode: 'WRONG_RESULT' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termCount', raw: '=8/2' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termCount' });
    expect(state.schedule.prerequisites.termCount).toMatchObject({ approved: true, errorCode: null });
  });
  it('rejects literal term rates and accepts an equivalent manual formula', () => {
    let state = atSchedule(r1);
    state = take(state, { type: 'editSchedulePrerequisite', field: 'principal', raw: '7000000' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'principal' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termRate', raw: '0,08' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termRate' });
    expect(state.schedule.prerequisites.termRate).toMatchObject({ approved: false, errorCode: 'MISSING_EQUALS' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termRate', raw: '=0,08' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termRate' });
    expect(state.schedule.prerequisites.termRate).toMatchObject({ approved: false, errorCode: 'NO_ACTUAL_OPERATION' });
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termRate', raw: '=16%/2' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termRate' });
    expect(state.schedule.prerequisites.termRate).toMatchObject({ approved: true, errorCode: null });
  });
  it('blocks annuity payment calculation before prerequisites and on other loan types', () => {
    let state = atSchedule(r1);
    expect(take(state, { type: 'calculateAnnuityPayment' })).toBe(state);
    state = take(state, { type: 'editSchedulePrerequisite', field: 'termCount', raw: '=4*1' });
    state = take(state, { type: 'checkSchedulePrerequisite', field: 'termCount' });
    expect(take(state, { type: 'calculateAnnuityPayment' })).toBe(state);
    const serial = atSchedule(r3);
    const bullet = atSchedule(r6);
    expect(take(serial, { type: 'calculateAnnuityPayment' })).toBe(serial);
    expect(take(bullet, { type: 'calculateAnnuityPayment' })).toBe(bullet);
  });
  it('opens annuity row one only after the immutable payment action', () => {
    let state = atSchedule(r1);
    for (const [field, raw] of [['principal', '7000000'], ['termRate', '=8%/1'], ['termCount', '=4*1']] as const) {
      state = take(state, { type: 'editSchedulePrerequisite', field, raw });
      state = take(state, { type: 'checkSchedulePrerequisite', field });
    }
    expect(scheduleRowStatus(state, 1)).toBe('locked');
    expect(deriveStudentView(state).canCalculateAnnuityPayment).toBe(true);
    const before = state;
    state = take(state, { type: 'calculateAnnuityPayment' });
    expect(before.schedule.annuityPaymentCalculated).toBe(false);
    expect(state.schedule.annuityPaymentCalculated).toBe(true);
    expect(state.caseResult.contract.standardPayment).toBe(before.caseResult.contract.standardPayment);
    expect(deriveStudentView(state).annuityPaymentCalculated).toBe(true);
    expect(scheduleRowStatus(state, 1)).toBe('active');
    expect(take(state, { type: 'calculateAnnuityPayment' })).toBe(state);
    const historical = { ...before, viewingStep: 'proceeds' as const };
    expect(take(historical, { type: 'calculateAnnuityPayment' })).toBe(historical);
    const completed = { ...before, sessionStatus: 'completed' as const };
    expect(take(completed, { type: 'calculateAnnuityPayment' })).toBe(completed);
  });
  it('locks correct fields within an active row while wrong fields remain editable', () => {
    let state = atSchedule(r1);
    for (const [field, raw] of [['principal', '7000000'], ['termRate', '=8%/1'], ['termCount', '=4*1']] as const) {
      state = take(state, { type: 'editSchedulePrerequisite', field, raw });
      state = take(state, { type: 'checkSchedulePrerequisite', field });
    }
    state = take(state, { type: 'calculateAnnuityPayment' });
    state = take(state, { type: 'editScheduleField', term: 1, field: 'openingPrincipal', raw: '7.000.000,00' });
    state = take(state, { type: 'editScheduleField', term: 1, field: 'nominalInterest', raw: '=1+1' });
    state = take(state, { type: 'checkScheduleRow', term: 1 });
    expect(state.schedule.rows[1]?.openingPrincipal?.approved).toBe(true);
    expect(state.schedule.rows[1]?.nominalInterest?.approved).toBe(false);
    expect(take(state, { type: 'editScheduleField', term: 1, field: 'openingPrincipal', raw: '=1+1' })).toBe(state);
    expect(take(state, { type: 'editScheduleField', term: 1, field: 'nominalInterest', raw: '=560.000+0' })).not.toBe(state);
    expect(scheduleRowStatus(state, 2)).toBe('locked');
  });
  it('moves annuity term one to term two and marks the rest app calculated', () => {
    const state = throughSchedule(r1);
    expect(state.schedule.approvedTerms).toEqual([1, 2]);
    expect(scheduleRowStatus(state, 3)).toBe('appCalculated');
    expect(state.currentStep).toBe('effectiveInterest');
  });
  it('requires the bullet last schedule term before automatic rows', () => {
    const state = throughSchedule(r6);
    expect(state.schedule.approvedTerms).toEqual([1, 2, 8]);
    expect(scheduleRowStatus(state, 7)).toBe('appCalculated');
  });
  it('requires serial fixed repayment as a manual formula', () => {
    const state = throughSchedule(r3);
    expect(state.schedule.prerequisites.fixedRepayment?.approved).toBe(true);
  });
  it('keeps a cashflow row editable when amount is right but sign is wrong', () => {
    let state = throughSchedule(r1);
    state = take(state, { type: 'editCashFlowRow', term: 0, amount: dk(calculateLoan(r1.input).proceeds.proceeds.toFixed(2)), sign: '-' });
    state = take(state, { type: 'checkCashFlowRow', term: 0 });
    expect(state.effectiveInterest.rows[0]).toMatchObject({ approved: false, errorCode: 'WRONG_SIGN' });
    expect(cashFlowRowStatus(state, 0)).toBe('active');
  });
  it('withholds IA until all required cashflow rows and automatic rows are complete', () => {
    let state = throughSchedule(r1);
    expect(take(state, { type: 'calculateEffectiveRate' })).toBe(state);
    const row = calculateLoan(r1.input).cashFlows[0]!;
    state = take(state, { type: 'editCashFlowRow', term: 0, amount: dk(row.amount.toFixed(2)), sign: '+' });
    state = take(state, { type: 'checkCashFlowRow', term: 0 });
    expect(take(state, { type: 'calculateEffectiveRate' })).toBe(state);
  });
  it('requires the bullet last cashflow term before automatic rows and IA', () => {
    const state = approveCashFlows(throughSchedule(r6));
    expect(state.effectiveInterest.approvedTerms).toEqual([0, 1, 2, 8]);
    expect(cashFlowRowStatus(state, 7)).toBe('appCalculated');
    expect(state.effectiveInterest.rateCalculated).toBe(true);
  });
  it('orders income and balance subrows in terms one and two', () => {
    let state = take(approveCashFlows(throughSchedule(r1)), { type: 'continueToNextStep' });
    expect(amortizationSubrowStatus(state, 1, 'income')).toBe('active');
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('locked');
    expect(take(state, { type: 'editAmortizationField', term: 2, subtable: 'income', field: 'amortization', raw: '=1+1' })).toBe(state);
    state = approveAmortization(state);
    expect(state.amortization.terms[1]?.approved).toBe(true);
    expect(state.amortization.terms[2]?.approved).toBe(true);
    expect(amortizationSubrowStatus(state, 3, 'income')).toBe('appCalculated');
  });
  it('requires the final standing-loan term while intervening rows are app-calculated', () => {
    const state = throughAmortization(r6);
    expect(Object.keys(state.amortization.terms)).toEqual(['1', '2', '8']);
    expect(amortizationSubrowStatus(state, 3, 'balance')).toBe('appCalculated');
    expect(amortizationSubrowStatus(state, 8, 'balance')).toBe('approved');
  });
  it('requires payment approval before amortization posting opens', () => {
    const state = throughAmortization(r1);
    expect(take(state, { type: 'setBookkeepingBlock', term: 1, block: 'amortization', lines: [] })).toBe(state);
    expect(deriveStudentView(state).activeBookkeepingBlock).toBe('payment');
  });
  it('leaves every line editable after a wrong bookkeeping block', () => {
    let state = take(throughClassification(r1), { type: 'continueToNextStep' });
    state = take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: [{ account: '4410', side: 'D', amount: '1' }] });
    state = take(state, { type: 'checkBookkeepingBlock', term: 1, block: 'payment' });
    expect(state.bookkeeping[1]?.payment.approved).toBe(false);
    expect(state.bookkeeping[1]?.payment.errors).toContain('WRONG_NET_MOVEMENT');
    const corrected = take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: lines(calculateLoan(r1.input).postingEvents.find((event) => event.kind === 'payment')!.movements) });
    expect(corrected.bookkeeping[1]?.payment.lines).toHaveLength(3);
  });
  it('locks the entire approved payment block', () => {
    let state = take(throughClassification(r1), { type: 'continueToNextStep' });
    const event = calculateLoan(r1.input).postingEvents.find((entry) => entry.kind === 'payment')!;
    state = take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: lines(event.movements) });
    state = take(state, { type: 'checkBookkeepingBlock', term: 1, block: 'payment' });
    expect(state.bookkeeping[1]?.payment.approved).toBe(true);
    expect(take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: [] })).toBe(state);
  });
  it('advances multiple 2026 terms in order', () => {
    const state = throughBookkeeping(r3);
    expect(state.bookkeeping[1]?.amortization.approved).toBe(true);
    expect(state.bookkeeping[2]?.amortization.approved).toBe(true);
    expect(state.currentStep).toBe('yearBookkeeping');
  });
  it('completes positive short-term classification without bookkeeping', () => {
    let state = atClassification(r1);
    const model = calculateLoan(r1.input);
    state = take(state, { type: 'editClassificationField', field: 'shortTerm', raw: formula(model.classification.shortTerm) });
    state = take(state, { type: 'checkClassificationField', field: 'shortTerm' });
    expect(classificationStage(state)).toBe('longTerm');
    state = take(state, { type: 'editClassificationField', field: 'longTerm', raw: formula(model.classification.longTerm) });
    state = take(state, { type: 'checkClassificationField', field: 'longTerm' });
    expect(classificationStage(state)).toBe('done');
    expect(state.currentStep).toBe('classification');
    expect(state.completedSteps).toContain('classification');
    expect(take(state, { type: 'setReclassificationBlock', lines: [] })).toBe(state);
  });
  it('requires No and creates no zero posting when short term is zero', () => {
    const state = throughClassification(r6);
    expect(state.classification.reclassification.lines).toEqual([]);
    expect(state.classification.shortTermAnswer).toBe('no');
    expect(state.classification.fields.shortTerm).toMatchObject({ raw: '', approved: true });
    expect(state.currentStep).toBe('classification');
  });
  it('creates final-balance data when classification explicitly continues to bookkeeping', () => {
    const initial = createStudentState(generated(r1));
    expect(initial.caseResult.accountBalances).toBeNull();
    const classified = throughClassification(r1);
    expect(classified.caseResult.accountBalances).toBeNull();
    const bookkeeping = take(classified, { type: 'continueToNextStep' });
    expect(bookkeeping.caseResult.accountBalances).not.toBeNull();
  });
  it('approves final balance accounts individually', () => {
    let state = throughCompletion(r1);
    const first = calculateLoan(r1.input).accountBalances[0]!;
    if (first.status !== 'balance') throw new Error('Fixture expected balance');
    state = take(state, { type: 'editFinalBalance', account: first.account, formula: formula(first.amount), side: first.side });
    state = take(state, { type: 'checkFinalBalance', account: first.account });
    expect(state.completion.balances[first.account]?.approved).toBe(true);
    expect(take(state, { type: 'editFinalBalance', account: first.account, formula: '=1+1' })).toBe(state);
    expect(Object.values(state.completion.balances).some((entry) => !entry.approved)).toBe(true);
  });
  it('treats noBalance as read only without an =0 input', () => {
    const state = throughCompletion(r6);
    expect(state.completion.balances['6760']).toBeUndefined();
    expect(take(state, { type: 'editFinalBalance', account: '6760', formula: '=0+0' })).toBe(state);
  });
  it('can show 0, 1, 2, and 3 final checks without auto completion', () => {
    let state = approveBalances(throughCompletion(r1));
    expect(deriveStudentView(state).finalChecksPassed).toBe(0);
    state = take(state, { type: 'runFinalChecks', check: 'debtReconciles' });
    expect(deriveStudentView(state).finalChecksPassed).toBe(1);
    state = take(state, { type: 'runFinalChecks', check: 'financialExpenseReconciles' });
    expect(deriveStudentView(state).finalChecksPassed).toBe(2);
    state = take(state, { type: 'runFinalChecks', check: 'accountsReconcile' });
    expect(deriveStudentView(state).finalChecksPassed).toBe(3);
    expect(state.sessionStatus).toBe('active');
  });
  it('completes only through explicit finishLevel1', () => {
    let state = approveBalances(throughCompletion(r1));
    state = take(state, { type: 'runFinalChecks' });
    state = take(state, { type: 'finishLevel1' });
    expect(state.sessionStatus).toBe('completed');
    expect(state.completedSteps).toHaveLength(8);
    expect(deriveCompletedSummary(state)?.proceeds).toBe('6590000.00');
  });
  it('makes all steps read only after completion', () => {
    let state = approveBalances(throughCompletion(r1));
    state = take(take(state, { type: 'runFinalChecks' }), { type: 'finishLevel1' });
    expect(canViewStep(state, 'proceeds')).toBe(true);
    expect(canEditStep(state, 'completion')).toBe(false);
    expect(take(state, { type: 'editFinalBalance', account: '4410', formula: '=1+1' })).toBe(state);
  });
  it('resets to the exact same generated case without calling a generator', () => {
    const original = generated(r1, 123);
    const progressed = approveProceeds(createStudentState(original));
    const reset = resetCurrentCase(progressed);
    expect(reset.generatedCase).toBe(original);
    expect(reset.generatedCase.seed).toBe(123);
    expect(reset.currentStep).toBe('proceeds');
    expect(reset.proceeds).toEqual({});
  });
  it('starts a caller supplied new case with empty student work', () => {
    const progressed = approveProceeds(createStudentState(generated(r1)));
    const nextCase = generated(r6, 456);
    const next = startNewCase(nextCase);
    expect(next.generatedCase).toBe(nextCase);
    expect(next.currentStep).toBe('proceeds');
    expect(next.proceeds).toEqual({});
    expect(take(progressed, { type: 'startNewCase', generatedCase: nextCase })).toEqual(next);
  });
  it('does not mutate a previous state object during edits or checks', () => {
    const original = createStudentState(generated(r1));
    const before = JSON.stringify(original);
    const edited = take(original, { type: 'editProceedsFormula', field: 'variableCost', raw: '=1+1' });
    take(edited, { type: 'checkProceedsField', field: 'variableCost' });
    expect(JSON.stringify(original)).toBe(before);
    expect(original.proceeds).toEqual({});
  });

  it('keeps a completed Step 1 current until an explicit continue action', () => {
    let state = createStudentState(generated(r1));
    const model = calculateLoan(state.generatedCase.caseInput);
    state = applyStudentAction(state, { type: 'editProceedsFormula', field: 'variableCost', raw: formula(model.proceeds.financingType === 'bank' ? model.proceeds.variableCost : model.proceeds.proceeds) });
    state = applyStudentAction(state, { type: 'checkProceedsField', field: 'variableCost' });
    state = applyStudentAction(state, { type: 'editProceedsFormula', field: 'proceeds', raw: formula(model.proceeds.proceeds) });
    state = applyStudentAction(state, { type: 'checkProceedsField', field: 'proceeds' });
    expect(state.currentStep).toBe('proceeds');
    expect(state.completedSteps).toContain('proceeds');
    const historical = applyStudentAction(state, { type: 'viewHistoricalStep', step: 'proceeds' });
    expect(historical.currentStep).toBe('proceeds');
    state = applyStudentAction(state, { type: 'continueToNextStep' });
    expect(state.currentStep).toBe('contractSchedule');
    expect(state.viewingStep).toBe('contractSchedule');
  });
});
