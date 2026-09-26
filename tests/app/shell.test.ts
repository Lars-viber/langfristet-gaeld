import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { STUDENT_STEPS, createStudentState } from '../../src/student';
import type { StudentState } from '../../src/student';
import { r1 } from '../fixtures/r1';

const fresh = (): StudentState => createStudentState({
  generatorVersion: '1.0.0', seed: 42, loanType: 'annuity', attempts: 1, caseInput: r1.input,
});
const render = (state: StudentState) => renderToStaticMarkup(createElement(AppShell, {
  state, onAction: () => {}, onReset: () => {}, onNewCase: () => {},
}));

describe('L7 shell structure', () => {
  it('shows only supplied case terms and eight labelled progress steps', () => {
    const state = fresh();
    const html = render(state);
    expect(html).toContain('Låneaftalen');
    expect(html).toContain('Annuitetslån');
    expect(html).toContain('7.000.000,00 kr.');
    expect(html).toContain('8 % p.a.');
    expect((html.match(/class="progress-step /g) ?? [])).toHaveLength(8);
    expect(html).toContain('status-current');
    expect(html).toContain('status-locked');
    expect(html).not.toContain('6.590.000,00');
    expect(html).not.toContain(state.caseResult.effectiveInterest.rate.toString());
  });

  it('marks historical and completed sessions read-only', () => {
    const base = fresh();
    const historical: StudentState = {
      ...base, currentStep: 'yearBookkeeping', viewingStep: 'contractSchedule',
      completedSteps: [...STUDENT_STEPS.slice(0, 5)],
    };
    const historyHtml = render(historical);
    expect(historyHtml).toContain('Du ser et tidligere trin');
    expect(historyHtml).toContain('Tilbage til aktuelt trin');
    expect(historyHtml).toContain('Trinnet er skrivebeskyttet.');
    expect(historyHtml).not.toContain('historical-banner');
    expect(historyHtml).toMatch(/class="schedule-reference"[^>]*>[\s\S]*Tilbage til aktuelt trin[\s\S]*<\/aside>/);
    expect(historyHtml).not.toContain('Fortsæt til Effektiv rente');
    const proceedsHistory = render({ ...historical, viewingStep: 'proceeds' });
    expect(proceedsHistory).not.toContain('historical-banner');
    expect(proceedsHistory).toMatch(/class="proceeds-reference"[^>]*>[\s\S]*Du ser et tidligere trin[\s\S]*Tilbage til aktuelt trin[\s\S]*<\/aside>/);
    expect(proceedsHistory).not.toContain('Fortsæt til Ydelsesplan');
    const laterHistory = render({ ...historical, viewingStep: 'amortizedCost' });
    expect(laterHistory).not.toContain('historical-banner');
    expect(laterHistory).toContain('Tilbage til aktuelt trin');
    const completed: StudentState = {
      ...base, currentStep: 'completion', viewingStep: 'completion',
      completedSteps: [...STUDENT_STEPS], sessionStatus: 'completed',
    };
    const completedHtml = render(completed);
    expect(completedHtml).toContain('Niveau 1 gennemført');
    expect(completedHtml).toContain('Kun visning');
  });

  it('keeps the active schedule check action in the left information box', () => {
    const base = fresh();
    const approved = { raw: '=1+1', approved: true, errorCode: null };
    const state: StudentState = { ...base, currentStep: 'contractSchedule', viewingStep: 'contractSchedule', completedSteps: ['proceeds'],
      schedule: { ...base.schedule, annuityPaymentCalculated: true,
        prerequisites: { principal: approved, termRate: approved, termCount: approved } } };
    const html = render(state);
    expect(html).toMatch(/class="schedule-reference"[^>]*>[\s\S]*Kontrollér termin 1[\s\S]*<\/aside>/);
    expect(html.match(/Kontrollér termin 1/g)).toHaveLength(1);
  });
});
