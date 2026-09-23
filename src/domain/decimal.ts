import Decimal from 'decimal.js';

/** A private constructor keeps financial precision independent of other Decimal users. */
export const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export const ZERO = new D('0');
export const ONE = new D('1');

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function moneyString(value: Decimal): string {
  return value.toFixed(2);
}

export function sumMoney(values: readonly Decimal[]): Decimal {
  return values.reduce((sum, value) => sum.plus(value), ZERO);
}
