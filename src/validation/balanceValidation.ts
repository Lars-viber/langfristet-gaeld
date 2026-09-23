import type { AccountBalance } from '../domain/types';
import { validateManualCalculation } from './manualCalculation';
import { failure, success } from './feedback';
import type { DebitCreditSide, ValidationResult } from './types';

export function validateFinalBalance(
  formulaInput: string,
  side: DebitCreditSide | null,
  expected: AccountBalance,
): ValidationResult {
  if (expected.status === 'noBalance') {
    return formulaInput.trim() === '' && side === null ? success() : failure('INVALID_AMOUNT');
  }
  const amount = validateManualCalculation(formulaInput, { expected: expected.amount, requirePositive: true });
  if (!amount.correct) return amount;
  return side === expected.side ? amount : failure('WRONG_DEBIT_CREDIT_SIDE');
}
