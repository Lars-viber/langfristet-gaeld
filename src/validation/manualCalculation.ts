import type Decimal from 'decimal.js';
import { evaluateDanishFormula } from './formula';
import { failure, success } from './feedback';
import { roundedForComparison } from './amountValidation';
import type { FeedbackContext, ValidationResult } from './types';

export interface ManualCalculationOptions {
  expected: Decimal;
  expectedScale?: number;
  requirePositive?: boolean;
  references?: Readonly<Record<string, Decimal>>;
  feedbackContext?: FeedbackContext;
}

export function validateManualCalculation(raw: string, options: ManualCalculationOptions): ValidationResult {
  const result = evaluateDanishFormula(raw, options.references);
  if (!result.correct) return failure(result.errorCode);
  if (options.requirePositive && result.value.isNegative()) return failure('NEGATIVE_AMOUNT_NOT_ALLOWED');
  const scale = options.expectedScale ?? 2;
  const value = roundedForComparison(result.value, scale);
  return value.eq(roundedForComparison(options.expected, scale))
    ? success(value) : failure('WRONG_RESULT', options.feedbackContext);
}
