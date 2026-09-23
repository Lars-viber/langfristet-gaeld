import { describe, expect, it } from 'vitest';
import { calculateLoan, roundMoney } from '../../src/domain';
import { D } from '../../src/domain/decimal';
import { evaluateDanishFormula, FULL_PRECISION_RATE } from '../../src/validation';
import { r6 } from '../fixtures/r6';

describe('manual Danish calculation parser', () => {
  it.each([
    ['=2+3*4', '14'], ['=(2+3)*4', '20'], ['=7.500.000*1,5%', '112500'],
    ['=100/4+5', '30'], ['=7.275.000-72.750-100.000', '7102250'],
    ['=(7.500.000+500.000)/2', '4000000'], ['=7.500.000*(1,5%+0,5%)', '150000'],
    ['=8.000.000/16', '500000'], ['=-(100-150)', '50'],
    ['= 7.500.000 * 1,5 %', '112500'], ['=--2+3', '5'],
    ['=1,5%', '0.015'], ['=225.000+0', '225000'], ['=112.500*1', '112500'],
  ])('evaluates %s', (input, expected) => {
    const result = evaluateDanishFormula(input);
    expect(result.correct).toBe(true);
    if (result.correct) expect(result.value.eq(expected)).toBe(true);
  });

  it.each([
    ['112.500', 'MISSING_EQUALS'], ['=112.500', 'NO_ACTUAL_OPERATION'],
    ['=(112.500)', 'NO_ACTUAL_OPERATION'], ['=+112.500', 'NO_ACTUAL_OPERATION'],
    ['', 'MISSING_EQUALS'], ['=', 'INVALID_FORMULA'], ['=2+', 'INVALID_FORMULA'],
    ['=1/0', 'DIVISION_BY_ZERO'], ['=[Ukendt]+1', 'UNKNOWN_REFERENCE'],
    [`=[${FULL_PRECISION_RATE}]+1`, 'UNKNOWN_REFERENCE'],
    ['=YDELSE(1)', 'INVALID_FORMULA'], ['=IA(1)', 'INVALID_FORMULA'],
    ['=7.50.000+1', 'INVALID_FORMULA'], ['=1,2,3+1', 'INVALID_FORMULA'],
    ['=1 2+3', 'INVALID_FORMULA'], ['=2^3', 'INVALID_FORMULA'],
    [`=${'('.repeat(100)}1+1${')'.repeat(100)}`, 'INVALID_FORMULA'],
    [`=${'1+'.repeat(600)}1`, 'INVALID_FORMULA'],
  ] as const)('returns %s as %s without throwing', (input, code) => {
    expect(evaluateDanishFormula(input)).toEqual({ correct: false, errorCode: code });
  });

  it('uses the full R6 IA rate instead of its displayed four-decimal percent', () => {
    const loan = calculateLoan(r6.input);
    const principal = loan.proceeds.proceeds;
    const full = roundMoney(principal.mul(loan.effectiveInterest.rate));
    const displayed = new D(loan.effectiveInterest.displayedPercent).div(100);
    expect(full.eq(roundMoney(principal.mul(displayed)))).toBe(false);
    const result = evaluateDanishFormula(`=${principal.toFixed(2).replace('.', ',')}*[${FULL_PRECISION_RATE}]`, {
      [FULL_PRECISION_RATE]: loan.effectiveInterest.rate,
    });
    expect(result.correct).toBe(true);
    if (result.correct) expect(roundMoney(result.value).eq(full)).toBe(true);
  });
});
