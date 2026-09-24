import { describe, expect, it, vi } from 'vitest';
import { D } from '../../src/domain/decimal';
import * as generator from '../../src/generator';
import { deserializeStudentSession, serializeStudentSession } from '../../src/persistence';
import { STUDENT_STEPS, applyStudentAction, canEditStep, createStudentState, resetCurrentCase } from '../../src/student';
import type { StudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';

const fresh = (seed = 1): StudentState => createStudentState({
  generatorVersion: generator.GENERATOR_VERSION, seed, loanType: 'annuity', attempts: 1, caseInput: r1.input,
});
const dto = (state: StudentState): Record<string, any> => JSON.parse(JSON.stringify(serializeStudentSession(state)));
const restored = (state: StudentState): StudentState => {
  const result = deserializeStudentSession(dto(state));
  expect(result.status).toBe('restored');
  if (result.status !== 'restored') throw new Error(result.code);
  return result.state;
};
const reject = (value: unknown, code: string): void => {
  expect(deserializeStudentSession(value)).toEqual({ status: 'error', code });
};

describe('L6 serialization', () => {
  it('roundtrips a fresh step-1 state through JSON', () => {
    const state = fresh();
    expect(restored(state)).toEqual(state);
  });

  it('keeps in-progress proceeds formula and feedback byte for byte', () => {
    let state = fresh();
    state = applyStudentAction(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=7.500.000*1,5%' });
    state = applyStudentAction(state, { type: 'checkProceedsField', field: 'variableCost' });
    expect(restored(state).proceeds.variableCost).toEqual(state.proceeds.variableCost);
    expect(restored(state).proceeds.variableCost?.raw).toBe('=7.500.000*1,5%');
  });

  it('retains approved fields, schedule progression and app-calculated status', () => {
    const base = fresh();
    const state: StudentState = {
      ...base, currentStep: 'effectiveInterest', viewingStep: 'effectiveInterest',
      completedSteps: ['proceeds', 'initialRecognition', 'contractSchedule'],
      schedule: { prerequisites: { termCount: { raw: '4', approved: true, errorCode: null } }, annuityPaymentCalculated: true,
        rows: { 1: { openingPrincipal: { raw: '=7.000.000+0', approved: true, errorCode: null } } },
        approvedTerms: [1, 2], remainingCalculated: true },
    };
    const result = restored(state);
    expect(result.schedule).toEqual(state.schedule);
    expect(applyStudentAction(result, { type: 'editScheduleField', term: 1, field: 'openingPrincipal', raw: '=1+1' })).toBe(result);
  });

  it('roundtrips the annuity payment action and restores older schedule snapshots', () => {
    const base = fresh();
    const ready: StudentState = {
      ...base, currentStep: 'contractSchedule', viewingStep: 'contractSchedule',
      completedSteps: ['proceeds', 'initialRecognition'],
      schedule: { ...base.schedule, prerequisites: {
        termCount: { raw: '=4*1', approved: true, errorCode: null },
        termRate: { raw: '=8%/1', approved: true, errorCode: null },
      } },
    };
    const calculated = applyStudentAction(ready, { type: 'calculateAnnuityPayment' });
    expect(calculated.schedule.annuityPaymentCalculated).toBe(true);
    expect(restored(calculated).schedule.annuityPaymentCalculated).toBe(true);
    const older = dto({ ...calculated, schedule: { ...calculated.schedule, approvedTerms: [1] } });
    delete older.studentState.schedule.annuityPaymentCalculated;
    const result = deserializeStudentSession(older);
    expect(result.status).toBe('restored');
    if (result.status === 'restored') expect(result.state.schedule.annuityPaymentCalculated).toBe(true);
  });

  it('keeps original bookkeeping lines in order, including intermediate postings', () => {
    const base = fresh();
    const lines = [
      { account: '5820' as const, side: 'D' as const, amount: '6.590.100,00' },
      { account: '5820' as const, side: 'K' as const, amount: '100,00' },
      { account: '6320' as const, side: 'K' as const, amount: '6.590.000,00' },
    ];
    const state: StudentState = { ...base, currentStep: 'yearBookkeeping', viewingStep: 'yearBookkeeping',
      completedSteps: [...STUDENT_STEPS.slice(0, 5)],
      bookkeeping: { 1: { payment: { ...base.bookkeeping[1]!.payment, lines, approved: true }, amortization: base.bookkeeping[1]!.amortization } },
    };
    const result = restored(state);
    expect(result.bookkeeping[1]?.payment.lines).toEqual(lines);
    expect(applyStudentAction(result, { type: 'setBookkeepingBlock', term: 1, block: 'payment', lines: [] })).toBe(result);
  });

  it('keeps sign and D/K choices, approved balances and final checks', () => {
    const base = fresh();
    const state: StudentState = { ...base, currentStep: 'completion', viewingStep: 'completion',
      completedSteps: [...STUDENT_STEPS.slice(0, 7)],
      effectiveInterest: { ...base.effectiveInterest, rows: { 0: { amount: '6.590.000,00', sign: '+', approved: true, errorCode: null } } },
      completion: { balances: { '4410': { raw: '=560.000+0', side: 'D', approved: true, errorCode: null } },
        checks: { debtReconciles: true, financialExpenseReconciles: false, accountsReconcile: false } },
    };
    const result = restored(state);
    expect(result.effectiveInterest).toEqual(state.effectiveInterest);
    expect(result.completion).toEqual(state.completion);
    expect(applyStudentAction(result, { type: 'editFinalBalance', account: '4410', formula: '=1+1' })).toBe(result);
  });

  it('restores historical viewing without rewinding current progression', () => {
    const state: StudentState = { ...fresh(), currentStep: 'yearBookkeeping', viewingStep: 'contractSchedule', completedSteps: [...STUDENT_STEPS.slice(0, 5)] };
    const result = restored(state);
    expect(result.currentStep).toBe('yearBookkeeping');
    expect(result.viewingStep).toBe('contractSchedule');
    expect(canEditStep(result, 'contractSchedule')).toBe(false);
  });

  it('stores full IA precision and money as decimal strings', () => {
    const state = fresh();
    const exact = state.caseResult.effectiveInterest.rate.toFixed();
    const saved = dto(state);
    expect(saved.studentState.caseResult.effectiveInterest.rate).toBe(exact);
    expect(typeof saved.studentState.caseResult.proceeds.proceeds).toBe('string');
    const result = restored(state);
    expect(result.caseResult.effectiveInterest.rate).toBeInstanceOf(D);
    expect(result.caseResult.effectiveInterest.rate.toFixed()).toBe(exact);
    expect(result.caseResult.proceeds.proceeds.toFixed(2)).toBe('6590000.00');
  });

  it('restores a completed session as read-only', () => {
    const state: StudentState = { ...fresh(), currentStep: 'completion', viewingStep: 'proceeds',
      completedSteps: [...STUDENT_STEPS], sessionStatus: 'completed',
      completion: { balances: {}, checks: { debtReconciles: true, financialExpenseReconciles: true, accountsReconcile: true } },
    };
    const result = restored(state);
    expect(result.sessionStatus).toBe('completed');
    expect(result.completedSteps).toEqual(STUDENT_STEPS);
    expect(result.completion.checks).toEqual(state.completion.checks);
    expect(canEditStep(result, 'completion')).toBe(false);
  });

  it('roundtrips reset state with the same generated case', () => {
    const state = resetCurrentCase({ ...fresh(123), currentStep: 'initialRecognition' });
    expect(restored(state).generatedCase).toEqual(state.generatedCase);
    expect(restored(state).currentStep).toBe('proceeds');
  });

  it('never calls the generator on restore, even with a different generatorVersion', () => {
    const spy = vi.spyOn(generator, 'generateLevel1Case');
    const saved = dto(fresh());
    saved.generatorVersion = '0.9.0';
    saved.generatedCase.generatorVersion = '0.9.0';
    expect(deserializeStudentSession(saved).status).toBe('restored');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each([0, 0xFFFFFFFF])('restores seed %i', (seed) => {
    expect(restored(fresh(seed)).generatedCase.seed).toBe(seed);
  });

  it('returns a controlled error for malformed Decimal', () => {
    const saved = dto(fresh());
    saved.studentState.caseResult.effectiveInterest.rate = 'NaN';
    reject(saved, 'INVALID_DECIMAL');
  });

  it('rejects unsupported schema, ruleset and student-state versions', () => {
    const saved = dto(fresh());
    reject({ ...saved, schemaVersion: 2 }, 'UNSUPPORTED_SCHEMA_VERSION');
    reject({ ...saved, rulesetVersion: '2.0.0' }, 'UNSUPPORTED_RULESET_VERSION');
    reject({ ...saved, studentStateVersion: 2 }, 'UNSUPPORTED_STUDENT_STATE_VERSION');
  });

  it('checks loan type, seed, date, generator version and snapshot identity', () => {
    const saved = dto(fresh());
    reject({ ...saved, selectedLoanType: 'unknown' }, 'INVALID_SESSION');
    reject({ ...saved, seed: -1 }, 'INVALID_SESSION');
    reject({ ...saved, generatorVersion: 'bad' }, 'INVALID_GENERATOR_VERSION');
    const invalidDate = dto(fresh());
    invalidDate.generatedCase.caseInput.issueDate = '2026-02-30';
    reject(invalidDate, 'INVALID_SESSION');
    const changedCase = dto(fresh());
    changedCase.generatedCase.caseInput.nominalPrincipal = '1';
    reject(changedCase, 'INVALID_SESSION');
  });
});
