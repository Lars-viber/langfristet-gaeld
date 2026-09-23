import { D, roundMoney } from './decimal';
import type { LoanCaseInput, ProceedsCalculation } from './types';

export function calculateProceeds(input: LoanCaseInput): ProceedsCalculation {
  const nominalPrincipal = new D(input.nominalPrincipal);
  const fixedCost = new D(input.financingTerms.fixedCost);
  if (input.financingType === 'bank') {
    const variableCost = roundMoney(nominalPrincipal.times(new D(input.financingTerms.variableCostRate)));
    return {
      financingType: 'bank', nominalPrincipal, variableCost, fixedCost,
      proceeds: nominalPrincipal.minus(variableCost).minus(fixedCost),
    };
  }
  const marketValue = roundMoney(nominalPrincipal.times(new D(input.financingTerms.issuePrice)).div(100));
  // The brokerage base is the market value after issue-price conversion.
  const brokerage = roundMoney(marketValue.times(new D(input.financingTerms.brokerageRate)));
  return {
    financingType: 'bond', nominalPrincipal, marketValue, brokerage, fixedCost,
    proceeds: marketValue.minus(brokerage).minus(fixedCost),
  };
}
