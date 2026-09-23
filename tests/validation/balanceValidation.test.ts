import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/decimal';
import type { AccountBalance } from '../../src/domain/types';
import { validateFinalBalance } from '../../src/validation';

describe('final account balance calculation', () => {
  const expected: AccountBalance = { account: '6320', status: 'balance', amount: new D(300), side: 'K' };
  it('validates amount and side separately', () => {
    expect(validateFinalBalance('=400-100', 'K', expected).correct).toBe(true);
    expect(validateFinalBalance('=400-100', 'D', expected).errorCode).toBe('WRONG_DEBIT_CREDIT_SIDE');
    expect(validateFinalBalance('=400-200', 'K', expected).errorCode).toBe('WRONG_RESULT');
  });
  it('rejects negative, literal and missing = formulas', () => {
    expect(validateFinalBalance('=100-400', 'D', expected).errorCode).toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(validateFinalBalance('=300', 'K', expected).errorCode).toBe('NO_ACTUAL_OPERATION');
    expect(validateFinalBalance('300', 'K', expected).errorCode).toBe('MISSING_EQUALS');
  });
  it('handles noBalance without requiring =0', () => {
    const noBalance: AccountBalance = { account: '6760', status: 'noBalance' };
    expect(validateFinalBalance('', null, noBalance).correct).toBe(true);
    expect(validateFinalBalance('=0+0', 'D', noBalance).errorCode).toBe('INVALID_AMOUNT');
  });
});
