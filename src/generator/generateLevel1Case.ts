import { calculateLoan } from '../domain';
import { drawCandidate } from './candidate';
import { checkGuardrails } from './guardrails';
import { createPrng } from './prng';
import { GeneratorError } from './types';
import type { GenerateLevel1CaseInput, GeneratedLevel1Case } from './types';

export const GENERATOR_VERSION = '1.0.0';
const MAX_ATTEMPTS = 10_000;

export function generateLevel1Case({ loanType, seed }: GenerateLevel1CaseInput): GeneratedLevel1Case {
  if (loanType !== 'annuity' && loanType !== 'serial' && loanType !== 'bullet') {
    throw new GeneratorError('Invalid loan type');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new GeneratorError('Seed must be an unsigned 32-bit integer');
  }
  const nextUint32 = createPrng(seed);
  for (let attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
    const caseInput = drawCandidate(loanType, nextUint32);
    const result = calculateLoan(caseInput);
    if (checkGuardrails(caseInput, result).length === 0) {
      return { generatorVersion: GENERATOR_VERSION, seed, loanType, attempts, caseInput };
    }
    // A rejected candidate consumes only its draws; the next uses this PRNG stream.
  }
  throw new GeneratorError(`No valid Level 1 case after ${MAX_ATTEMPTS} attempts`);
}
