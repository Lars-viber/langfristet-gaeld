import type { LoanType } from '../domain';
import { generateLevel1Case } from '../generator';
import { clearStudentSession, loadStudentSession, saveStudentSession } from '../persistence';
import type { LoadResult, SessionStorageAdapter, StorageResult } from '../persistence';
import { applyStudentAction, createStudentState } from '../student';
import type { StudentAction, StudentState } from '../student';

export type StartResult =
  | { status: 'started'; state: StudentState }
  | { status: 'selectionRequired' }
  | { status: 'error'; reason: 'creation' | 'storage' };

export interface StartDependencies {
  seed?: () => number;
  generate?: typeof generateLevel1Case;
}

/** The uint32 seed is created only after the student explicitly starts a selected loan type. */
export function createSecureSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0]!;
}

export function loadAppSession(adapter: SessionStorageAdapter): LoadResult {
  return loadStudentSession(adapter);
}

export function startStudentCase(
  adapter: SessionStorageAdapter,
  loanType: LoanType | null,
  dependencies: StartDependencies = {},
): StartResult {
  if (loanType === null) return { status: 'selectionRequired' };
  let state: StudentState;
  try {
    const seed = (dependencies.seed ?? createSecureSeed)();
    const generatedCase = (dependencies.generate ?? generateLevel1Case)({ loanType, seed });
    state = createStudentState(generatedCase);
  } catch {
    return { status: 'error', reason: 'creation' };
  }
  const saved = saveStudentSession(adapter, state);
  return saved.status === 'saved' ? { status: 'started', state } : { status: 'error', reason: 'storage' };
}

export interface TransitionResult {
  state: StudentState;
  changed: boolean;
  saveError: boolean;
}

export function transitionStudentSession(
  adapter: SessionStorageAdapter,
  state: StudentState,
  action: StudentAction,
): TransitionResult {
  const next = applyStudentAction(state, action);
  if (next === state) return { state, changed: false, saveError: false };
  return { state: next, changed: true, saveError: saveStudentSession(adapter, next).status !== 'saved' };
}

export function clearAppSession(adapter: SessionStorageAdapter): StorageResult {
  return clearStudentSession(adapter);
}
