import type Decimal from 'decimal.js';
import { validateAmount } from './amountValidation';
import { failure } from './feedback';
import type { ValidationResult } from './types';

export type CashFlowSign = '+' | '-';

export function validateCashFlowRow(
  amountInput: string,
  sign: CashFlowSign,
  expectedAmount: Decimal,
  expectedSign: CashFlowSign,
): ValidationResult {
  const amount = validateAmount(amountInput, { expected: expectedAmount, requirePositive: true });
  if (!amount.correct) return amount;
  if (sign !== '+' && sign !== '-') return failure('INVALID_SIGN');
  return sign === expectedSign ? amount : failure('WRONG_SIGN');
}
