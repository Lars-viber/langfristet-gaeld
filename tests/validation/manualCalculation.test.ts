import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/decimal';
import { validateManualCalculation, validateAmount, parseAmount } from '../../src/validation';

describe('student amount and manual calculation validation', () => {
  it('compares half-up rounded cents exactly', () => {
    expect(validateManualCalculation('=1,004+0,001', { expected: new D('1.01') }).correct).toBe(true);
    expect(validateManualCalculation('=1,004+0,000', { expected: new D('1.01') }).errorCode).toBe('WRONG_RESULT');
    expect(validateAmount('112.500,25', { expected: new D('112500.25') }).correct).toBe(true);
    expect(validateAmount('112500,24', { expected: new D('112500.25') }).errorCode).toBe('WRONG_RESULT');
  });

  it('enforces =, actual operation and positive amount', () => {
    expect(validateManualCalculation('112.500', { expected: new D(112500) }).errorCode).toBe('MISSING_EQUALS');
    expect(validateManualCalculation('=112.500', { expected: new D(112500) }).errorCode).toBe('NO_ACTUAL_OPERATION');
    expect(validateManualCalculation('=-7.000.000*3%', { expected: new D(210000), requirePositive: true }).errorCode)
      .toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(validateManualCalculation('=7.000.000*3%', { expected: new D(210000), requirePositive: true }).correct)
      .toBe(true);
    expect(validateManualCalculation('=1-1', { expected: new D(0), requirePositive: true }).correct).toBe(true);
  });

  it('parses ordinary Danish amounts, rejects negatives and invalid notation', () => {
    expect(parseAmount('112.500,25').value?.eq('112500.25')).toBe(true);
    expect(parseAmount('-112.500').errorCode).toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(parseAmount('7.50.000').errorCode).toBe('INVALID_AMOUNT');
    expect(parseAmount('0', false).errorCode).toBe('INVALID_AMOUNT');
  });

  it('uses frozen feedback without exposing expected amount', () => {
    const expected = new D('9876543.21');
    const result = validateManualCalculation('=1+1', { expected });
    expect(result).toEqual({ correct: false, errorCode: 'WRONG_RESULT', feedback: 'Beregningen stemmer ikke endnu.' });
    expect(JSON.stringify(result)).not.toContain('9876543.21');
    expect(validateManualCalculation('=1+1', { expected, feedbackContext: 'brokerage' }).feedback)
      .toBe('Husk, at kurtage beregnes af kursværdien.');
    expect(validateManualCalculation('1+1', { expected }).feedback).toBe('Brug = til at foretage beregningen.');
    expect(validateManualCalculation('=1/0', { expected }).feedback).toBe('Kontrollér formlen.');
    expect(validateManualCalculation('=-1+0', { expected, requirePositive: true }).feedback)
      .toBe('Beløbet skal beregnes som et positivt beløb. Fradraget vises allerede med − i opstillingen.');
  });
});
