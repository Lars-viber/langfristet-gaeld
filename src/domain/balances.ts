import { ZERO } from './decimal';
import { debtAccount, netOnAccount } from './accounting';
import type { AccountBalance, AccountNumber, LoanCaseInput, PostingEvent } from './types';

export function calculateAccountBalances(input: LoanCaseInput, events: readonly PostingEvent[]): AccountBalance[] {
  const accounts: AccountNumber[] = ['4410', '4450', '5820', debtAccount(input), '6760'];
  return accounts.map((account) => {
    const net = netOnAccount(events, account, input.openingBankBalance);
    return net.eq(ZERO)
      ? { account, status: 'noBalance' as const }
      : { account, status: 'balance' as const, amount: net.abs(), side: net.gt(ZERO) ? 'D' as const : 'K' as const };
  });
}
