import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/decimal';
import { validateCashFlowRow } from '../../src/validation';

describe('cash-flow amount and separate sign', () => {
  const amount = new D('6590000');
  it('accepts the right amount and sign', () => {
    expect(validateCashFlowRow('6.590.000', '+', amount, '+').correct).toBe(true);
    expect(validateCashFlowRow('6.590.000', '-', amount, '-').correct).toBe(true);
  });
  it('distinguishes the sign only after amount is correct', () => {
    expect(validateCashFlowRow('6.590.000', '-', amount, '+').errorCode).toBe('WRONG_SIGN');
    expect(validateCashFlowRow('6.590.001', '+', amount, '+').errorCode).toBe('WRONG_RESULT');
    expect(validateCashFlowRow('6.590.001', '-', amount, '+').errorCode).toBe('WRONG_RESULT');
  });
  it('does not accept a negative amount as a substitute for sign', () => {
    expect(validateCashFlowRow('-6.590.000', '+', amount, '-').errorCode).toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(validateCashFlowRow('6.590.000', 'x' as '+', amount, '+').errorCode).toBe('INVALID_SIGN');
  });
});
