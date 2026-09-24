import type Decimal from 'decimal.js';
import { FormulaError, tokenize } from './tokenizer';
import { parseExpression } from './parser';

export type FormulaErrorCode = 'MISSING_EQUALS' | 'NO_ACTUAL_OPERATION' | FormulaError['code'];
export type FormulaResult =
  | { correct: true; errorCode: null; value: Decimal; hasActualOperation: true }
  | { correct: false; errorCode: FormulaErrorCode; value?: never; hasActualOperation?: never };

/** Evaluates only a manual calculation. The returned value retains full Decimal precision. */
export function evaluateDanishFormula(
  raw: string,
  references: Readonly<Record<string, Decimal>> = {},
): FormulaResult {
  if (raw.length > 2048) return { correct: false, errorCode: 'INVALID_FORMULA' };
  const text = raw.trim();
  if (!text.startsWith('=')) return { correct: false, errorCode: 'MISSING_EQUALS' };
  try {
    const result = parseExpression(tokenize(text.slice(1)), references);
    if (!result.hasActualOperation) return { correct: false, errorCode: 'NO_ACTUAL_OPERATION' };
    return { correct: true, errorCode: null, value: result.value, hasActualOperation: true };
  } catch (error) {
    return { correct: false, errorCode: error instanceof FormulaError ? error.code : 'INVALID_FORMULA' };
  }
}
