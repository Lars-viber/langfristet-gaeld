import { describe, expect, it, vi } from 'vitest';
import type { GenerateLevel1CaseInput, GeneratedLevel1Case } from '../../src/generator';
import { createMemorySessionStorage, loadStudentSession, saveStudentSession } from '../../src/persistence';
import { STUDENT_STEPS, canEditStep, createStudentState } from '../../src/student';
import type { StudentState } from '../../src/student';
import { clearAppSession, createSecureSeed, loadAppSession, startStudentCase, transitionStudentSession } from '../../src/app/controller';
import { r1 } from '../fixtures/r1';
import { r6 } from '../fixtures/r6';

const generated = (seed = 1) => ({
  generatorVersion: '1.0.0', seed, loanType: 'annuity' as const, attempts: 1, caseInput: r1.input,
});
const fresh = (seed = 1): StudentState => createStudentState(generated(seed));

describe('L7 session controller', () => {
  it('does not generate a case before a loan type is selected', () => {
    const adapter = createMemorySessionStorage();
    const generate = vi.fn();
    const seed = vi.fn();
    expect(startStudentCase(adapter, null, { generate, seed })).toEqual({ status: 'selectionRequired' });
    expect(generate).not.toHaveBeenCalled();
    expect(seed).not.toHaveBeenCalled();
    expect(loadAppSession(adapter)).toEqual({ status: 'empty' });
  });

  it('passes the selected loan type and seed to the generator, then saves the case', () => {
    const adapter = createMemorySessionStorage();
    const generate = vi.fn(({ loanType, seed }: GenerateLevel1CaseInput): GeneratedLevel1Case => ({
      generatorVersion: '1.0.0', seed, loanType, attempts: 1, caseInput: r6.input,
    }));
    const result = startStudentCase(adapter, 'bullet', { seed: () => 4294967295, generate });
    expect(generate).toHaveBeenCalledWith({ loanType: 'bullet', seed: 4294967295 });
    expect(result.status).toBe('started');
    expect(loadAppSession(adapter).status).toBe('restored');
  });

  it('creates a uint32 seed with the browser crypto source', () => {
    const seed = createSecureSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('restores a valid stored snapshot and progression', () => {
    const adapter = createMemorySessionStorage();
    const state = fresh(74);
    expect(saveStudentSession(adapter, state).status).toBe('saved');
    const loaded = loadAppSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.generatedCase).toEqual(state.generatedCase);
    expect(loaded.state.currentStep).toBe('proceeds');
  });

  it('opens completed history read-only without rewinding the current step and saves the transition', () => {
    const adapter = createMemorySessionStorage();
    const state: StudentState = {
      ...fresh(), currentStep: 'yearBookkeeping', viewingStep: 'yearBookkeeping',
      completedSteps: [...STUDENT_STEPS.slice(0, 5)],
    };
    const result = transitionStudentSession(adapter, state, { type: 'viewHistoricalStep', step: 'contractSchedule' });
    expect(result.changed).toBe(true);
    expect(result.state.currentStep).toBe('yearBookkeeping');
    expect(result.state.viewingStep).toBe('contractSchedule');
    expect(canEditStep(result.state, 'contractSchedule')).toBe(false);
    expect(loadStudentSession(adapter).status).toBe('restored');
    const back = transitionStudentSession(adapter, result.state, { type: 'returnToCurrentStep' });
    expect(back.state.viewingStep).toBe('yearBookkeeping');
  });

  it('keeps future steps locked and does not save a rejected transition', () => {
    const adapter = createMemorySessionStorage();
    const state = fresh();
    const result = transitionStudentSession(adapter, state, { type: 'viewHistoricalStep', step: 'completion' });
    expect(result).toEqual({ state, changed: false, saveError: false });
    expect(adapter.load()).toBeNull();
  });

  it('resets student work while keeping the same case and seed', () => {
    const adapter = createMemorySessionStorage();
    const edited = transitionStudentSession(adapter, fresh(221), { type: 'editProceedsFormula', field: 'variableCost', raw: '=1+1' }).state;
    const reset = transitionStudentSession(adapter, edited, { type: 'resetCurrentCase' });
    expect(reset.state.generatedCase).toBe(edited.generatedCase);
    expect(reset.state.generatedCase.seed).toBe(221);
    expect(reset.state.proceeds).toEqual({});
    expect(reset.state.currentStep).toBe('proceeds');
    expect(reset.saveError).toBe(false);
  });

  it('clears the saved session so a new case starts at the loan type menu', () => {
    const adapter = createMemorySessionStorage();
    saveStudentSession(adapter, fresh());
    expect(clearAppSession(adapter)).toEqual({ status: 'cleared' });
    expect(loadAppSession(adapter)).toEqual({ status: 'empty' });
  });

  it('keeps a completed session read-only, including historical views', () => {
    const adapter = createMemorySessionStorage();
    const state: StudentState = {
      ...fresh(), currentStep: 'completion', viewingStep: 'completion',
      completedSteps: [...STUDENT_STEPS], sessionStatus: 'completed',
    };
    const ignored = transitionStudentSession(adapter, state, { type: 'editProceedsFormula', field: 'proceeds', raw: '=1+1' });
    expect(ignored.changed).toBe(false);
    const viewed = transitionStudentSession(adapter, state, { type: 'viewHistoricalStep', step: 'proceeds' });
    expect(viewed.state.viewingStep).toBe('proceeds');
    expect(viewed.state.sessionStatus).toBe('completed');
    expect(canEditStep(viewed.state, 'proceeds')).toBe(false);
  });

  it('reports corrupt restore and storage failures without erasing work', () => {
    const corrupt = createMemorySessionStorage('{broken');
    expect(loadAppSession(corrupt)).toEqual({ status: 'error', code: 'MALFORMED_JSON' });
    expect(corrupt.load()).toBe('{broken');
    const blocked = { load: () => null, save: () => { throw new Error('blocked'); }, clear: () => { throw new Error('blocked'); } };
    expect(startStudentCase(blocked, 'annuity', { seed: () => 1, generate: () => generated() })).toEqual({ status: 'error', reason: 'storage' });
    const transition = transitionStudentSession(blocked, fresh(), { type: 'editProceedsFormula', field: 'variableCost', raw: '=1+1' });
    expect(transition.changed).toBe(true);
    expect(transition.saveError).toBe(true);
  });
});
