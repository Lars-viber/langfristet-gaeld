import type Decimal from 'decimal.js';
import { ZERO } from '../domain/decimal';
import { FormulaError, type Token } from './tokenizer';

export interface ParsedExpression { value: Decimal; hasActualOperation: boolean }

export function parseExpression(tokens: readonly Token[], references: Readonly<Record<string, Decimal>>): ParsedExpression {
  let index = 0;
  let operations = false;
  let depth = 0;
  const guarded = <T>(parse: () => T): T => {
    if (++depth > 64) throw new FormulaError('INVALID_FORMULA');
    try { return parse(); } finally { depth--; }
  };
  const accept = (value: string): boolean => {
    const token = tokens[index];
    if (token?.kind === 'operator' && token.value === value) { index++; return true; }
    return false;
  };
  const primary = (): Decimal => guarded(() => {
    if (accept('(')) {
      const value = addition();
      if (!accept(')')) throw new FormulaError('INVALID_FORMULA');
      return value;
    }
    const token = tokens[index++];
    if (token?.kind === 'number') return token.value;
    if (token?.kind === 'reference') {
      const value = Object.hasOwn(references, token.name) ? references[token.name] : undefined;
      if (!value) throw new FormulaError('UNKNOWN_REFERENCE');
      if (!value.isFinite()) throw new FormulaError('NON_FINITE_RESULT');
      return value;
    }
    throw new FormulaError('INVALID_FORMULA');
  });
  const percent = (): Decimal => guarded(() => {
    let value = primary();
    while (accept('%')) { value = value.div(100); operations = true; }
    return value;
  });
  const unary = (): Decimal => guarded(() => {
    if (accept('+')) return unary();
    if (accept('-')) return unary().neg();
    return percent();
  });
  const multiplication = (): Decimal => guarded(() => {
    let value = unary();
    while (true) {
      if (accept('*')) { value = value.mul(unary()); operations = true; }
      else if (accept('/')) {
        const divisor = unary();
        if (divisor.eq(ZERO)) throw new FormulaError('DIVISION_BY_ZERO');
        value = value.div(divisor); operations = true;
      } else break;
      if (!value.isFinite()) throw new FormulaError('NON_FINITE_RESULT');
    }
    return value;
  });
  const addition = (): Decimal => guarded(() => {
    let value = multiplication();
    while (true) {
      if (accept('+')) { value = value.plus(multiplication()); operations = true; }
      else if (accept('-')) { value = value.minus(multiplication()); operations = true; }
      else break;
      if (!value.isFinite()) throw new FormulaError('NON_FINITE_RESULT');
    }
    return value;
  });
  const value = addition();
  if (index !== tokens.length) throw new FormulaError('INVALID_FORMULA');
  if (!value.isFinite()) throw new FormulaError('NON_FINITE_RESULT');
  return { value, hasActualOperation: operations };
}
