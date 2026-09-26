import { STUDENT_STEPS } from './types';
import type { RowStatus, StepStatus, StudentState, StudentStep, StudentSummary } from './types';

export function stepStatus(state: StudentState, step: StudentStep): StepStatus {
  if (state.completedSteps.includes(step)) return 'completed';
  return state.currentStep === step ? 'current' : 'locked';
}
export function canViewStep(state: StudentState, step: StudentStep): boolean {
  return stepStatus(state, step) !== 'locked';
}
export function canEditStep(state: StudentState, step: StudentStep): boolean {
  return state.sessionStatus === 'active' && state.currentStep === step && state.viewingStep === step;
}
export function manualTerms(loanType: StudentState['generatedCase']['loanType'], count: number, includeZero = false): number[] {
  return [...new Set([...(includeZero ? [0] : []), 1, 2, ...(loanType === 'bullet' ? [count] : [])])];
}
export function scheduleRowStatus(state: StudentState, term: number): RowStatus {
  const count = state.generatedCase.caseInput.years * state.generatedCase.caseInput.paymentsPerYear;
  if (term < 1 || term > count) return 'locked';
  const manual = manualTerms(state.generatedCase.loanType, count);
  if (!manual.includes(term)) return state.schedule.remainingCalculated ? 'appCalculated' : 'locked';
  if (state.schedule.approvedTerms.includes(term)) return 'approved';
  const next = manual.find((candidate) => !state.schedule.approvedTerms.includes(candidate));
  return state.currentStep === 'contractSchedule' && prerequisitesApproved(state)
    && (state.generatedCase.loanType !== 'annuity' || state.schedule.annuityPaymentCalculated)
    && term === next ? 'active' : 'locked';
}
export function cashFlowRowStatus(state: StudentState, term: number): RowStatus {
  const count = state.generatedCase.caseInput.years * state.generatedCase.caseInput.paymentsPerYear;
  if (term < 0 || term > count) return 'locked';
  const manual = manualTerms(state.generatedCase.loanType, count, true);
  if (!manual.includes(term)) return state.effectiveInterest.remainingCalculated ? 'appCalculated' : 'locked';
  if (state.effectiveInterest.approvedTerms.includes(term)) return 'approved';
  const next = manual.find((candidate) => !state.effectiveInterest.approvedTerms.includes(candidate));
  return state.currentStep === 'effectiveInterest' && term === next ? 'active' : 'locked';
}
export function amortizationSubrowStatus(state: StudentState, term: number, subtable: 'income' | 'balance'): RowStatus {
  const count = state.generatedCase.caseInput.years * state.generatedCase.caseInput.paymentsPerYear;
  if (term < 1 || term > count) return 'locked';
  const manual = manualTerms(state.generatedCase.loanType, count);
  if (!manual.includes(term)) return state.amortization.remainingCalculated
    || (state.generatedCase.loanType === 'bullet' && state.amortization.terms[1]?.approved && state.amortization.terms[2]?.approved)
    ? 'appCalculated' : 'locked';
  const row = state.amortization.terms[term];
  if (row?.[`${subtable}Approved`]) return 'approved';
  const activeTerm = manual.find((candidate) => !state.amortization.terms[candidate]?.approved);
  const activeSubtable = row?.incomeApproved ? 'balance' : 'income';
  return state.currentStep === 'amortizedCost' && term === activeTerm && subtable === activeSubtable ? 'active' : 'locked';
}
export function prerequisitesApproved(state: StudentState): boolean {
  const required = state.generatedCase.loanType === 'serial'
    ? ['principal', 'termCount', 'termRate', 'fixedRepayment']
    : ['principal', 'termCount', 'termRate'];
  return required.every((field) => state.schedule.prerequisites[field as keyof typeof state.schedule.prerequisites]?.approved);
}
export function canCalculateAnnuityPayment(state: StudentState): boolean {
  return state.generatedCase.loanType === 'annuity' && canEditStep(state, 'contractSchedule')
    && prerequisitesApproved(state) && !state.schedule.annuityPaymentCalculated
    && state.caseResult.contract.standardPayment !== null;
}
export function classificationStage(state: StudentState): 'carrying' | 'upcoming' | 'shortTerm' | 'longTerm' | 'reconcile' | 'reclassification' | 'noReclassification' | 'done' {
  const c = state.classification;
  if (!c.fields.carryingAmount?.approved) return 'carrying';
  if (Object.values(c.upcomingRepayments).some((field) => !field.approved)) return 'upcoming';
  if (!c.fields.shortTerm?.approved) return 'shortTerm';
  if (!c.fields.longTerm?.approved) return 'longTerm';
  if (!c.reconciled) return 'reconcile';
  if (state.completedSteps.includes('classification')) return 'done';
  return state.caseResult.classification.reclassificationRequired ? 'reclassification' : 'noReclassification';
}
export function deriveStudentView(state: StudentState) {
  const activeAmortizationTerm = manualTerms(state.generatedCase.loanType, state.caseResult.contract.rows.length)
    .find((term) => !state.amortization.terms[term]?.approved) ?? null;
  const activeModel = state.caseResult;
  const actual2026Terms = activeModel.actual2026Terms.map((row) => row.term);
  const activeBookkeepingTerm = actual2026Terms.find((term) => !state.bookkeeping[term]?.amortization.approved) ?? null;
  return {
    currentStep: state.currentStep,
    viewingStep: state.viewingStep,
    sessionStatus: state.sessionStatus,
    steps: STUDENT_STEPS.map((step) => ({ step, status: stepStatus(state, step), canView: canViewStep(state, step), canEdit: canEditStep(state, step) })),
    scheduleRows: activeModel.contract.rows.map((row) => ({ term: row.term, status: scheduleRowStatus(state, row.term) })),
    annuityPaymentCalculated: state.schedule.annuityPaymentCalculated,
    canCalculateAnnuityPayment: canCalculateAnnuityPayment(state),
    cashFlowRows: activeModel.cashFlows.map((row) => ({ term: row.term, status: cashFlowRowStatus(state, row.term) })),
    activeAmortizationTerm,
    activeAmortizationSubtable: activeAmortizationTerm === null ? null : state.amortization.terms[activeAmortizationTerm]?.incomeApproved ? 'balance' : 'income',
    activeBookkeepingTerm,
    activeBookkeepingBlock: activeBookkeepingTerm === null ? null : state.bookkeeping[activeBookkeepingTerm]?.payment.approved ? 'amortization' : 'payment',
    classificationStage: classificationStage(state),
    finalChecksPassed: Object.values(state.completion.checks).filter(Boolean).length,
  };
}
export function deriveCompletedSummary(state: StudentState): StudentSummary | null {
  if (state.sessionStatus !== 'completed') return null;
  const result = state.caseResult;
  return {
    loanType: result.input.loanType, financingType: result.input.financingType,
    issueDate: result.input.issueDate, years: result.input.years, paymentsPerYear: result.input.paymentsPerYear,
    proceeds: result.proceeds.proceeds.toFixed(2), effectiveRatePerTerm: result.effectiveInterest.rate.toString(),
    carryingAmount2026: result.classification.carryingAmount.toFixed(2), shortTerm: result.classification.shortTerm.toFixed(2),
    longTerm: result.classification.longTerm.toFixed(2),
  };
}
