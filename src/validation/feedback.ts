import type { FeedbackContext, ValidationErrorCode, ValidationResult } from './types';

const messages: Record<ValidationErrorCode, string> = {
  MISSING_EQUALS: 'Brug = til at foretage beregningen.',
  NO_ACTUAL_OPERATION: 'Kontrollér formlen.',
  INVALID_FORMULA: 'Kontrollér formlen.',
  UNKNOWN_REFERENCE: 'Kontrollér formlen.',
  DIVISION_BY_ZERO: 'Kontrollér formlen.',
  NON_FINITE_RESULT: 'Kontrollér formlen.',
  NEGATIVE_AMOUNT_NOT_ALLOWED: 'Beløbet skal beregnes som et positivt beløb. Fradraget vises allerede med − i opstillingen.',
  WRONG_RESULT: 'Beregningen stemmer ikke endnu.',
  WRONG_SIGN: 'Kontrollér fortegnet.',
  INVALID_AMOUNT: 'Kontrollér formlen.',
  INVALID_SIGN: 'Kontrollér fortegnet.',
  WRONG_DEBIT_CREDIT_SIDE: 'Kontrollér fortegnet.',
  IRRELEVANT_ACCOUNT: 'Beregningen stemmer ikke endnu.',
  UNBALANCED_POSTING_BLOCK: 'Beregningen stemmer ikke endnu.',
  WRONG_NET_MOVEMENT: 'Beregningen stemmer ikke endnu.',
};

export function feedbackFor(code: ValidationErrorCode, context: FeedbackContext = 'default'): string {
  if (context === 'classificationSum' && (code === 'MISSING_EQUALS' || code === 'NO_ACTUAL_OPERATION'))
    return 'Vis beregningen ved at lægge de relevante afdrag sammen.';
  return code === 'WRONG_RESULT' && context === 'brokerage'
    ? 'Husk, at kurtage beregnes af kursværdien.' : messages[code];
}

export function failure(errorCode: ValidationErrorCode, context?: FeedbackContext): ValidationResult {
  return { correct: false, errorCode, feedback: feedbackFor(errorCode, context) };
}

export function success(value?: ValidationResult['value']): ValidationResult {
  return value === undefined
    ? { correct: true, errorCode: null, feedback: null }
    : { correct: true, errorCode: null, feedback: null, value };
}
