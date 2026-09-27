import type { AccountBalance, AccountNumber, LoanResult, LoanType } from '../domain';
import type { GeneratedLevel1Case } from '../generator';
import type { DebitCreditSide, StudentPostingLine, ValidationErrorCode } from '../validation';

export const STUDENT_STATE_VERSION = 2;
export const STUDENT_STEPS = [
  'proceeds', 'contractSchedule', 'effectiveInterest', 'amortizedCost',
  'classification', 'yearBookkeeping', 'finalOverview',
] as const;
/** initialRecognition is retained only as internal future bookkeeping state, never as a visible step. */
export type StudentStep = typeof STUDENT_STEPS[number] | 'initialRecognition' | 'completion';
export type StepStatus = 'current' | 'completed' | 'locked';
export type RowStatus = 'locked' | 'active' | 'approved' | 'appCalculated';
export type ScheduleField = 'openingPrincipal' | 'payment' | 'nominalInterest' | 'principalRepayment' | 'closingPrincipal';
export type IncomeField = 'nominalInterest' | 'amortization' | 'totalInterestExpense';
export type BalanceField = 'openingCarryingAmount' | 'principalRepayment' | 'amortization' | 'closingCarryingAmount';
export type ProceedsField = 'variableCost' | 'marketValue' | 'brokerage' | 'proceeds';
export type SchedulePrerequisite = 'principal' | 'termCount' | 'termRate' | 'fixedRepayment';
export type ClassificationField = 'carryingAmount' | 'shortTerm' | 'longTerm';
export type FinalCheck = 'debtReconciles' | 'financialExpenseReconciles' | 'accountsReconcile';

export interface FieldState {
  raw: string;
  approved: boolean;
  errorCode: ValidationErrorCode | null;
}
export interface PostingBlockState {
  lines: StudentPostingLine[];
  approved: boolean;
  errors: ValidationErrorCode[];
  accountStatuses: { account: AccountNumber; netCorrect: boolean; studentNet: string }[];
}
export interface CashFlowInput {
  amount: string;
  sign: '+' | '-' | null;
  approved: boolean;
  errorCode: ValidationErrorCode | null;
}
export interface AmortizationTermState {
  income: Partial<Record<IncomeField, FieldState>>;
  balance: Partial<Record<BalanceField, FieldState>>;
  incomeApproved: boolean;
  balanceApproved: boolean;
  approved: boolean;
}
export interface FinalBalanceInput extends FieldState {
  side: DebitCreditSide | null;
}
export type StudentCaseResult = Omit<LoanResult, 'accountBalances' | 'finalChecks'> & { accountBalances: AccountBalance[] | null };

export interface StudentState {
  schemaVersion: typeof STUDENT_STATE_VERSION;
  generatedCase: GeneratedLevel1Case;
  /** Domain data derived from the case snapshot; balances become available in Step 6. */
  caseResult: StudentCaseResult;
  currentStep: StudentStep;
  viewingStep: StudentStep;
  completedSteps: StudentStep[];
  sessionStatus: 'active' | 'completed';
  proceeds: Partial<Record<ProceedsField, FieldState>>;
  initialRecognition: PostingBlockState;
  schedule: {
    prerequisites: Partial<Record<SchedulePrerequisite, FieldState>>;
    annuityPaymentCalculated: boolean;
    rows: Record<number, Partial<Record<ScheduleField, FieldState>>>;
    approvedTerms: number[];
    remainingCalculated: boolean;
  };
  effectiveInterest: {
    rows: Record<number, CashFlowInput>;
    approvedTerms: number[];
    remainingCalculated: boolean;
    rateCalculated: boolean;
  };
  amortization: {
    terms: Record<number, AmortizationTermState>;
    remainingCalculated: boolean;
  };
  bookkeeping: Record<number, { payment: PostingBlockState; amortization: PostingBlockState }>;
  classification: {
    fields: Partial<Record<ClassificationField, FieldState>>;
    shortTermAnswer: 'yes' | 'no' | null;
    upcomingRepayments: Record<number, FieldState>;
    reconciled: boolean;
    reclassification: PostingBlockState;
    reclassificationAnswer: 'yes' | 'no' | null;
    answerErrorCode: ValidationErrorCode | null;
  };
  completion: {
    balances: Partial<Record<AccountNumber, FinalBalanceInput>>;
    checks: Record<FinalCheck, boolean>;
  };
}

export type StudentAction =
  | { type: 'editProceedsFormula'; field: ProceedsField; raw: string }
  | { type: 'checkProceedsField'; field: ProceedsField }
  | { type: 'setInitialRecognitionLines'; lines: StudentPostingLine[] }
  | { type: 'checkInitialRecognition' }
  | { type: 'editSchedulePrerequisite'; field: SchedulePrerequisite; raw: string }
  | { type: 'checkSchedulePrerequisite'; field: SchedulePrerequisite }
  | { type: 'calculateAnnuityPayment' }
  | { type: 'editScheduleField'; term: number; field: ScheduleField; raw: string }
  | { type: 'checkScheduleRow'; term: number }
  | { type: 'calculateRemainingSchedule' }
  | { type: 'editCashFlowRow'; term: number; amount?: string; sign?: '+' | '-' | null }
  | { type: 'checkCashFlowRow'; term: number }
  | { type: 'calculateRemainingCashFlows' }
  | { type: 'calculateEffectiveRate' }
  | { type: 'editAmortizationField'; term: number; subtable: 'income' | 'balance'; field: IncomeField | BalanceField; raw: string }
  | { type: 'checkAmortizationSubrow'; term: number; subtable: 'income' | 'balance' }
  | { type: 'calculateRemainingAmortization' }
  | { type: 'setBookkeepingBlock'; term: number; block: 'payment' | 'amortization'; lines: StudentPostingLine[] }
  | { type: 'checkBookkeepingBlock'; term: number; block: 'payment' | 'amortization' }
  | { type: 'setPostingBlockLines'; number: number; lines: StudentPostingLine[] }
  | { type: 'checkPostingBlock'; number: number }
  | { type: 'editClassificationField'; field: ClassificationField; raw: string }
  | { type: 'checkClassificationField'; field: ClassificationField }
  | { type: 'setShortTermAnswer'; answer: 'yes' | 'no' }
  | { type: 'checkShortTermAnswer' }
  | { type: 'editUpcomingRepayment'; term: number; raw: string }
  | { type: 'checkUpcomingRepayment'; term: number }
  | { type: 'checkClassification' }
  | { type: 'setReclassificationBlock'; lines: StudentPostingLine[] }
  | { type: 'checkReclassification' }
  | { type: 'setReclassificationAnswer'; answer: 'yes' | 'no' }
  | { type: 'checkReclassificationAnswer' }
  | { type: 'editFinalBalance'; account: AccountNumber; formula?: string; side?: DebitCreditSide | null }
  | { type: 'checkFinalBalance'; account: AccountNumber }
  | { type: 'runFinalChecks'; check?: FinalCheck }
  | { type: 'finishLevel1' }
  | { type: 'continueToNextStep' }
  | { type: 'viewHistoricalStep'; step: StudentStep }
  | { type: 'returnToCurrentStep' }
  | { type: 'resetCurrentCase' }
  | { type: 'startNewCase'; generatedCase: GeneratedLevel1Case };

export interface StudentSummary {
  loanType: LoanType;
  financingType: 'bank' | 'bond';
  issueDate: string;
  years: number;
  paymentsPerYear: number;
  proceeds: string;
  effectiveRatePerTerm: string;
  carryingAmount2026: string;
  shortTerm: string;
  longTerm: string;
}
