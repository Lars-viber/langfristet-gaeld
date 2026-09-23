import type { StudentState } from '../student';
import { deserializeStudentSession } from './deserialize';
import { serializeStudentSession } from './serialize';
import type { LoadResult, SessionStorageAdapter, StorageResult } from './types';

export function saveStudentSession(adapter: SessionStorageAdapter, state: StudentState): StorageResult {
  try {
    adapter.save(JSON.stringify(serializeStudentSession(state)));
    return { status: 'saved' };
  } catch { return { status: 'error', code: 'STORAGE_ERROR' }; }
}

export function loadStudentSession(adapter: SessionStorageAdapter): LoadResult {
  let json: string | null;
  try { json = adapter.load(); }
  catch { return { status: 'error', code: 'STORAGE_ERROR' }; }
  if (json === null) return { status: 'empty' };
  try { return deserializeStudentSession(JSON.parse(json) as unknown); }
  catch { return { status: 'error', code: 'MALFORMED_JSON' }; }
}

export function clearStudentSession(adapter: SessionStorageAdapter): StorageResult {
  try { adapter.clear(); return { status: 'cleared' }; }
  catch { return { status: 'error', code: 'STORAGE_ERROR' }; }
}
