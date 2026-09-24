import type Decimal from 'decimal.js';
import { D, ONE, ZERO } from './decimal';
import type { CashFlowRow, EffectiveInterestResult } from './types';

export function npvAtRate(cashFlows: readonly CashFlowRow[], rate: Decimal): Decimal {
  const base = ONE.plus(rate);
  return cashFlows.reduce(
    (total, row) => total.plus(row.signedAmount.div(base.pow(row.term))), ZERO,
  );
}

export function solveEffectiveInterest(cashFlows: readonly CashFlowRow[]): EffectiveInterestResult {
  if (cashFlows.length < 2 || cashFlows[0]?.direction !== 'inflow' ||
      cashFlows.slice(1).some((row) => row.direction !== 'outflow')) {
    throw new Error('Expected one initial inflow followed by outflows');
  }
  let low = ZERO;
  let high = ONE;
  if (!npvAtRate(cashFlows, low).lt(ZERO)) throw new Error('No positive effective-interest root');
  while (npvAtRate(cashFlows, high).lt(ZERO)) {
    high = high.times(2);
    if (!high.isFinite() || high.gt('1000000')) throw new Error('Unable to bracket effective-interest root');
  }
  // Bisection is deterministic; all discounting stays in Decimal arithmetic.
  for (let iteration = 0; iteration < 240; iteration++) {
    const midpoint = low.plus(high).div(2);
    if (npvAtRate(cashFlows, midpoint).lt(ZERO)) low = midpoint;
    else high = midpoint;
  }
  const rate = low.plus(high).div(2);
  return {
    rate,
    displayedPercent: rate.times(100).toFixed(4),
    npvResidual: npvAtRate(cashFlows, rate),
  };
}
