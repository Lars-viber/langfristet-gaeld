import { GeneratorError } from './types';

const UINT32_RANGE = 0x100000000;

/** Mulberry32, fixed for generator v1.0.0. State belongs to one generation. */
export function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}

/** Rejection over the uint32 range prevents modulo bias for every option count. */
export function pickUniform<T>(nextUint32: () => number, options: readonly T[]): T {
  if (options.length === 0 || options.length > UINT32_RANGE) {
    throw new GeneratorError('Invalid generator option count');
  }
  const limit = Math.floor(UINT32_RANGE / options.length) * options.length;
  let value: number;
  do {
    value = nextUint32();
  } while (value >= limit);
  return options[value % options.length]!;
}
