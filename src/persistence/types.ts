import type { StudentState } from '../student';

export const PERSISTENCE_SCHEMA_VERSION = 2;
export const RULESET_VERSION = '1.0.0';
export const SESSION_STORAGE_KEY = 'langfristet-gaeld:level1:session:v2';
export const LEGACY_SESSION_STORAGE_KEY = 'langfristet-gaeld:level1:session:v1';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type PersistenceErrorCode =
  | 'INVALID_SESSION' | 'INVALID_DECIMAL' | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSUPPORTED_RULESET_VERSION' | 'UNSUPPORTED_STUDENT_STATE_VERSION'
  | 'INVALID_GENERATOR_VERSION' | 'MALFORMED_JSON' | 'STORAGE_ERROR';
export type RestoreResult =
  | { status: 'restored'; state: StudentState }
  | { status: 'error'; code: PersistenceErrorCode };
export type LoadResult = RestoreResult | { status: 'empty' };
export type StorageResult = { status: 'saved' | 'cleared' } | { status: 'error'; code: PersistenceErrorCode };

/** Raw JSON storage only. Serialization and validation live outside the adapter. */
export interface SessionStorageAdapter {
  load(): string | null;
  save(json: string): void;
  clear(): void;
}
