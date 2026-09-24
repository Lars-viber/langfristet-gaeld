import { describe, expect, it } from 'vitest';
import { parseDanishNumber } from '../../src/validation';

describe('Danish decimal notation', () => {
  it.each([
    ['7.500.000', '7500000'], ['7.500.000,00', '7500000'],
    ['7500000', '7500000'], ['7500000,00', '7500000'],
    ['7.500.000,25', '7500000.25'], ['7500000,25', '7500000.25'],
    ['7.500', '7500'], ['75.000', '75000'], ['0,01', '0.01'],
    ['1,5', '1.5'], ['879.228,80', '879228.8'], [' 0,00 ', '0'],
  ])('parses %s exactly', (input, expected) => {
    expect(parseDanishNumber(input)?.eq(expected)).toBe(true);
  });

  it.each(['7.50.000', '7..500', '7.500,00,25', '1,2,3', '7,500.00', '.500', '500.', '', '1e6', '-1', '1 000'])
    ('rejects malformed %s', (input) => {
      expect(parseDanishNumber(input)).toBeNull();
    });
});
