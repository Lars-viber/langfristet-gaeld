import { LEGACY_SESSION_STORAGE_KEY, SESSION_STORAGE_KEY } from './types';
import type { SessionStorageAdapter } from './types';

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Storage access is deferred so importing persistence has no browser side effects. */
export function createLocalStorageAdapter(storage?: BrowserStorage, key = SESSION_STORAGE_KEY): SessionStorageAdapter {
  const getStorage = (): BrowserStorage => {
    const resolved = storage ?? (globalThis as { localStorage?: BrowserStorage }).localStorage;
    if (!resolved) throw new Error('localStorage unavailable');
    return resolved;
  };
  return {
    load: () => getStorage().getItem(key),
    save: (json) => getStorage().setItem(key, json),
    clear: () => getStorage().removeItem(key),
  };
}

export function createLegacyLocalStorageAdapter(storage?: BrowserStorage): SessionStorageAdapter {
  return createLocalStorageAdapter(storage, LEGACY_SESSION_STORAGE_KEY);
}
