import type Decimal from 'decimal.js';
import type { AccountNumber } from '../domain/types';
import type { FormulaErrorCode } from './formula';

export type ValidationErrorCode = FormulaErrorCode
  | 'NEGATIVE_AMOUNT_NOT_ALLOWED' | 'WRONG_RESULT' | 'WRONG_SIGN'
  | 'INVALID_AMOUNT' | 'INVALID_SIGN' | 'WRONG_DEBIT_CREDIT_SIDE'
  | 'IRRELEVANT_ACCOUNT' | 'UNBALANCED_POSTING_BLOCK' | 'WRONG_NET_MOVEMENT';

export type FeedbackContext = 'default' | 'brokerage' | 'classificationSum';
export type ValidationResult =
  | { correct: true; errorCode: null; feedback: null; value?: Decimal }
  | { correct: false; errorCode: ValidationErrorCode; feedback: string; value?: Decimal };
export type DebitCreditSide = 'D' | 'K';
export interface StudentPostingLine {
  account: AccountNumber;
  side: DebitCreditSide;
  amount: string;
}
