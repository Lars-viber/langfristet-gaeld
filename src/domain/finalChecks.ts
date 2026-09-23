import { D, sumMoney, ZERO } from './decimal';
import { debtAccount, eventBalances, netOnAccount } from './accounting';
import type {
  AccountBalance, ContractScheduleRow, FinalChecks, IncomeScheduleRow, LoanCaseInput,
  PostingEvent, YearEndClassification,
} from './types';

export function evaluateFinalChecks(
  input: LoanCaseInput,
  contract: readonly ContractScheduleRow[],
  income: readonly IncomeScheduleRow[],
  classification: YearEndClassification,
  events: readonly PostingEvent[],
  balances: readonly AccountBalance[],
): FinalChecks {
  const yearInterest = sumMoney(income.filter((row) => row.date <= '2026-12-31')
    .map((row) => row.nominalInterest));
  const yearAmortization = sumMoney(income.filter((row) => row.date <= '2026-12-31')
    .map((row) => row.amortization));
  const yearExpense = sumMoney(income.filter((row) => row.date <= '2026-12-31')
    .map((row) => row.totalInterestExpense));
  const expectedBank = new D(input.openingBankBalance)
    .plus(events[0]?.movements.find((item) => item.account === '5820')?.amount ?? ZERO)
    .minus(sumMoney(contract.filter((row) => row.date <= '2026-12-31').map((row) => row.payment)));
  const expectedSigned: Record<string, string> = {
    '4410': yearInterest.toFixed(2),
    '4450': yearAmortization.toFixed(2),
    '5820': expectedBank.toFixed(2),
    [debtAccount(input)]: classification.longTerm.neg().toFixed(2),
    '6760': classification.shortTerm.neg().toFixed(2),
  };
  const accountsReconcile = events.every(eventBalances) && balances.every((balance) => {
    const net = netOnAccount(events, balance.account, input.openingBankBalance);
    const expected = expectedSigned[balance.account];
    if (expected === undefined || !net.eq(expected)) return false;
    return balance.status === 'noBalance'
      ? net.eq(ZERO)
      : balance.amount.eq(net.abs()) && balance.side === (net.gt(ZERO) ? 'D' : 'K');
  });
  return {
    debtReconciles: classification.shortTerm.plus(classification.longTerm).eq(classification.carryingAmount),
    financialExpenseReconciles: yearInterest.plus(yearAmortization).eq(yearExpense),
    accountsReconcile,
  };
}
