import { calculateAccountBalances, contractDates, eventBalances } from '../domain';
import { D, ZERO, sumMoney } from '../domain/decimal';
import type { LoanCaseInput, LoanResult } from '../domain';
import type Decimal from 'decimal.js';

/** All checks use Decimal values and the existing domain result. Empty means valid. */
export function checkGuardrails(input: LoanCaseInput, result: LoanResult): string[] {
  const failures: string[] = [];
  const fail = (condition: boolean, reason: string): void => {
    if (!condition) failures.push(reason);
  };
  const principal = new D(input.nominalPrincipal);
  const proceeds = result.proceeds.proceeds;
  fail(principal.gt('6000000'), 'principal');
  fail(proceeds.gt(ZERO) && proceeds.lt(principal) && proceeds.gte(principal.times('0.9')), 'proceeds');

  const whole = (value: Decimal): boolean => value.isInteger();
  fail(whole(principal) && whole(new D(input.financingTerms.fixedCost)) &&
    whole(new D(input.openingBankBalance)) && whole(proceeds), 'whole kroner');
  if (input.financingType === 'bank') {
    fail(result.proceeds.financingType === 'bank' &&
      whole(result.proceeds.variableCost), 'bank variable cost');
  } else {
    const marketValue = principal.times(input.financingTerms.issuePrice).div(100);
    const brokerage = marketValue.times(input.financingTerms.brokerageRate);
    fail(new D(input.financingTerms.issuePrice).lt(100), 'issue price');
    fail(result.proceeds.financingType === 'bond' &&
      result.proceeds.marketValue.eq(marketValue) &&
      result.proceeds.brokerage.eq(brokerage) &&
      whole(result.proceeds.marketValue) && whole(result.proceeds.brokerage), 'bond market value/brokerage');
  }

  fail(input.issueDate !== '2026-07-01' || input.paymentsPerYear !== 1, 'medio annual payment');
  const dates = contractDates(input);
  const rows = result.contract.rows;
  fail(rows.length === input.years * input.paymentsPerYear &&
    rows.length === dates.length && rows.every((row, index) => row.date === dates[index]), 'schedule dates/count');
  fail(dates[0] !== undefined && rows[0]?.date === dates[0] && dates[0] > input.issueDate, 'first payment');
  fail(rows.at(-1)?.closingPrincipal.eq(ZERO) ?? false, 'final principal');
  fail(result.effectiveInterest.rate.isFinite() && result.effectiveInterest.rate.gt(ZERO), 'effective interest');
  fail(result.carryingSchedule.at(-1)?.closingCarryingAmount.eq(ZERO) ?? false, 'final carrying amount');
  fail(result.incomeSchedule.length === rows.length && result.carryingSchedule.length === rows.length &&
    result.incomeSchedule.every((row, index) => {
      const carrying = result.carryingSchedule[index];
      return row.nominalInterest.gt(ZERO) && row.amortization.gt(ZERO) &&
        row.totalInterestExpense.gt(ZERO) && carrying?.amortization.eq(row.amortization);
    }) && result.carryingSchedule.every((row, index) =>
      row.openingCarryingAmount.gt(ZERO) && row.amortization.gt(ZERO) &&
      row.principalRepayment.gte(ZERO) && row.closingCarryingAmount.gte(ZERO) &&
      (input.loanType === 'bullet' ? (index === rows.length - 1
        ? row.principalRepayment.gt(ZERO) : row.principalRepayment.eq(ZERO))
        : row.principalRepayment.gt(ZERO))), 'positive amortization amounts');

  const classification = result.classification;
  const yearEndCarrying = result.carryingSchedule.filter((row) => row.date <= '2026-12-31')
    .at(-1)?.closingCarryingAmount;
  fail(classification.shortTerm.gte(ZERO) && classification.longTerm.gte(ZERO) &&
    classification.shortTerm.plus(classification.longTerm).eq(classification.carryingAmount) &&
    yearEndCarrying !== undefined && classification.carryingAmount.eq(yearEndCarrying), 'classification');

  const actualTerms = rows.filter((row) => row.date <= '2026-12-31');
  const events = result.postingEvents;
  fail(events.length === 1 + 2 * actualTerms.length + (classification.reclassificationRequired ? 1 : 0) &&
    events[0]?.kind === 'origination' &&
    actualTerms.every((row, index) => events[1 + index * 2]?.kind === 'payment' &&
      events[1 + index * 2]?.term === row.term &&
      events[2 + index * 2]?.kind === 'amortization' &&
      events[2 + index * 2]?.term === row.term) &&
    events.every(eventBalances), 'posting events');
  fail(events.every((event) => event.movements.every((movement) => !movement.amount.eq(ZERO))),
    'zero posting amount');
  fail(input.loanType !== 'bullet' || events.every((event) => event.kind !== 'payment' ||
    event.term === rows.length || event.movements.every((movement) =>
      movement.account !== (input.financingType === 'bank' ? '6320' : '6330'))),
  'standing-loan ordinary principal posting');

  const bank = new D(input.openingBankBalance).plus(proceeds)
    .minus(sumMoney(actualTerms.map((row) => row.payment)));
  fail(bank.gte(ZERO), 'year-end bank');
  const calculatedBalances = calculateAccountBalances(input, events);
  fail(result.accountBalances.length === calculatedBalances.length &&
    result.accountBalances.every((balance, index) => {
      const expected = calculatedBalances[index];
      return expected?.account === balance.account && expected.status === balance.status &&
        (expected.status === 'noBalance' || (balance.status === 'balance' &&
          expected.side === balance.side && expected.amount.eq(balance.amount)));
    }) && result.accountBalances.some((balance) => balance.account === '5820' &&
      (bank.eq(ZERO) ? balance.status === 'noBalance' :
        balance.status === 'balance' && balance.side === 'D' && balance.amount.eq(bank))),
  'account balances');
  fail(Object.values(result.finalChecks).every(Boolean), 'final checks');
  return failures;
}
