import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { transitionStudentSession } from '../../src/app/controller';
import { createMemorySessionStorage, loadStudentSession } from '../../src/persistence';
import { applyStudentAction, createStudentState } from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import type { StudentPostingLine } from '../../src/validation';
import { r1 } from '../fixtures/r1';
import { r2 } from '../fixtures/r2';

function fresh(fixture: typeof r1 | typeof r2): StudentState {
  return createStudentState({
    generatorVersion: '1.0.0', seed: 29, loanType: fixture.input.loanType,
    attempts: 1, caseInput: fixture.input,
  });
}
const take = (state: StudentState, action: StudentAction) => {
  const next = applyStudentAction(state, action);
  return next.sessionStatus === 'active' && next.viewingStep === next.currentStep && next.completedSteps.includes(next.currentStep) ? applyStudentAction(next, { type: 'continueToNextStep' }) : next;
};
const render = (state: StudentState) => renderToStaticMarkup(createElement(AppShell, {
  state, onAction: () => {}, onReset: () => {}, onNewCase: () => {},
}));
function checkFormula(state: StudentState, field: 'variableCost' | 'marketValue' | 'brokerage' | 'proceeds', raw: string) {
  return take(take(state, { type: 'editProceedsFormula', field, raw }), { type: 'checkProceedsField', field });
}
function bankAtStep2() {
  let state = fresh(r1);
  state = checkFormula(state, 'variableCost', '=7.000.000*3%');
  return checkFormula(state, 'proceeds', '=7.000.000-210.000-200.000');
}
function bondAtStep2() {
  let state = fresh(r2);
  state = checkFormula(state, 'marketValue', '=7.500.000*97%');
  state = checkFormula(state, 'brokerage', '=7.275.000*1%');
  return checkFormula(state, 'proceeds', '=7.275.000-72.750-100.000');
}
const bankLines: StudentPostingLine[] = [
  { account: '5820', side: 'D', amount: '6590000' },
  { account: '6320', side: 'K', amount: '6590000' },
];

describe('L8A proceeds and initial recognition', () => {
  it('shows a bank calculation with given terms and no answer amounts', () => {
    const html = render(fresh(r1));
    expect(html).toContain('Variable låneomkostninger i kr.');
    expect(html).toContain('Variabel omkostningssats');
    expect(html).toContain('placeholder="Beregn et positivt beløb med ="');
    expect(html).not.toContain('210.000');
    expect(html).not.toContain('6.590.000');
    expect(html).toContain('proceeds-proceeds');
  });

  it('keeps a wrong bank cost editable and preserves the precise negative feedback', () => {
    let state = checkFormula(fresh(r1), 'variableCost', '=7.000.000*2%');
    expect(state.proceeds.variableCost?.approved).toBe(false);
    expect(state.currentStep).toBe('proceeds');
    expect(render(state)).toContain('Beregningen stemmer ikke endnu.');
    state = checkFormula(state, 'variableCost', '=0-210000');
    expect(state.proceeds.variableCost?.errorCode).toBe('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(render(state)).toContain('Beløbet skal beregnes som et positivt beløb.');
    expect(render(state)).not.toContain('proceeds-variableCost\" type=\"text\" inputMode=\"decimal\" autoComplete=\"off\" spellCheck=\"false\" value=\"=0-210000\" readOnly');
  });

  it('locks the approved bank formula verbatim and opens Step 2 after provenu', () => {
    let state = checkFormula(fresh(r1), 'variableCost', '=7.000.000*3%');
    expect(state.proceeds.variableCost?.approved).toBe(true);
    expect(state.proceeds.variableCost?.raw).toBe('=7.000.000*3%');
    expect(render(state)).toContain('value=\"=7.000.000*3%\"');
    expect(render(state)).toContain('aria-label="Godkendt"');
    state = checkFormula(state, 'proceeds', '=7.000.000-210.000-200.000');
    expect(state.currentStep).toBe('initialRecognition');
    expect(render(state)).toContain('Bogfør lånets optagelse.');
  });

  it('requires bond kursværdi, then kurtage, then provenu', () => {
    let state = fresh(r2);
    expect(render(state)).toContain('Nominel hovedstol');
    expect(render(state)).toContain('Kurtagesats');
    state = take(state, { type: 'checkProceedsField', field: 'brokerage' });
    expect(state.proceeds.brokerage).toBeUndefined();
    state = checkFormula(state, 'marketValue', '=7.500.000*97%');
    expect(state.proceeds.marketValue?.approved).toBe(true);
    state = checkFormula(state, 'brokerage', '=7.275.000*1%');
    expect(state.proceeds.brokerage?.approved).toBe(true);
    state = checkFormula(state, 'proceeds', '=7.275.000-72.750-100.000');
    expect(state.currentStep).toBe('initialRecognition');
  });

  it('preserves all six account choices and does not reveal a posting amount', () => {
    const state = take(bankAtStep2(), { type: 'setInitialRecognitionLines', lines: [{ account: '4410', side: 'D', amount: '' }] });
    const html = render(state);
    for (const account of ['4410', '4450', '5820', '6320', '6330', '6760']) {
      expect(html).toContain(account);
    }
    expect(html).not.toContain('6.590.000');
    expect(html).toContain('Tilføj linje');
    expect(html).not.toContain('Indsæt provenu');
  });

  it('keeps every posting line editable when the block is wrong', () => {
    let state = bankAtStep2();
    state = take(state, { type: 'setInitialRecognitionLines', lines: [
      { account: '5820', side: 'D', amount: '6590000' },
      { account: '6320', side: 'K', amount: '6500000' },
    ] });
    state = take(state, { type: 'checkInitialRecognition' });
    expect(state.initialRecognition.approved).toBe(false);
    expect(state.currentStep).toBe('initialRecognition');
    const html = render(state);
    expect(html).toContain('Tilføj linje');
    expect(html).toContain('Slet linje');
    expect(html).toContain('Beregningen stemmer ikke endnu.');
    expect(html).not.toContain('Du mangler');
  });

  it('approves the whole correct block and advances without changing the lines', () => {
    let state = bankAtStep2();
    state = take(state, { type: 'setInitialRecognitionLines', lines: bankLines });
    state = take(state, { type: 'checkInitialRecognition' });
    expect(state.initialRecognition.approved).toBe(true);
    expect(state.initialRecognition.lines).toEqual(bankLines);
    expect(state.currentStep).toBe('contractSchedule');
    state = take(state, { type: 'viewHistoricalStep', step: 'initialRecognition' });
    const html = render(state);
    expect(html).toContain('Hele posteringen godkendt');
    expect(html).not.toContain('Tilføj linje');
    expect(html).not.toContain('Slet linje');
    expect(html).toContain('disabled');
  });

  it('accepts and preserves multiple lines with the correct net movements', () => {
    let state = bankAtStep2();
    const lines: StudentPostingLine[] = [
      { account: '5820', side: 'D', amount: '6600000' },
      { account: '5820', side: 'K', amount: '10000' },
      { account: '6320', side: 'K', amount: '6590000' },
    ];
    state = take(state, { type: 'setInitialRecognitionLines', lines });
    state = take(state, { type: 'checkInitialRecognition' });
    expect(state.initialRecognition.approved).toBe(true);
    expect(state.initialRecognition.lines).toEqual(lines);
  });

  it('restores partial Step 1 and Step 2 work and shows both steps as history', () => {
    const adapter = createMemorySessionStorage();
    let state = transitionStudentSession(adapter, fresh(r2), {
      type: 'editProceedsFormula', field: 'marketValue', raw: '=7.500.000*97%',
    }).state;
    state = transitionStudentSession(adapter, state, { type: 'checkProceedsField', field: 'marketValue' }).state;
    state = transitionStudentSession(adapter, state, {
      type: 'editProceedsFormula', field: 'brokerage', raw: '=7.275.000*1%',
    }).state;
    let loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.proceeds.marketValue?.approved).toBe(true);
    expect(loaded.state.proceeds.brokerage?.raw).toBe('=7.275.000*1%');
    state = bondAtStep2();
    state = transitionStudentSession(adapter, state, { type: 'setInitialRecognitionLines', lines: [
      { account: '5820', side: 'D', amount: '7102250' },
      { account: '6330', side: 'K', amount: '7102250' },
    ] }).state;
    loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.initialRecognition.lines).toEqual(state.initialRecognition.lines);
    state = transitionStudentSession(adapter, loaded.state, { type: 'checkInitialRecognition' }).state;
    state = transitionStudentSession(adapter, state, { type: 'continueToNextStep' }).state;
    expect(state.currentStep).toBe('contractSchedule');
    for (const step of ['proceeds', 'initialRecognition'] as const) {
      const history = take(state, { type: 'viewHistoricalStep', step });
      const html = render(history);
      expect(html).toContain('Trinnet er skrivebeskyttet.');
      expect(html).not.toContain('Tilføj linje');
      if (step === 'proceeds') expect(html).toContain('value=\"=7.500.000*97%\"');
      else expect(html).toContain('value=\"7102250\"');
    }
  });
});
