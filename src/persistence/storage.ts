import type { SessionStorageAdapter } from './types';

/** Small deterministic adapter for controllers and tests. */
export function createMemorySessionStorage(initial: string | null = null): SessionStorageAdapter {
  let json = initial;
  return {
    load: () => json,
    save: (value) => { json = value; },
    clear: () => { json = null; },
  };
}
