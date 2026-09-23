import type { LoanCaseInput, LoanType } from '../domain';
import {
  annualRates, bankFixedCosts, bankVariableRates, bondBrokerageRates,
  bondFixedCosts, bondIssuePrices, financingTypes, issueDates,
  openingBankBalances, paymentsPerYear, principals, years,
} from './options';
import { pickUniform } from './prng';

export function drawCandidate(loanType: LoanType, nextUint32: () => number): LoanCaseInput {
  const financingType = pickUniform(nextUint32, financingTypes);
  const nominalPrincipal = pickUniform(nextUint32, principals);
  const duration = pickUniform(nextUint32, years);
  const frequency = pickUniform(nextUint32, paymentsPerYear);
  const nominalAnnualRate = pickUniform(nextUint32, annualRates);
  const openingBankBalance = pickUniform(nextUint32, openingBankBalances);
  // Annual payments always begin on 1 January; this branch consumes no date draw.
  const issueDate = frequency === 1 ? issueDates[0] : pickUniform(nextUint32, issueDates);
  const common = {
    loanType, issueDate, nominalPrincipal, nominalAnnualRate,
    years: duration, paymentsPerYear: frequency, openingBankBalance,
  };
  return financingType === 'bank'
    ? {
        ...common, financingType,
        financingTerms: {
          variableCostRate: pickUniform(nextUint32, bankVariableRates),
          fixedCost: pickUniform(nextUint32, bankFixedCosts),
        },
      }
    : {
        ...common, financingType,
        financingTerms: {
          issuePrice: pickUniform(nextUint32, bondIssuePrices),
          brokerageRate: pickUniform(nextUint32, bondBrokerageRates),
          fixedCost: pickUniform(nextUint32, bondFixedCosts),
        },
      };
}
