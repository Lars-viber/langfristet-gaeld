import { describe, expect, it } from 'vitest';
import { GENERATOR_VERSION } from '../../src/generator';
import {
  PERSISTENCE_SCHEMA_VERSION, RULESET_VERSION, SESSION_STORAGE_KEY,
  clearStudentSession, createLocalStorageAdapter, createMemorySessionStorage,
  loadStudentSession, saveStudentSession,
} from '../../src/persistence';
import { STUDENT_STATE_VERSION, createStudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';

const state = () => createStudentState({ generatorVersion: GENERATOR_VERSION, seed: 1, loanType: 'annuity', attempts: 1, caseInput: r1.input });

describe('L6 storage', () => {
  it('returns empty for absent storage, and clear removes a saved session', () => {
    const adapter = createMemorySessionStorage();
    expect(loadStudentSession(adapter)).toEqual({ status: 'empty' });
    expect(saveStudentSession(adapter, state())).toEqual({ status: 'saved' });
    expect(loadStudentSession(adapter).status).toBe('restored');
    expect(clearStudentSession(adapter)).toEqual({ status: 'cleared' });
    expect(loadStudentSession(adapter)).toEqual({ status: 'empty' });
  });

  it('returns a controlled error for malformed JSON without clearing it', () => {
    const adapter = createMemorySessionStorage('{broken');
    expect(loadStudentSession(adapter)).toEqual({ status: 'error', code: 'MALFORMED_JSON' });
    expect(adapter.load()).toBe('{broken');
  });

  it('handles storage exceptions for load, save and clear', () => {
    const adapter = { load: () => { throw new Error('blocked'); }, save: () => { throw new Error('blocked'); }, clear: () => { throw new Error('blocked'); } };
    expect(loadStudentSession(adapter)).toEqual({ status: 'error', code: 'STORAGE_ERROR' });
    expect(saveStudentSession(adapter, state())).toEqual({ status: 'error', code: 'STORAGE_ERROR' });
    expect(clearStudentSession(adapter)).toEqual({ status: 'error', code: 'STORAGE_ERROR' });
  });

  it('uses the versioned project key and explicit versions', () => {
    const values = new Map<string, string>();
    const adapter = createLocalStorageAdapter({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    });
    expect(SESSION_STORAGE_KEY).toBe('langfristet-gaeld:level1:session:v1');
    expect(saveStudentSession(adapter, state())).toEqual({ status: 'saved' });
    const doc = JSON.parse(values.get(SESSION_STORAGE_KEY)!);
    expect(doc.schemaVersion).toBe(PERSISTENCE_SCHEMA_VERSION);
    expect(doc.rulesetVersion).toBe(RULESET_VERSION);
    expect(doc.studentStateVersion).toBe(STUDENT_STATE_VERSION);
    expect(doc.generatorVersion).toBe(GENERATOR_VERSION);
    expect(clearStudentSession(adapter)).toEqual({ status: 'cleared' });
    expect(values.has(SESSION_STORAGE_KEY)).toBe(false);
  });
});
