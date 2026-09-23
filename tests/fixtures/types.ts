import type { AccountNumber, ISODate, LoanCaseInput, PostingEvent } from '../../src/domain';

export type MoneyText = string;
export type ContractTuple = [number, ISODate, MoneyText, MoneyText, MoneyText, MoneyText, MoneyText];
export type CashFlowTuple = [number, ISODate, 'inflow' | 'outflow', MoneyText];
export type IncomeTuple = [number, ISODate, MoneyText, MoneyText, MoneyText];
export type CarryingTuple = [number, ISODate, MoneyText, MoneyText, MoneyText, MoneyText];
export type MovementTuple = [AccountNumber, string];
export type PostingTuple = [PostingEvent['kind'], number | null, ISODate, MovementTuple[]];

export interface GoldenFixture {
  id: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
  input: LoanCaseInput;
  proceeds: {
    variableCost?: MoneyText;
    marketValue?: MoneyText;
    brokerage?: MoneyText;
    fixedCost: MoneyText;
    proceeds: MoneyText;
  };
  contract: ContractTuple[];
  cashFlows: CashFlowTuple[];
  displayedEffectivePercent: string;
  income: IncomeTuple[];
  carrying: CarryingTuple[];
  actual2026Dates: ISODate[];
  postings: PostingTuple[];
  yearEnd: { carryingAmount: MoneyText; shortTerm: MoneyText; longTerm: MoneyText; reclassificationRequired: boolean };
  balances: Array<[AccountNumber, MoneyText, 'D' | 'K'] | [AccountNumber, 'noBalance']>;
  checks: { debtReconciles: true; financialExpenseReconciles: true; accountsReconcile: true };
}
