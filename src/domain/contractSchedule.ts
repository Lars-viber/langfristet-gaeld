import { D, ONE, roundMoney, ZERO } from './decimal';
import { contractDates } from './dates';
import type { ContractSchedule, ContractScheduleRow, LoanCaseInput } from './types';

export function buildContractSchedule(input: LoanCaseInput): ContractSchedule {
  const principal = new D(input.nominalPrincipal);
  const termRate = new D(input.nominalAnnualRate).div(String(input.paymentsPerYear));
  const dates = contractDates(input);
  const count = dates.length;
  if (!termRate.gt(ZERO) || !principal.gt(ZERO)) throw new Error('Principal and term rate must be positive');

  const standardPayment = input.loanType === 'annuity'
    ? roundMoney(principal.times(termRate).div(ONE.minus(ONE.plus(termRate).pow(-count))))
    : input.loanType === 'serial'
      ? roundMoney(principal.div(count))
      : null;
  const rows: ContractScheduleRow[] = [];
  let openingPrincipal = principal;

  for (const [index, date] of dates.entries()) {
    const term = index + 1;
    const last = term === count;
    const nominalInterest = roundMoney(
      (input.loanType === 'bullet' ? principal : openingPrincipal).times(termRate),
    );
    let principalRepayment;
    if (input.loanType === 'annuity') {
      if (standardPayment === null) throw new Error('Missing annuity payment');
      principalRepayment = last ? openingPrincipal : roundMoney(standardPayment.minus(nominalInterest));
    } else if (input.loanType === 'serial') {
      if (standardPayment === null) throw new Error('Missing serial repayment');
      principalRepayment = last ? openingPrincipal : standardPayment;
    } else {
      principalRepayment = last ? principal : ZERO;
    }
    const payment = input.loanType === 'annuity' && !last && standardPayment !== null
      ? standardPayment
      : roundMoney(nominalInterest.plus(principalRepayment));
    const closingPrincipal = last ? ZERO : roundMoney(openingPrincipal.minus(principalRepayment));
    rows.push({ term, date, openingPrincipal, payment, nominalInterest, principalRepayment, closingPrincipal });
    openingPrincipal = closingPrincipal;
  }
  return { termRate, standardPayment, rows };
}
