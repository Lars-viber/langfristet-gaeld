import { buildAmortizedCost } from './amortizedCost';
import { buildPostingEvents } from './accounting';
import { calculateAccountBalances } from './balances';
import { buildCashFlows } from './cashFlows';
import { classifyYearEnd } from './classification';
import { buildContractSchedule } from './contractSchedule';
import { solveEffectiveInterest } from './effectiveInterest';
import { evaluateFinalChecks } from './finalChecks';
import { calculateProceeds } from './proceeds';
import type { LoanCaseInput, LoanResult } from './types';

export * from './types';
export { roundMoney, moneyString } from './decimal';
export { contractDates } from './dates';
export { calculateProceeds } from './proceeds';
export { buildContractSchedule } from './contractSchedule';
export { buildCashFlows } from './cashFlows';
export { npvAtRate, solveEffectiveInterest } from './effectiveInterest';
export { buildAmortizedCost } from './amortizedCost';
export { buildPostingEvents, eventBalances } from './accounting';
export { classifyYearEnd } from './classification';
export { calculateAccountBalances } from './balances';
export { evaluateFinalChecks } from './finalChecks';

export function calculateLoan(input: LoanCaseInput): LoanResult {
  const proceeds = calculateProceeds(input);
  const contract = buildContractSchedule(input);
  const cashFlows = buildCashFlows(input.issueDate, proceeds.proceeds, contract.rows);
  const effectiveInterest = solveEffectiveInterest(cashFlows);
  const { incomeSchedule, carryingSchedule } = buildAmortizedCost(
    contract.rows, proceeds.proceeds, effectiveInterest.rate,
  );
  const classification = classifyYearEnd(contract.rows, carryingSchedule);
  const postingEvents = buildPostingEvents(
    input, proceeds.proceeds, contract.rows, incomeSchedule, carryingSchedule, classification,
  );
  const accountBalances = calculateAccountBalances(input, postingEvents);
  const finalChecks = evaluateFinalChecks(
    input, contract.rows, incomeSchedule, classification, postingEvents, accountBalances,
  );
  return {
    input, proceeds, contract, cashFlows, effectiveInterest,
    incomeSchedule, carryingSchedule,
    actual2026Terms: contract.rows.filter((row) => row.date <= '2026-12-31'),
    postingEvents, classification, accountBalances, finalChecks,
  };
}
