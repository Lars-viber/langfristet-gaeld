import type Decimal from 'decimal.js';
import { sumMoney, ZERO } from '../domain/decimal';
import type { AccountNumber, NetMovement } from '../domain/types';
import { parseAmount } from './amountValidation';
import { evaluateDanishFormula } from './formula';
import { failure } from './feedback';
import type { ValidationResult } from './types';
import type { StudentPostingLine, ValidationErrorCode } from './types';

export interface AccountPostingStatus {
  account: AccountNumber;
  netCorrect: boolean;
  studentNet: Decimal;
}

export interface PostingBlockResult {
  blockCorrect: boolean;
  balanced: boolean;
  accountStatuses: AccountPostingStatus[];
  errors: ValidationErrorCode[];
  /** The same reference is returned so the caller can retain the student's actual working. */
  studentLines: readonly StudentPostingLine[];
}

/** A posting amount is always positive; a formula is optional, unlike a calculation field. */
export function parsePostingAmount(raw: string): ValidationResult {
  const parsed = raw.trim().startsWith('=') ? evaluateDanishFormula(raw) : parseAmount(raw, false);
  if (!parsed.correct) return failure(parsed.errorCode ?? 'INVALID_AMOUNT');
  if (!parsed.value || !parsed.value.isFinite() || parsed.value.isZero()) return failure('INVALID_AMOUNT');
  if (parsed.value.isNegative()) return failure('NEGATIVE_AMOUNT_NOT_ALLOWED');
  return { correct: true, value: parsed.value.toDecimalPlaces(2), errorCode: null, feedback: null };
}

/** Expected movement is signed: debit positive, credit negative. */
export function validatePostingBlock(
  studentLines: readonly StudentPostingLine[],
  expectedMovements: readonly NetMovement[],
): PostingBlockResult {
  const expected = new Map<AccountNumber, Decimal>();
  for (const movement of expectedMovements) {
    expected.set(movement.account, (expected.get(movement.account) ?? ZERO).plus(movement.amount));
  }
  for (const [account, net] of expected) if (net.isZero()) expected.delete(account);
  const student = new Map<AccountNumber, Decimal>();
  const errors = new Set<ValidationErrorCode>();
  const signed: Decimal[] = [];
  for (const line of studentLines) {
    // An untouched draft is not a posting. Keep it in studentLines until approval.
    if (line.amount.trim() === '') continue;
    if (!expected.has(line.account)) errors.add('IRRELEVANT_ACCOUNT');
    const parsed = parsePostingAmount(line.amount);
    if (!parsed.correct || !parsed.value) { errors.add(parsed.errorCode ?? 'INVALID_AMOUNT'); continue; }
    if (line.side !== 'D' && line.side !== 'K') { errors.add('INVALID_SIGN'); continue; }
    const value = line.side === 'D' ? parsed.value : parsed.value.neg();
    signed.push(value);
    student.set(line.account, (student.get(line.account) ?? ZERO).plus(value));
  }
  const balanced = errors.has('INVALID_AMOUNT') || errors.has('NEGATIVE_AMOUNT_NOT_ALLOWED') || errors.has('INVALID_SIGN')
    ? false : sumMoney(signed).eq(ZERO);
  const accountStatuses = [...expected].map(([account, net]) => ({
    account, netCorrect: (student.get(account) ?? ZERO).eq(net), studentNet: student.get(account) ?? ZERO,
  }));
  if (accountStatuses.some((status) => !status.netCorrect)) errors.add('WRONG_NET_MOVEMENT');
  if (!balanced) errors.add('UNBALANCED_POSTING_BLOCK');
  return { blockCorrect: errors.size === 0, balanced, accountStatuses, errors: [...errors], studentLines };
}
