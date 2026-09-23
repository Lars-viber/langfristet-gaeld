import type Decimal from 'decimal.js';
import { parseDanishNumber } from './danishNumber';

export const FULL_PRECISION_RATE = 'Effektiv rente · fuld præcision';

export type Token =
  | { kind: 'number'; value: Decimal }
  | { kind: 'reference'; name: string }
  | { kind: 'operator'; value: '+' | '-' | '*' | '/' | '(' | ')' | '%' };

export class FormulaError extends Error {
  constructor(readonly code: 'INVALID_FORMULA' | 'UNKNOWN_REFERENCE' | 'DIVISION_BY_ZERO' | 'NON_FINITE_RESULT') {
    super(code);
  }
}

export function tokenize(expression: string): Token[] {
  if (expression.length > 2048) throw new FormulaError('INVALID_FORMULA');
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index]!;
    if (/\s/u.test(char)) { index++; continue; }
    if (/[0-9.,]/.test(char)) {
      const start = index;
      while (index < expression.length && /[0-9.,]/.test(expression[index]!)) index++;
      const value = parseDanishNumber(expression.slice(start, index));
      if (!value) throw new FormulaError('INVALID_FORMULA');
      tokens.push({ kind: 'number', value });
    } else if (char === '[') {
      const end = expression.indexOf(']', index + 1);
      if (end < 0) throw new FormulaError('INVALID_FORMULA');
      const name = expression.slice(index + 1, end);
      if (name !== FULL_PRECISION_RATE) throw new FormulaError('UNKNOWN_REFERENCE');
      tokens.push({ kind: 'reference', name });
      index = end + 1;
    } else if ('+-*/()%'.includes(char)) {
      tokens.push({ kind: 'operator', value: char as Extract<Token, { kind: 'operator' }>['value'] });
      index++;
    } else {
      throw new FormulaError('INVALID_FORMULA');
    }
    if (tokens.length > 512) throw new FormulaError('INVALID_FORMULA');
  }
  return tokens;
}
