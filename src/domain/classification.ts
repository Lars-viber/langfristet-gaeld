import { sumMoney, ZERO } from './decimal';
import type { CarryingAmountScheduleRow, ContractScheduleRow, YearEndClassification } from './types';

export function classifyYearEnd(
  contract: readonly ContractScheduleRow[], carrying: readonly CarryingAmountScheduleRow[],
): YearEndClassification {
  const yearEndRow = carrying.filter((row) => row.date <= '2026-12-31').at(-1);
  if (!yearEndRow) throw new Error('No 2026 carrying amount');
  const shortTerm = sumMoney(contract
    .filter((row) => row.date > '2026-12-31' && row.date <= '2027-12-31')
    .map((row) => row.principalRepayment));
  const longTerm = yearEndRow.closingCarryingAmount.minus(shortTerm);
  return {
    date: '2026-12-31', carryingAmount: yearEndRow.closingCarryingAmount,
    shortTerm, longTerm, reclassificationRequired: shortTerm.gt(ZERO),
  };
}
