import { describe, expect, it } from 'vitest';
import { applyStudentAction, createStudentState, scheduleRowStatus } from '../../src/student';
import type { StudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';
function state(): StudentState { const s = createStudentState({ generatorVersion: '1.0.0', seed: 1, loanType: r1.input.loanType, attempts: 1, caseInput: r1.input }); return { ...s, currentStep: 'contractSchedule', viewingStep: 'contractSchedule', completedSteps: ['proceeds'] }; }
describe('R2 payment plan', () => {
  it('requires entered principal and equals calculations before app payment', () => {
    let s = state();
    s = applyStudentAction(s, { type: 'editSchedulePrerequisite', field: 'principal', raw: '=7000000' });
    s = applyStudentAction(s, { type: 'checkSchedulePrerequisite', field: 'principal' });
    expect(s.schedule.prerequisites.principal?.approved).toBe(false);
    for (const [field, raw] of [['principal', '7000000'], ['termRate', '=8%/1'], ['termCount', '=4*1']] as const) { s = applyStudentAction(s, { type: 'editSchedulePrerequisite', field, raw }); s = applyStudentAction(s, { type: 'checkSchedulePrerequisite', field }); }
    expect(scheduleRowStatus(s, 1)).toBe('locked');
    s = applyStudentAction(s, { type: 'calculateAnnuityPayment' });
    expect(s.schedule.annuityPaymentCalculated).toBe(true); expect(scheduleRowStatus(s, 1)).toBe('active');
  });
});
