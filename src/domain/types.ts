import type Decimal from 'decimal.js';

export type LoanType = 'annuity' | 'serial' | 'bullet';
export type FinancingType = 'bank' | 'bond';
export type PaymentsPerYear = 1 | 2 | 4;
export type ISODate = `${number}-${number}-${number}`;
export type AccountNumber = '4410' | '4450' | '5820' | '6320' | '6330' | '6760';
export type MoneyInput = string;
export type RateInput = string;

interface CommonLoanCaseInput {
  loanType: LoanType;
  issueDate: ISODate;
  nominalPrincipal: MoneyInput;
  nominalAnnualRate: RateInput;
  years: 4 | 5;
  paymentsPerYear: PaymentsPerYear;
  openingBankBalance: MoneyInput;
}

export type LoanCaseInput =
  | (CommonLoanCaseInput & {
      financingType: 'bank';
      financingTerms: { variableCostRate: RateInput; fixedCost: MoneyInput };
    })
  | (CommonLoanCaseInput & {
      financingType: 'bond';
      financingTerms: {
        issuePrice: RateInput;
        brokerageRate: RateInput;
        fixedCost: MoneyInput;
      };
    });

export type ProceedsCalculation =
  | { financingType: 'bank'; nominalPrincipal: Decimal; variableCost: Decimal; fixedCost: Decimal; proceeds: Decimal }
  | { financingType: 'bond'; nominalPrincipal: Decimal; marketValue: Decimal; brokerage: Decimal; fixedCost: Decimal; proceeds: Decimal };

export interface ContractScheduleRow {
  term: number;
  date: ISODate;
  openingPrincipal: Decimal;
  payment: Decimal;
  nominalInterest: Decimal;
  principalRepayment: Decimal;
  closingPrincipal: Decimal;
}

export interface ContractSchedule {
  termRate: Decimal;
  standardPayment: Decimal | null;
  rows: ContractScheduleRow[];
}

export interface CashFlowRow {
  term: number;
  date: ISODate;
  direction: 'inflow' | 'outflow';
  amount: Decimal;
  signedAmount: Decimal;
}

export interface EffectiveInterestResult {
  rate: Decimal;
  displayedPercent: string;
  npvResidual: Decimal;
}

export interface IncomeScheduleRow {
  term: number;
  date: ISODate;
  nominalInterest: Decimal;
  amortization: Decimal;
  totalInterestExpense: Decimal;
}

export interface CarryingAmountScheduleRow {
  term: number;
  date: ISODate;
  openingCarryingAmount: Decimal;
  principalRepayment: Decimal;
  amortization: Decimal;
  closingCarryingAmount: Decimal;
}

export interface NetMovement {
  account: AccountNumber;
  /** Debet is positive; Kredit is negative. */
  amount: Decimal;
}

export interface PostingEvent {
  kind: 'origination' | 'payment' | 'amortization' | 'reclassification';
  term: number | null;
  date: ISODate;
  movements: NetMovement[];
}

export interface YearEndClassification {
  date: '2026-12-31';
  carryingAmount: Decimal;
  shortTerm: Decimal;
  longTerm: Decimal;
  reclassificationRequired: boolean;
}

export type AccountBalance =
  | { account: AccountNumber; status: 'balance'; amount: Decimal; side: 'D' | 'K' }
  | { account: AccountNumber; status: 'noBalance' };

export interface FinalChecks {
  debtReconciles: boolean;
  financialExpenseReconciles: boolean;
  accountsReconcile: boolean;
}

export interface LoanResult {
  input: LoanCaseInput;
  proceeds: ProceedsCalculation;
  contract: ContractSchedule;
  cashFlows: CashFlowRow[];
  effectiveInterest: EffectiveInterestResult;
  incomeSchedule: IncomeScheduleRow[];
  carryingSchedule: CarryingAmountScheduleRow[];
  actual2026Terms: ContractScheduleRow[];
  postingEvents: PostingEvent[];
  classification: YearEndClassification;
  accountBalances: AccountBalance[];
  finalChecks: FinalChecks;
}
