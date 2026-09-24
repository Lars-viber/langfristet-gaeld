import { describe, expect, it } from 'vitest';
import { createPrng, pickUniform } from '../../src/generator/prng';
import { GeneratorError } from '../../src/generator';

describe('local uint32 generator', () => {
  it('restarts from the same seed and returns unsigned 32-bit values', () => {
    for (const seed of [0, 1, 42, 0xFFFFFFFF]) {
      const first = createPrng(seed);
      const second = createPrng(seed);
      const values = Array.from({ length: 20 }, () => first());
      expect(values).toEqual(Array.from({ length: 20 }, () => second()));
      expect(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF)).toBe(true);
    }
  });

  it('rejects the biased tail before choosing an option', () => {
    const draws = [0xFFFFFFFF, 4];
    const next = () => {
      const value = draws.shift();
      if (value === undefined) throw new Error('Unexpected extra draw');
      return value;
    };
    expect(pickUniform(next, ['a', 'b', 'c'])).toBe('b');
    expect(draws).toEqual([]);
  });

  it('rejects an empty option set', () => {
    expect(() => pickUniform(() => 0, [])).toThrow(GeneratorError);
  });
});
