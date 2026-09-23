import { describe, expect, it } from 'vitest';
import { calculateLoan } from '../../src/domain';
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
function take(state: StudentState, action: StudentAction): StudentState { return applyStudentAction(state, action); }
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
function approveInitial(state: StudentState): StudentState {
  const event = calculateLoan(state.generatedCase.caseInput).postingEvents.find((entry) => entry.kind === 'origination')!;
  state = take(state, { type: 'setInitialRecognitionLines', lines: lines(event.movements) });
  return take(state, { type: 'checkInitialRecognition' });
}
function approveSchedule(state: StudentState): StudentState {
  const model = calculateLoan(state.generatedCase.caseInput);
  const prerequisites = [
    ['termCount', String(model.contract.rows.length)],
    ['termRate', dk(model.contract.termRate.toString())],
    ...(state.generatedCase.loanType === 'serial' ? [['fixedRepayment', formula(model.contract.standardPayment!)]] : []),
  ] as Array<['termCount' | 'termRate' | 'fixedRepayment', string]>;
  for (const [field, raw] of prerequisites) {
    state = take(state, { type: 'editSchedulePrerequisite', field, raw });
    state = take(state, { type: 'checkSchedulePrerequisite', field });
  }
  const count = model.contract.rows.length;
  const terms = state.generatedCase.loanType === 'bullet' ? [1, 2, count] : [1, 2];
  for (const term of terms) {
    const row = model.contract.rows[term - 1]!;
    const fields = state.generatedCase.loanType === 'annuity'
      ? ['openingPrincipal', 'nominalInterest', 'principalRepayment', 'closingPrincipal'] as const
      : ['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'] as const;
    for (const field of fields) state = take(state, { type: 'editScheduleField', term, field, raw: formula(row[field]) });
    state = take(state, { type: 'checkScheduleRow', term });
  }
  return take(state, { type: 'calculateRemainingSchedule' });
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
  for (const term of [1, 2]) {
    const income = model.incomeSchedule[term - 1]!;
    for (const field of ['nominalInterest', 'amortization', 'totalInterestExpense'] as const) {
      state = take(state, { type: 'editAmortizationField', term, subtable: 'income', field, raw: formula(income[field]) });
    }
    state = take(state, { type: 'checkAmortizationSubrow', term, subtable: 'income' });
    const balance = model.carryingSchedule[term - 1]!;
    for (const field of ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'] as const) {
      state = take(state, { type: 'editAmortizationField', term, subtable: 'balance', field, raw: formula(balance[field]) });
    }
    state = take(state, { type: 'checkAmortizationSubrow', term, subtable: 'balance' });
  }
  return take(state, { type: 'calculateRemainingAmortization' });
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
  state = take(state, { type: 'editClassificationField', field: 'carryingAmount', raw: dk(model.classification.carryingAmount.toFixed(2)) });
  state = take(state, { type: 'checkClassificationField', field: 'carryingAmount' });
  for (const row of model.contract.rows.filter((entry) => entry.date > '2026-12-31' && entry.date <= '2027-12-31')) {
    state = take(state, { type: 'editUpcomingRepayment', term: row.term, raw: dk(row.principalRepayment.toFixed(2)) });
    state = take(state, { type: 'checkUpcomingRepayment', term: row.term });
  }
  for (const field of ['shortTerm', 'longTerm'] as const) {
    state = take(state, { type: 'editClassificationField', field, raw: formula(model.classification[field]) });
    state = take(state, { type: 'checkClassificationField', field });
  }
  state = take(state, { type: 'checkClassification' });
  if (model.classification.reclassificationRequired) {
    const event = model.postingEvents.find((entry) => entry.kind === 'reclassification')!;
    state = take(state, { type: 'setReclassificationBlock', lines: lines(event.movements) });
    return take(state, { type: 'checkReclassification' });
  }
  state = take(state, { type: 'setReclassificationAnswer', answer: 'no' });
  return take(state, { type: 'checkReclassificationAnswer' });
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
  return approveSchedule(approveInitial(approveProceeds(createStudentState(generated(fixture)))));
}
function throughAmortization(fixture: GoldenFixture): StudentState {
  return approveAmortization(approveCashFlows(throughSchedule(fixture)));
}
function throughBookkeeping(fixture: GoldenFixture): StudentState {
  return approveBookkeeping(throughAmortization(fixture));
}
function throughClassification(fixture: GoldenFixture): StudentState {
  return approveClassification(throughBookkeeping(fixture));
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
    expect(state.currentStep).toBe('initialRecognition');
  });
  it('requires bond market value then brokerage then proceeds', () => {
    let state = createStudentState(generated(r6));
    expect(take(state, { type: 'checkProceedsField', field: 'brokerage' })).toBe(state);
    state = approveProceeds(state);
    expect(state.proceeds.marketValue?.approved).toBe(true);
    expect(state.proceeds.brokerage?.approved).toBe(true);
    expect(state.currentStep).toBe('initialRecognition');
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
  it('locks initial recognition only as a whole posting block', () => {
    let state = approveProceeds(createStudentState(generated(r1)));
    state = take(state, { type: 'setInitialRecognitionLines', lines: [{ account: '5820', side: 'D', amount: '1' }] });
    state = take(state, { type: 'checkInitialRecognition' });
    expect(state.initialRecognition.approved).toBe(false);
    expect(state.initialRecognition.errors).toContain('WRONG_NET_MOVEMENT');
    state = approveInitial(state);
    expect(state.initialRecognition.approved).toBe(true);
    expect(take(state, { type: 'setInitialRecognitionLines', lines: [] })).toBe(state);
  });
  it('preserves original intermediate posting lines through approval and history', () => {
    let state = approveProceeds(createStudentState(generated(r1)));
    const expected = calculateLoan(r1.input).proceeds.proceeds;
    const original: StudentPostingLine[] = [
      { account: '5820', side: 'D', amount: dk(expected.plus(100).toFixed(2)) },
      { account: '5820', side: 'K', amount: '100' },
      { account: '6320', side: 'K', amount: dk(expected.toFixed(2)) },
    ];
    state = take(state, { type: 'setInitialRecognitionLines', lines: original });
    state = take(state, { type: 'checkInitialRecognition' });
    expect(state.initialRecognition.lines).toEqual(original);
    expect(state.initialRecognition.lines).not.toBe(original);
    expect(state.currentStep).toBe('contractSchedule');
  });
  it('requires schedule prerequisites before term one', () => {
    const state = approveInitial(approveProceeds(createStudentState(generated(r1))));
    expect(scheduleRowStatus(state, 1)).toBe('locked');
    expect(take(state, { type: 'editScheduleField', term: 1, field: 'nominalInterest', raw: '=1+1' })).toBe(state);
  });
  it('locks correct fields within an active row while wrong fields remain editable', () => {
    let state = approveInitial(approveProceeds(createStudentState(generated(r1))));
    for (const [field, raw] of [['termCount', '4'], ['termRate', '0,08']] as const) {
      state = take(state, { type: 'editSchedulePrerequisite', field, raw });
      state = take(state, { type: 'checkSchedulePrerequisite', field });
    }
    state = take(state, { type: 'editScheduleField', term: 1, field: 'openingPrincipal', raw: '=7.000.000+0' });
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
    let state = approveCashFlows(throughSchedule(r1));
    expect(amortizationSubrowStatus(state, 1, 'income')).toBe('active');
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('locked');
    expect(take(state, { type: 'editAmortizationField', term: 2, subtable: 'income', field: 'amortization', raw: '=1+1' })).toBe(state);
    state = approveAmortization(state);
    expect(state.amortization.terms[1]?.approved).toBe(true);
    expect(state.amortization.terms[2]?.approved).toBe(true);
    expect(amortizationSubrowStatus(state, 3, 'income')).toBe('appCalculated');
  });
  it('has no manual last amortization exception for bullet loans', () => {
    const state = throughAmortization(r6);
    expect(Object.keys(state.amortization.terms)).toEqual(['1', '2']);
    expect(amortizationSubrowStatus(state, 8, 'balance')).toBe('appCalculated');
  });
  it('requires payment approval before amortization posting opens', () => {
    const state = throughAmortization(r1);
    expect(take(state, { type: 'setBookkeepingBlock', term: 1, block: 'amortization', lines: [] })).toBe(state);
    expect(deriveStudentView(state).activeBookkeepingBlock).toBe('payment');
  });
  it('leaves every line editable after a wrong bookkeeping block', () => {
    let state = throughAmortization(r1);
    state = take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: [{ account: '4410', side: 'D', amount: '1' }] });
    state = take(state, { type: 'checkBookkeepingBlock', term: 1, block: 'payment' });
    expect(state.bookkeeping[1]?.payment.approved).toBe(false);
    expect(state.bookkeeping[1]?.payment.errors).toContain('WRONG_NET_MOVEMENT');
    const corrected = take(state, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: lines(calculateLoan(r1.input).postingEvents.find((event) => event.kind === 'payment')!.movements) });
    expect(corrected.bookkeeping[1]?.payment.lines).toHaveLength(3);
  });
  it('locks the entire approved payment block', () => {
    let state = throughAmortization(r1);
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
    expect(state.currentStep).toBe('classification');
  });
  it('requires a reclassification block for positive short term debt', () => {
    let state = throughBookkeeping(r1);
    const model = calculateLoan(r1.input);
    state = take(state, { type: 'editClassificationField', field: 'carryingAmount', raw: dk(model.classification.carryingAmount.toFixed(2)) });
    state = take(state, { type: 'checkClassificationField', field: 'carryingAmount' });
    for (const row of model.contract.rows.filter((entry) => entry.date > '2026-12-31' && entry.date <= '2027-12-31')) {
      state = take(state, { type: 'editUpcomingRepayment', term: row.term, raw: dk(row.principalRepayment.toFixed(2)) });
      state = take(state, { type: 'checkUpcomingRepayment', term: row.term });
    }
    for (const field of ['shortTerm', 'longTerm'] as const) {
      state = take(state, { type: 'editClassificationField', field, raw: formula(model.classification[field]) });
      state = take(state, { type: 'checkClassificationField', field });
    }
    state = take(state, { type: 'checkClassification' });
    expect(classificationStage(state)).toBe('reclassification');
    expect(state.currentStep).toBe('classification');
    expect(take(state, { type: 'setReclassificationAnswer', answer: 'no' })).toBe(state);
  });
  it('requires No and creates no zero posting when short term is zero', () => {
    let state = throughBookkeeping(r6);
    state = approveClassification(state);
    expect(state.classification.reclassification.lines).toEqual([]);
    expect(state.classification.reclassificationAnswer).toBe('no');
    expect(state.currentStep).toBe('completion');
  });
  it('defers T-account balance calculation until step eight', () => {
    const initial = createStudentState(generated(r1));
    expect(initial.caseResult.accountBalances).toBeNull();
    const booked = throughBookkeeping(r1);
    expect(booked.caseResult.accountBalances).toBeNull();
    const classified = approveClassification(booked);
    expect(classified.currentStep).toBe('completion');
    expect(classified.caseResult.accountBalances).not.toBeNull();
  });
  it('approves final balance accounts individually', () => {
    let state = throughClassification(r1);
    const first = calculateLoan(r1.input).accountBalances[0]!;
    if (first.status !== 'balance') throw new Error('Fixture expected balance');
    state = take(state, { type: 'editFinalBalance', account: first.account, formula: formula(first.amount), side: first.side });
    state = take(state, { type: 'checkFinalBalance', account: first.account });
    expect(state.completion.balances[first.account]?.approved).toBe(true);
    expect(take(state, { type: 'editFinalBalance', account: first.account, formula: '=1+1' })).toBe(state);
    expect(Object.values(state.completion.balances).some((entry) => !entry.approved)).toBe(true);
  });
  it('treats noBalance as read only without an =0 input', () => {
    const state = throughClassification(r6);
    expect(state.completion.balances['6760']).toBeUndefined();
    expect(take(state, { type: 'editFinalBalance', account: '6760', formula: '=0+0' })).toBe(state);
  });
  it('can show 0, 1, 2, and 3 final checks without auto completion', () => {
    let state = approveBalances(throughClassification(r1));
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
    let state = approveBalances(throughClassification(r1));
    state = take(state, { type: 'runFinalChecks' });
    state = take(state, { type: 'finishLevel1' });
    expect(state.sessionStatus).toBe('completed');
    expect(state.completedSteps).toHaveLength(8);
    expect(deriveCompletedSummary(state)?.proceeds).toBe('6590000.00');
  });
  it('makes all steps read only after completion', () => {
    let state = approveBalances(throughClassification(r1));
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
});
