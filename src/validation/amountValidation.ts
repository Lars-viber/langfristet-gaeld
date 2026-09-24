import type Decimal from 'decimal.js';
import { D, roundMoney } from '../domain/decimal';
import { parseDanishNumber } from './danishNumber';
import { failure, success } from './feedback';
import type { FeedbackContext, ValidationResult } from './types';

export interface AmountOptions {
  expected: Decimal;
  expectedScale?: number;
  requirePositive?: boolean;
  allowZero?: boolean;
  feedbackContext?: FeedbackContext;
}

export function roundedForComparison(value: Decimal, scale: number): Decimal {
  if (!Number.isInteger(scale) || scale < 0 || scale > 20) throw new RangeError('Invalid monetary comparison scale');
  return scale === 2 ? roundMoney(value) : value.toDecimalPlaces(scale, D.ROUND_HALF_UP);
}

/** Literal money input; a minus is never used to compensate for a separate direction control. */
export function parseAmount(raw: string, allowZero = true): ValidationResult {
  const text = raw.trim();
  if (text.startsWith('-') && parseDanishNumber(text.slice(1))) return failure('NEGATIVE_AMOUNT_NOT_ALLOWED');
  const value = parseDanishNumber(text);
  if (!value || (!allowZero && value.isZero())) return failure('INVALID_AMOUNT');
  return success(value);
}

export function validateAmount(raw: string, options: AmountOptions): ValidationResult {
  const parsed = parseAmount(raw, options.allowZero ?? true);
  if (!parsed.correct || !parsed.value) return parsed;
  if (options.requirePositive && parsed.value.isNegative()) return failure('NEGATIVE_AMOUNT_NOT_ALLOWED');
  const scale = options.expectedScale ?? 2;
  const value = roundedForComparison(parsed.value, scale);
  return value.eq(roundedForComparison(options.expected, scale))
    ? success(value) : failure('WRONG_RESULT', options.feedbackContext);
}
