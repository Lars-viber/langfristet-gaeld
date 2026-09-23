import { SESSION_STORAGE_KEY } from './types';
import type { SessionStorageAdapter } from './types';

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Storage access is deferred so importing persistence has no browser side effects. */
export function createLocalStorageAdapter(storage?: BrowserStorage): SessionStorageAdapter {
  const getStorage = (): BrowserStorage => {
    const resolved = storage ?? (globalThis as { localStorage?: BrowserStorage }).localStorage;
    if (!resolved) throw new Error('localStorage unavailable');
    return resolved;
  };
  return {
    load: () => getStorage().getItem(SESSION_STORAGE_KEY),
    save: (json) => getStorage().setItem(SESSION_STORAGE_KEY, json),
    clear: () => getStorage().removeItem(SESSION_STORAGE_KEY),
  };
}
