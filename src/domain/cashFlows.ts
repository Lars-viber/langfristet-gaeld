import { ZERO } from './decimal';
import type { CashFlowRow, ContractScheduleRow, ISODate } from './types';
import type Decimal from 'decimal.js';

export function buildCashFlows(
  issueDate: ISODate, proceeds: Decimal, schedule: readonly ContractScheduleRow[],
): CashFlowRow[] {
  return [
    { term: 0, date: issueDate, direction: 'inflow', amount: proceeds, signedAmount: proceeds },
    ...schedule.map((row) => ({
      term: row.term, date: row.date, direction: 'outflow' as const,
      amount: row.payment, signedAmount: ZERO.minus(row.payment),
    })),
  ];
}
