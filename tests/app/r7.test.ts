import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { calculateAccountBalances } from '../../src/domain';
import { applyStudentAction, canEditStep, createStudentState, STUDENT_STEPS } from '../../src/student';
import type { StudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';

function atReview(): StudentState {
  const state = createStudentState({ generatorVersion: '1.0.0', seed: 1, loanType: r1.input.loanType, attempts: 1, caseInput: r1.input });
  state.currentStep = 'finalOverview'; state.viewingStep = 'finalOverview';
  state.completedSteps = [...STUDENT_STEPS.slice(0, 6)];
  state.caseResult.accountBalances = calculateAccountBalances(state.caseResult.input, state.caseResult.postingEvents);
  state.proceeds.proceeds = { raw: '=7.000.000-105.000-305.000', approved: true, errorCode: null };
  state.schedule.rows[1] = { nominalInterest: { raw: '=7.000.000*8%', approved: true, errorCode: null } };
  state.effectiveInterest.rows[0] = { amount: '6.590.000', sign: '+', approved: true, errorCode: null };
  state.initialRecognition.lines = [
    { account: '5820', side: 'D', amount: '=6.000.000+590.000' },
    { account: '6320', side: 'K', amount: '6.590.000' },
  ];
  state.initialRecognition.approved = true;
  state.completion.balances['5820'] = { raw: '=1.500.000+6.590.000', side: 'D', approved: true, errorCode: null };
  state.completion.checks = { debtReconciles: true, financialExpenseReconciles: true, accountsReconcile: true };
  return state;
}
const html = (state: StudentState) => renderToStaticMarkup(createElement(AppShell, { state, onAction: () => {}, onReset: () => {}, onNewCase: () => {} }));

describe('R7 read-only review and final completion', () => {
  it('requires prior six steps and explicitly completes without erasing work', () => {
    const review = atReview();
    expect(review.sessionStatus).toBe('active');
    expect(review.completedSteps).toHaveLength(6);
    const blocked = { ...review, completedSteps: [...review.completedSteps.slice(0, 5)] };
    expect(applyStudentAction(blocked, { type: 'finishLevel1' })).toBe(blocked);
    const finished = applyStudentAction(review, { type: 'finishLevel1' });
    expect(finished.sessionStatus).toBe('completed');
    expect(finished.completedSteps).toEqual(STUDENT_STEPS);
    expect(finished.currentStep).toBe('finalOverview');
    expect(finished.initialRecognition.lines).toEqual(review.initialRecognition.lines);
    expect(finished.completion.balances).toEqual(review.completion.balances);
    expect(canEditStep(finished, 'proceeds')).toBe(false);
    expect(canEditStep(finished, 'finalOverview')).toBe(false);
    expect(applyStudentAction(finished, { type: 'viewHistoricalStep', step: 'proceeds' }).viewingStep).toBe('proceeds');
    expect(applyStudentAction(finished, { type: 'startNewCase', generatedCase: review.generatedCase }).sessionStatus).toBe('active');
  });

  it('renders the full ordered overview, all six accounts and actual numbered lines', () => {
    const review = atReview();
    const markup = html(review);
    for (const title of ['Opgavetekst', 'Låneaftalen', 'Provenu', 'Ydelsesplan', 'Pengestrømme', 'Effektiv rente pr. termin',
      'Amortiseret kostpris – Resultat', 'Amortiseret kostpris – Balance', 'Kortfristet og langfristet del',
      'Bogføring og slutsaldi på T-konti', 'Afslutningsstatus']) expect(markup).toContain(title);
    expect(markup).toContain(review.caseResult.effectiveInterest.displayedPercent.replace('.', ',') + ' %');
    expect(markup).toContain('=7.000.000-105.000-305.000');
    expect(markup).toContain('=6.000.000+590.000');
    expect(markup).toContain('Saldo primo');
    expect(markup).toContain('Afstemningen er godkendt.');
    expect(markup).toContain('aria-label="Postering 1"');
    expect(markup.match(/class="r6-account"/g)).toHaveLength(6);
    expect(markup.match(/class="progress-step /g)).toHaveLength(7);
    expect(markup).not.toContain('Slutsaldi</');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('Vis flere');
    expect(markup.lastIndexOf('Afslut Niveau 1')).toBeGreaterThan(markup.lastIndexOf('Afslutningsstatus'));
    expect(html(applyStudentAction(review, { type: 'finishLevel1' }))).toContain('Niveau 1 er afsluttet');
  });
});
