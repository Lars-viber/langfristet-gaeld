import { describe, expect, it } from 'vitest';
import { applyStudentAction, createStudentState, STUDENT_STEPS } from '../../src/student';
import { r1 } from '../fixtures/r1';
const fresh = () => createStudentState({ generatorVersion: '1.0.0', seed: 29, loanType: r1.input.loanType, attempts: 1, caseInput: r1.input });
describe('R2 progression', () => {
  it('hides Optagelse and continues directly to Ydelsesplan', () => {
    expect(STUDENT_STEPS).toEqual(['proceeds', 'contractSchedule', 'effectiveInterest', 'amortizedCost', 'classification', 'yearBookkeeping', 'completion', 'finalOverview']);
    let state = fresh();
    state = applyStudentAction(state, { type: 'editProceedsFormula', field: 'variableCost', raw: '=7.000.000*3%' });
    state = applyStudentAction(state, { type: 'checkProceedsField', field: 'variableCost' });
    state = applyStudentAction(state, { type: 'editProceedsFormula', field: 'proceeds', raw: '=7.000.000-210.000-200.000' });
    state = applyStudentAction(state, { type: 'checkProceedsField', field: 'proceeds' });
    expect(state.currentStep).toBe('proceeds');
    state = applyStudentAction(state, { type: 'continueToNextStep' });
    expect(state.currentStep).toBe('contractSchedule');
  });
});
