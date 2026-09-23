import type Decimal from 'decimal.js';
import { roundMoney, ZERO } from './decimal';
import type { CarryingAmountScheduleRow, ContractScheduleRow, IncomeScheduleRow } from './types';

export function buildAmortizedCost(
  schedule: readonly ContractScheduleRow[], proceeds: Decimal, fullPrecisionRate: Decimal,
): { incomeSchedule: IncomeScheduleRow[]; carryingSchedule: CarryingAmountScheduleRow[] } {
  const incomeSchedule: IncomeScheduleRow[] = [];
  const carryingSchedule: CarryingAmountScheduleRow[] = [];
  let openingCarryingAmount = proceeds;
  for (const [index, contract] of schedule.entries()) {
    const last = index === schedule.length - 1;
    const amortization = last
      ? roundMoney(contract.principalRepayment.minus(openingCarryingAmount))
      : roundMoney(
          roundMoney(openingCarryingAmount.times(fullPrecisionRate)).minus(contract.nominalInterest),
        );
    const totalInterestExpense = contract.nominalInterest.plus(amortization);
    const closingCarryingAmount = last
      ? ZERO
      : roundMoney(openingCarryingAmount.minus(contract.principalRepayment).plus(amortization));
    incomeSchedule.push({
      term: contract.term, date: contract.date,
      nominalInterest: contract.nominalInterest, amortization, totalInterestExpense,
    });
    carryingSchedule.push({
      term: contract.term, date: contract.date, openingCarryingAmount,
      principalRepayment: contract.principalRepayment, amortization, closingCarryingAmount,
    });
    openingCarryingAmount = closingCarryingAmount;
  }
  return { incomeSchedule, carryingSchedule };
}
