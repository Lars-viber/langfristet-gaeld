import { describe, expect, it } from 'vitest';
import { calculateLoan } from '../../src/domain';
import { GENERATOR_VERSION, generateLevel1Case, GeneratorError } from '../../src/generator';
import { checkGuardrails } from '../../src/generator/guardrails';
import type { LoanType } from '../../src/domain';

describe('Level 1 generator public API', () => {
  it.each<LoanType>(['annuity', 'serial', 'bullet'])('keeps caller-selected %s', (loanType) => {
    const generated = generateLevel1Case({ loanType, seed: 42 });
    expect(generated).toMatchObject({
      generatorVersion: GENERATOR_VERSION,
      seed: 42,
      loanType,
    });
    expect(generated.attempts).toBeGreaterThanOrEqual(1);
    expect(generated.caseInput.loanType).toBe(loanType);
    expect(checkGuardrails(generated.caseInput, calculateLoan(generated.caseInput))).toEqual([]);
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, 0x100000000])('rejects invalid seed %s', (seed) => {
    expect(() => generateLevel1Case({ loanType: 'annuity', seed })).toThrow(GeneratorError);
  });

  it('rejects an invalid runtime loan type', () => {
    expect(() => generateLevel1Case({ loanType: 'other' as LoanType, seed: 0 })).toThrow(GeneratorError);
  });

  it('accepts both uint32 boundaries', () => {
    expect(generateLevel1Case({ loanType: 'serial', seed: 0 }).seed).toBe(0);
    expect(generateLevel1Case({ loanType: 'serial', seed: 0xFFFFFFFF }).seed).toBe(0xFFFFFFFF);
  });
});
