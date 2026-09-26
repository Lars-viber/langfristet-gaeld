import { buildAmortizedCost, buildCashFlows, buildContractSchedule, buildPostingEvents, calculateAccountBalances, calculateProceeds, classifyYearEnd, evaluateFinalChecks, lastManualTermValues, solveEffectiveInterest } from '../domain';
import { D } from '../domain/decimal';
import type { AccountNumber } from '../domain';
import type { GeneratedLevel1Case } from '../generator';
import {
  FULL_PRECISION_RATE, validateAmount, validateCashFlowRow, validateFinalBalance,
  validateManualCalculation, validatePostingBlock,
} from '../validation';
import type { StudentPostingLine, ValidationResult } from '../validation';
import {
  amortizationSubrowStatus, canCalculateAnnuityPayment, canEditStep, canViewStep, cashFlowRowStatus,
  classificationStage, manualTerms, prerequisitesApproved, scheduleRowStatus,
} from './selectors';
import { STUDENT_STATE_VERSION, STUDENT_STEPS } from './types';
import type {
  AmortizationTermState, BalanceField, ClassificationField, FieldState,
  IncomeField, PostingBlockState, ProceedsField, ScheduleField, SchedulePrerequisite,
  StudentAction, StudentCaseResult, StudentState, StudentStep,
} from './types';

const field = (): FieldState => ({ raw: '', approved: false, errorCode: null });
const block = (): PostingBlockState => ({ lines: [], approved: false, errors: [], accountStatuses: [] });
const amortizationTerm = (): AmortizationTermState => ({ income: {}, balance: {}, incomeApproved: false, balanceApproved: false, approved: false });

export function createStudentState(generatedCase: GeneratedLevel1Case): StudentState {
  if (generatedCase.loanType !== generatedCase.caseInput.loanType) throw new Error('Generated case loan type mismatch');
  const input = generatedCase.caseInput;
  const proceeds = calculateProceeds(input);
  const contract = buildContractSchedule(input);
  const cashFlows = buildCashFlows(input.issueDate, proceeds.proceeds, contract.rows);
  const effectiveInterest = solveEffectiveInterest(cashFlows);
  const { incomeSchedule, carryingSchedule } = buildAmortizedCost(contract.rows, proceeds.proceeds, effectiveInterest.rate);
  const classification = classifyYearEnd(contract.rows, carryingSchedule);
  const postingEvents = buildPostingEvents(input, proceeds.proceeds, contract.rows, incomeSchedule, carryingSchedule, classification);
  const result: StudentCaseResult = {
    input, proceeds, contract, cashFlows, effectiveInterest, incomeSchedule, carryingSchedule,
    actual2026Terms: contract.rows.filter((row) => row.date <= '2026-12-31'),
    postingEvents, classification, accountBalances: null,
  };
  const bookkeeping: StudentState['bookkeeping'] = {};
  for (const row of result.actual2026Terms) bookkeeping[row.term] = { payment: block(), amortization: block() };
  const upcomingRepayments: StudentState['classification']['upcomingRepayments'] = {};
  for (const row of result.contract.rows) {
    if (row.date > '2026-12-31' && row.date <= '2027-12-31') upcomingRepayments[row.term] = field();
  }
  const amortizationTerms: StudentState['amortization']['terms'] = { 1: amortizationTerm(), 2: amortizationTerm() };
  if (generatedCase.loanType === 'bullet') amortizationTerms[contract.rows.length] ??= amortizationTerm();
  return {
    schemaVersion: STUDENT_STATE_VERSION, generatedCase, caseResult: result,
    currentStep: 'proceeds', viewingStep: 'proceeds', completedSteps: [], sessionStatus: 'active',
    proceeds: {}, initialRecognition: block(),
    schedule: { prerequisites: {}, annuityPaymentCalculated: false, rows: {}, approvedTerms: [], remainingCalculated: false },
    effectiveInterest: { rows: {}, approvedTerms: [], remainingCalculated: false, rateCalculated: false },
    amortization: { terms: amortizationTerms, remainingCalculated: false },
    bookkeeping,
    classification: { fields: {}, upcomingRepayments, reconciled: false, reclassification: block(), reclassificationAnswer: null, answerErrorCode: null },
    completion: { balances: {}, checks: { debtReconciles: false, financialExpenseReconciles: false, accountsReconcile: false } },
  };
}

export function resetCurrentCase(state: StudentState): StudentState {
  return createStudentState(state.generatedCase);
}
export function startNewCase(generatedCase: GeneratedLevel1Case): StudentState {
  return createStudentState(generatedCase);
}

function copy(state: StudentState): StudentState {
  const { generatedCase, caseResult, ...studentData } = state;
  return { ...JSON.parse(JSON.stringify(studentData)) as Omit<StudentState, 'generatedCase' | 'caseResult'>, generatedCase, caseResult };
}
function completeStep(state: StudentState): void {
  if (!state.completedSteps.includes(state.currentStep)) state.completedSteps.push(state.currentStep);
}
function continueToNextStep(state: StudentState): void {
  if (!state.completedSteps.includes(state.currentStep)) return;
  const index = STUDENT_STEPS.indexOf(state.currentStep as typeof STUDENT_STEPS[number]);
  if (index >= STUDENT_STEPS.length - 1) return;
  if (state.currentStep === 'classification') {
    const accountBalances = calculateAccountBalances(state.caseResult.input, state.caseResult.postingEvents);
    state.caseResult = { ...state.caseResult, accountBalances };
    for (const expected of accountBalances) {
      if (expected.status === 'balance') state.completion.balances[expected.account] = { ...field(), side: null };
    }
  }
  state.currentStep = STUDENT_STEPS[index + 1]!;
  state.viewingStep = state.currentStep;
}
function storeCheck(target: FieldState, result: ValidationResult): void {
  target.errorCode = result.errorCode;
  if (result.correct) target.approved = true;
}
function storeBlockCheck(target: PostingBlockState, result: ReturnType<typeof validatePostingBlock>): void {
  target.errors = result.errors;
  target.accountStatuses = result.accountStatuses.map((entry) => ({
    account: entry.account, netCorrect: entry.netCorrect, studentNet: entry.studentNet.toString(),
  }));
  if (result.blockCorrect) target.approved = true;
}
function editField(target: FieldState, raw: string): void {
  target.raw = raw;
  target.errorCode = null;
}
function calculatedResult(state: StudentState): StudentCaseResult {
  return state.caseResult;
}
function proceedsOrder(state: StudentState): ProceedsField[] {
  return state.generatedCase.caseInput.financingType === 'bank'
    ? ['variableCost', 'proceeds'] : ['marketValue', 'brokerage', 'proceeds'];
}
function scheduleFields(state: StudentState): ScheduleField[] {
  return state.generatedCase.loanType === 'annuity'
    ? ['openingPrincipal', 'nominalInterest', 'principalRepayment', 'closingPrincipal']
    : state.generatedCase.loanType === 'serial'
      ? ['openingPrincipal', 'payment', 'nominalInterest', 'closingPrincipal']
      : ['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'];
}
function incomeFields(): IncomeField[] { return ['nominalInterest', 'amortization', 'totalInterestExpense']; }
function balanceFields(): BalanceField[] { return ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount']; }
function nextBookkeepingTerm(state: StudentState, result: StudentCaseResult): number | undefined {
  return result.actual2026Terms.map((row) => row.term).find((term) => !state.bookkeeping[term]?.amortization.approved);
}
function completeBookkeepingIfDone(state: StudentState, result: StudentCaseResult): void {
  if (nextBookkeepingTerm(state, result) === undefined) completeStep(state);
}
function allowed(state: StudentState, step: StudentStep): boolean { return canEditStep(state, step); }

export function applyStudentAction(state: StudentState, action: StudentAction): StudentState {
  if (action.type === 'resetCurrentCase') return resetCurrentCase(state);
  if (action.type === 'startNewCase') return startNewCase(action.generatedCase);
  if (action.type === 'viewHistoricalStep') {
    if (!canViewStep(state, action.step) || state.viewingStep === action.step) return state;
    const next = copy(state); next.viewingStep = action.step; return next;
  }
  if (action.type === 'returnToCurrentStep') {
    if (state.viewingStep === state.currentStep) return state;
    const next = copy(state); next.viewingStep = state.currentStep; return next;
  }
  if (action.type === 'continueToNextStep') {
    if (state.viewingStep !== state.currentStep) return state;
    const next = copy(state); continueToNextStep(next); return next;
  }
  if (state.sessionStatus === 'completed') return state;

  switch (action.type) {
    case 'editProceedsFormula': {
      if (!allowed(state, 'proceeds') || !proceedsOrder(state).includes(action.field) || state.proceeds[action.field]?.approved) return state;
      const next = copy(state); const target = next.proceeds[action.field] ??= field(); editField(target, action.raw); return next;
    }
    case 'checkProceedsField': {
      if (!allowed(state, 'proceeds') || proceedsOrder(state).find((key) => !state.proceeds[key]?.approved) !== action.field) return state;
      const next = copy(state); const target = next.proceeds[action.field] ??= field();
      const result = calculatedResult(state);
      const expected = action.field === 'proceeds' ? result.proceeds.proceeds
        : action.field === 'variableCost' && result.proceeds.financingType === 'bank' ? result.proceeds.variableCost
        : action.field === 'marketValue' && result.proceeds.financingType === 'bond' ? result.proceeds.marketValue
        : action.field === 'brokerage' && result.proceeds.financingType === 'bond' ? result.proceeds.brokerage : null;
      if (!expected) return state;
      storeCheck(target, validateManualCalculation(target.raw, { expected, requirePositive: true, feedbackContext: action.field === 'brokerage' ? 'brokerage' : 'default' }));
      if (proceedsOrder(next).every((key) => next.proceeds[key]?.approved)) completeStep(next);
      return next;
    }
    case 'setInitialRecognitionLines': {
      if (!allowed(state, 'initialRecognition') || state.initialRecognition.approved) return state;
      const next = copy(state); next.initialRecognition.lines = action.lines.map((line) => ({ ...line }));
      next.initialRecognition.errors = []; next.initialRecognition.accountStatuses = []; return next;
    }
    case 'checkInitialRecognition': {
      if (!allowed(state, 'initialRecognition') || state.initialRecognition.approved) return state;
      const next = copy(state); const expected = calculatedResult(state).postingEvents.find((event) => event.kind === 'origination');
      if (!expected) return state;
      storeBlockCheck(next.initialRecognition, validatePostingBlock(next.initialRecognition.lines, expected.movements));
      if (next.initialRecognition.approved) completeStep(next);
      return next;
    }
    case 'editSchedulePrerequisite': {
      const required = state.generatedCase.loanType === 'serial'
        ? ['principal', 'termRate', 'termCount', 'fixedRepayment']
        : ['principal', 'termRate', 'termCount'];
      if (!allowed(state, 'contractSchedule') || !required.includes(action.field) || required.find((key) => !state.schedule.prerequisites[key as SchedulePrerequisite]?.approved) !== action.field || state.schedule.prerequisites[action.field]?.approved || state.schedule.approvedTerms.length > 0) return state;
      const next = copy(state); editField(next.schedule.prerequisites[action.field] ??= field(), action.raw); return next;
    }
    case 'checkSchedulePrerequisite': {
      const required = state.generatedCase.loanType === 'serial'
        ? ['principal', 'termRate', 'termCount', 'fixedRepayment']
        : ['principal', 'termRate', 'termCount'];
      if (!allowed(state, 'contractSchedule') || !required.includes(action.field) || required.find((key) => !state.schedule.prerequisites[key as SchedulePrerequisite]?.approved) !== action.field || state.schedule.prerequisites[action.field]?.approved) return state;
      const next = copy(state); const target = next.schedule.prerequisites[action.field] ??= field();
      const result = calculatedResult(state);
      const validation = action.field === 'principal'
        ? validateAmount(target.raw, { expected: new D(result.input.nominalPrincipal), requirePositive: true })
        : action.field === 'termCount'
        ? validateManualCalculation(target.raw, { expected: new D(result.contract.rows.length), expectedScale: 10, requirePositive: true })
        : action.field === 'termRate'
          ? validateManualCalculation(target.raw, { expected: result.contract.termRate, expectedScale: 10, requirePositive: true })
          : validateManualCalculation(target.raw, { expected: result.contract.standardPayment!, requirePositive: true });
      storeCheck(target, validation); return next;
    }
    case 'calculateAnnuityPayment': {
      if (!canCalculateAnnuityPayment(state)) return state;
      const next = copy(state); next.schedule.annuityPaymentCalculated = true; return next;
    }
    case 'editScheduleField': {
      if (!allowed(state, 'contractSchedule') || scheduleRowStatus(state, action.term) !== 'active' || !scheduleFields(state).includes(action.field) || state.schedule.rows[action.term]?.[action.field]?.approved) return state;
      const next = copy(state); const row = next.schedule.rows[action.term] ??= {}; editField(row[action.field] ??= field(), action.raw); return next;
    }
    case 'checkScheduleRow': {
      if (!allowed(state, 'contractSchedule') || scheduleRowStatus(state, action.term) !== 'active') return state;
      const result = calculatedResult(state); const expected = result.contract.rows.find((row) => row.term === action.term);
      if (!expected) return state;
      const next = copy(state); const row = next.schedule.rows[action.term] ??= {};
      for (const key of scheduleFields(state)) {
        const target = row[key] ??= field();
        if (!target.approved) {
          const literalEntry = key === 'openingPrincipal'
            || (state.generatedCase.loanType === 'bullet' && key === 'principalRepayment' && action.term !== state.caseResult.contract.rows.length);
          storeCheck(target, literalEntry
            ? validateAmount(target.raw, { expected: expected[key], requirePositive: key !== 'principalRepayment' })
            : validateManualCalculation(target.raw, { expected: expected[key], requirePositive: true }));
        }
      }
      if (scheduleFields(state).every((key) => row[key]?.approved)) {
        next.schedule.approvedTerms.push(action.term);
        const count = next.generatedCase.caseInput.years * next.generatedCase.caseInput.paymentsPerYear;
        if (manualTerms(next.generatedCase.loanType, count).every((term) => next.schedule.approvedTerms.includes(term))) {
          next.schedule.remainingCalculated = true;
          completeStep(next);
        }
      }
      return next;
    }
    case 'calculateRemainingSchedule': {
      if (!allowed(state, 'contractSchedule') || state.schedule.remainingCalculated) return state;
      const count = state.generatedCase.caseInput.years * state.generatedCase.caseInput.paymentsPerYear;
      if (!manualTerms(state.generatedCase.loanType, count).every((term) => state.schedule.approvedTerms.includes(term))) return state;
      const next = copy(state); next.schedule.remainingCalculated = true; completeStep(next); return next;
    }
    case 'editCashFlowRow': {
      if (!allowed(state, 'effectiveInterest') || cashFlowRowStatus(state, action.term) !== 'active') return state;
      const next = copy(state); const row = next.effectiveInterest.rows[action.term] ??= { amount: '', sign: null, approved: false, errorCode: null };
      if (action.amount !== undefined) row.amount = action.amount;
      if (action.sign !== undefined) row.sign = action.sign;
      row.errorCode = null; return next;
    }
    case 'checkCashFlowRow': {
      if (!allowed(state, 'effectiveInterest') || cashFlowRowStatus(state, action.term) !== 'active') return state;
      const expected = calculatedResult(state).cashFlows.find((row) => row.term === action.term);
      if (!expected) return state;
      const next = copy(state); const row = next.effectiveInterest.rows[action.term] ??= { amount: '', sign: null, approved: false, errorCode: null };
      const validation = validateCashFlowRow(row.amount, row.sign as '+' | '-', expected.amount, expected.direction === 'inflow' ? '+' : '-');
      row.errorCode = validation.errorCode;
      if (validation.correct) {
        row.approved = true;
        next.effectiveInterest.approvedTerms.push(action.term);
        const count = next.caseResult.contract.rows.length;
        if (manualTerms(next.generatedCase.loanType, count, true).every((term) => next.effectiveInterest.approvedTerms.includes(term))) {
          next.effectiveInterest.remainingCalculated = true;
        }
      }
      return next;
    }
    case 'calculateRemainingCashFlows': {
      if (!allowed(state, 'effectiveInterest') || state.effectiveInterest.remainingCalculated) return state;
      const count = state.generatedCase.caseInput.years * state.generatedCase.caseInput.paymentsPerYear;
      if (!manualTerms(state.generatedCase.loanType, count, true).every((term) => state.effectiveInterest.approvedTerms.includes(term))) return state;
      const next = copy(state); next.effectiveInterest.remainingCalculated = true; return next;
    }
    case 'calculateEffectiveRate': {
      if (!allowed(state, 'effectiveInterest') || !state.effectiveInterest.remainingCalculated || state.effectiveInterest.rateCalculated) return state;
      const next = copy(state);
      next.caseResult = { ...next.caseResult, effectiveInterest: solveEffectiveInterest(next.caseResult.cashFlows) };
      next.effectiveInterest.rateCalculated = true;
      completeStep(next);
      return next;
    }
    case 'editAmortizationField': {
      if (!allowed(state, 'amortizedCost') || amortizationSubrowStatus(state, action.term, action.subtable) !== 'active') return state;
      const validFields = action.subtable === 'income' ? incomeFields() : balanceFields();
      if (!(validFields as string[]).includes(action.field)) return state;
      const term = state.amortization.terms[action.term];
      if (term?.[action.subtable][action.field as IncomeField & BalanceField]?.approved) return state;
      const next = copy(state); const target = (next.amortization.terms[action.term] ??= amortizationTerm())[action.subtable] as Partial<Record<typeof action.field, FieldState>>;
      editField(target[action.field] ??= field(), action.raw); return next;
    }
    case 'checkAmortizationSubrow': {
      if (!allowed(state, 'amortizedCost') || amortizationSubrowStatus(state, action.term, action.subtable) !== 'active') return state;
      const result = calculatedResult(state); const expected = action.subtable === 'income' ? result.incomeSchedule[action.term - 1] : result.carryingSchedule[action.term - 1];
      if (!expected) return state;
      const lastManual = state.generatedCase.loanType === 'bullet' && action.term === result.contract.rows.length;
      const manualLast = lastManual ? lastManualTermValues(result.incomeSchedule[action.term - 1]!, result.carryingSchedule[action.term - 1]!, result.effectiveInterest.rate) : null;
      if (manualLast && !manualLast.matchesClosingAdjustment) return state;
      const next = copy(state); const term = next.amortization.terms[action.term] ??= amortizationTerm();
      const target = term[action.subtable] as Partial<Record<IncomeField | BalanceField, FieldState>>;
      const keys = action.subtable === 'income' ? incomeFields() : balanceFields();
      for (const key of keys) {
        const entry = target[key] ??= field();
        const ordinaryExpected = manualLast && (key === 'totalInterestExpense' || key === 'amortization' || key === 'closingCarryingAmount')
          ? manualLast[key] : expected[key as keyof typeof expected] as InstanceType<typeof D>;
        if (!entry.approved) storeCheck(entry, key === 'nominalInterest' || key === 'openingCarryingAmount' || key === 'principalRepayment' || (key === 'amortization' && action.subtable === 'balance')
          ? validateAmount(entry.raw, { expected: ordinaryExpected, requirePositive: true })
          : validateManualCalculation(entry.raw, { expected: ordinaryExpected, requirePositive: true, references: { [FULL_PRECISION_RATE]: result.effectiveInterest.rate } }));
      }
      if (keys.every((key) => target[key]?.approved)) {
        if (action.subtable === 'income') term.incomeApproved = true;
        else {
          term.balanceApproved = true; term.approved = true;
          if (manualTerms(next.generatedCase.loanType, result.contract.rows.length).every((manualTerm) => next.amortization.terms[manualTerm]?.approved)) {
            next.amortization.remainingCalculated = true;
            completeStep(next);
          }
        }
      }
      return next;
    }
    case 'calculateRemainingAmortization': {
      if (!allowed(state, 'amortizedCost') || state.amortization.remainingCalculated || !manualTerms(state.generatedCase.loanType, state.caseResult.contract.rows.length).every((term) => state.amortization.terms[term]?.approved)) return state;
      const next = copy(state); next.amortization.remainingCalculated = true; completeStep(next); return next;
    }
    case 'setBookkeepingBlock': {
      if (!allowed(state, 'yearBookkeeping')) return state;
      const result = calculatedResult(state);
      if (nextBookkeepingTerm(state, result) !== action.term || !state.bookkeeping[action.term] || state.bookkeeping[action.term][action.block].approved || (action.block === 'amortization' && !state.bookkeeping[action.term].payment.approved)) return state;
      const next = copy(state); const target = next.bookkeeping[action.term]![action.block];
      target.lines = action.lines.map((line) => ({ ...line })); target.errors = []; target.accountStatuses = []; return next;
    }
    case 'checkBookkeepingBlock': {
      if (!allowed(state, 'yearBookkeeping')) return state;
      const result = calculatedResult(state);
      if (nextBookkeepingTerm(state, result) !== action.term || !state.bookkeeping[action.term] || state.bookkeeping[action.term][action.block].approved || (action.block === 'amortization' && !state.bookkeeping[action.term].payment.approved)) return state;
      const event = result.postingEvents.find((entry) => entry.kind === action.block && entry.term === action.term);
      if (!event) return state;
      const next = copy(state); const target = next.bookkeeping[action.term]![action.block];
      storeBlockCheck(target, validatePostingBlock(target.lines, event.movements));
      if (action.block === 'amortization' && target.approved) completeBookkeepingIfDone(next, result);
      return next;
    }
    case 'editClassificationField': {
      if (!allowed(state, 'classification') || classificationStage(state) !== ({ carryingAmount: 'carrying', shortTerm: 'shortTerm', longTerm: 'longTerm' } as const)[action.field] || state.classification.fields[action.field]?.approved) return state;
      const next = copy(state); editField(next.classification.fields[action.field] ??= field(), action.raw); return next;
    }
    case 'checkClassificationField': {
      if (!allowed(state, 'classification') || classificationStage(state) !== ({ carryingAmount: 'carrying', shortTerm: 'shortTerm', longTerm: 'longTerm' } as const)[action.field]) return state;
      const next = copy(state); const target = next.classification.fields[action.field] ??= field();
      const expected = calculatedResult(state).classification[action.field];
      storeCheck(target, action.field === 'carryingAmount'
        ? validateAmount(target.raw, { expected, requirePositive: true })
        : validateManualCalculation(target.raw, { expected, requirePositive: true }));
      return next;
    }
    case 'editUpcomingRepayment': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'upcoming' || !state.classification.upcomingRepayments[action.term] || state.classification.upcomingRepayments[action.term].approved) return state;
      const next = copy(state); editField(next.classification.upcomingRepayments[action.term]!, action.raw); return next;
    }
    case 'checkUpcomingRepayment': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'upcoming' || state.classification.upcomingRepayments[action.term].approved) return state;
      const expected = calculatedResult(state).contract.rows.find((row) => row.term === action.term)?.principalRepayment;
      if (!expected) return state;
      const next = copy(state); const target = next.classification.upcomingRepayments[action.term]!;
      storeCheck(target, validateAmount(target.raw, { expected, requirePositive: true })); return next;
    }
    case 'checkClassification': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'reconcile') return state;
      const next = copy(state); next.classification.reconciled = true; return next;
    }
    case 'setReclassificationBlock': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'reclassification' || state.classification.reclassification.approved) return state;
      const next = copy(state); const target = next.classification.reclassification;
      target.lines = action.lines.map((line) => ({ ...line })); target.errors = []; target.accountStatuses = []; return next;
    }
    case 'checkReclassification': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'reclassification') return state;
      const expected = calculatedResult(state).postingEvents.find((event) => event.kind === 'reclassification');
      if (!expected) return state;
      const next = copy(state); const target = next.classification.reclassification;
      storeBlockCheck(target, validatePostingBlock(target.lines, expected.movements));
      if (target.approved) completeStep(next);
      return next;
    }
    case 'setReclassificationAnswer': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'noReclassification') return state;
      const next = copy(state); next.classification.reclassificationAnswer = action.answer; next.classification.answerErrorCode = null; return next;
    }
    case 'checkReclassificationAnswer': {
      if (!allowed(state, 'classification') || classificationStage(state) !== 'noReclassification') return state;
      const next = copy(state);
      if (next.classification.reclassificationAnswer === 'no') completeStep(next);
      else next.classification.answerErrorCode = 'WRONG_RESULT';
      return next;
    }
    case 'editFinalBalance': {
      if (!allowed(state, 'completion') || !state.completion.balances[action.account] || state.completion.balances[action.account]?.approved) return state;
      const next = copy(state); const target = next.completion.balances[action.account]!;
      if (action.formula !== undefined) target.raw = action.formula;
      if (action.side !== undefined) target.side = action.side;
      target.errorCode = null; return next;
    }
    case 'checkFinalBalance': {
      if (!allowed(state, 'completion') || !state.completion.balances[action.account] || state.completion.balances[action.account]?.approved) return state;
      const expected = calculatedResult(state).accountBalances?.find((balance) => balance.account === action.account);
      if (!expected || expected.status === 'noBalance') return state;
      const next = copy(state); const target = next.completion.balances[action.account]!;
      storeCheck(target, validateFinalBalance(target.raw, target.side, expected)); return next;
    }
    case 'runFinalChecks': {
      if (!allowed(state, 'completion') || Object.values(state.completion.balances).some((entry) => !entry.approved)) return state;
      const result = calculatedResult(state);
      if (!result.accountBalances) return state;
      const evaluated = evaluateFinalChecks(result.input, result.contract.rows, result.incomeSchedule, result.classification, result.postingEvents, result.accountBalances);
      const next = copy(state);
      const checks = action.check ? [action.check] : ['debtReconciles', 'financialExpenseReconciles', 'accountsReconcile'] as const;
      for (const key of checks) next.completion.checks[key] = evaluated[key];
      return next;
    }
    case 'finishLevel1': {
      if (!allowed(state, 'completion') || Object.values(state.completion.checks).some((passed) => !passed)) return state;
      const next = copy(state);
      completeStep(next);
      if (!next.completedSteps.includes('finalOverview')) next.completedSteps.push('finalOverview');
      next.sessionStatus = 'completed';
      return next;
    }
  }
}
