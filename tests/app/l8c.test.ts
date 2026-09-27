import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '../../src/app/AppShell';
import { AmortizationStep, EFFECTIVE_RATE_REFERENCE, insertEffectiveRateReference } from '../../src/components/AmortizationStep';
import { lastManualTermValues } from '../../src/domain';
import { transitionStudentSession } from '../../src/app/controller';
import { createMemorySessionStorage, loadStudentSession, saveStudentSession } from '../../src/persistence';
import { amortizationSubrowStatus, applyStudentAction, createStudentState, deriveStudentView } from '../../src/student';
import type { StudentAction, StudentState } from '../../src/student';
import type { StudentPostingLine } from '../../src/validation';
import { r1 } from '../fixtures/r1';
import { r3 } from '../fixtures/r3';
import { r5 } from '../fixtures/r5';
import type { GoldenFixture } from '../fixtures/types';

const take = (state: StudentState, action: StudentAction) => {
  return applyStudentAction(state, action);
};
const render = (state: StudentState) => renderToStaticMarkup(createElement(AppShell, {
  state, onAction: () => {}, onReset: () => {}, onNewCase: () => {},
}));
const number = (value: { toFixed(places: number): string }) => value.toFixed(2).replace('.', ',');
const formula = (value: { toFixed(places: number): string }) => `=${number(value)}+0`;

function atStep5(fixture: GoldenFixture): StudentState {
  const state = createStudentState({
    generatorVersion: '1.0.0', seed: 29, loanType: fixture.input.loanType,
    attempts: 1, caseInput: fixture.input,
  });
  // Earlier steps are covered by L8A/L8B; focus this fixture on the Step 5 boundary.
  return { ...state, currentStep: 'amortizedCost', viewingStep: 'amortizedCost',
    completedSteps: ['proceeds', 'contractSchedule', 'effectiveInterest'] };
}

function approveSubrow(state: StudentState, term: number, subtable: 'income' | 'balance'): StudentState {
  const row = subtable === 'income' ? state.caseResult.incomeSchedule[term - 1]! : state.caseResult.carryingSchedule[term - 1]!;
  const last = state.generatedCase.loanType === 'bullet' && term === state.caseResult.contract.rows.length
    ? lastManualTermValues(state.caseResult.incomeSchedule[term - 1]!, state.caseResult.carryingSchedule[term - 1]!, state.caseResult.effectiveInterest.rate) : null;
  const fields = subtable === 'income'
    ? ['nominalInterest', 'totalInterestExpense', 'amortization'] as const
    : ['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'] as const;
  for (const field of fields) {
    const value = last && (field === 'totalInterestExpense' || field === 'amortization' || field === 'closingCarryingAmount')
      ? last[field] : (row as unknown as Record<string, { toFixed(places: number): string }>)[field]!;
    const transfer = subtable === 'income' ? field === 'nominalInterest' : field !== 'closingCarryingAmount';
    state = take(state, { type: 'editAmortizationField', term, subtable, field, raw: transfer ? number(value) : formula(value) });
    if (subtable === 'income') state = take(state, { type: 'checkAmortizationSubrow', term, subtable });
  }
  if (subtable === 'balance') state = take(state, { type: 'checkAmortizationSubrow', term, subtable });
  expect(state.amortization.terms[term]?.[`${subtable}Approved`]).toBe(true);
  return state;
}

function atStep6(fixture: GoldenFixture): StudentState {
  let state = atStep5(fixture);
  for (const term of [1, 2]) {
    state = approveSubrow(state, term, 'income');
    state = approveSubrow(state, term, 'balance');
  }
  state = take(state, { type: 'calculateRemainingAmortization' });
  expect(state.currentStep).toBe('amortizedCost');
  return { ...state, currentStep: 'yearBookkeeping', viewingStep: 'yearBookkeeping',
    completedSteps: ['proceeds', 'contractSchedule', 'effectiveInterest', 'amortizedCost', 'classification'] };
}

function eventLines(state: StudentState, term: number, kind: 'payment' | 'amortization'): StudentPostingLine[] {
  const event = state.caseResult.postingEvents.find((entry) => entry.kind === kind && entry.term === term)!;
  return event.movements.map((movement) => ({ account: movement.account,
    side: movement.amount.isNegative() ? 'K' : 'D', amount: number(movement.amount.abs()) }));
}

function approveBlock(state: StudentState, term: number, block: 'payment' | 'amortization', lines = eventLines(state, term, block)): StudentState {
  state = take(state, { type: 'setBookkeepingBlock', term, block, lines });
  state = take(state, { type: 'checkBookkeepingBlock', term, block });
  expect(state.bookkeeping[term]?.[block].approved).toBe(true);
  return state;
}

describe('L8C amortization and year bookkeeping', () => {
  it('starts with result term 1 and keeps both tables in fixed column order without leaking answers', () => {
    const state = atStep5(r1);
    const html = render(state);
    expect(deriveStudentView(state)).toMatchObject({ activeAmortizationTerm: 1, activeAmortizationSubtable: 'income' });
    expect(html).toMatch(/Termin<\/th><th scope="col">Dato<\/th><th scope="col">Nominel rente<\/th><th scope="col">Amortisering<\/th><th scope="col">Renteomkostning i alt/);
    expect(html).toMatch(/Termin<\/th><th scope="col">Dato<\/th><th scope="col">Kostpris primo<\/th><th scope="col">Afdrag<\/th><th scope="col">Amortisering<\/th><th scope="col">Kostpris ultimo/);
    expect(html).not.toContain('149.359,86');
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('locked');
  });

  it('shows the full-precision token and validates Resultat in dependency order', () => {
    let state = atStep5(r1);
    const starting = render(state);
    expect(starting).toContain('Afventer renteomkostning i alt');
    expect(starting).toContain('Afventer nominel rente');
    expect(take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'amortization', raw: '=1+1' })).toBe(state);
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(state.amortization.terms[1]?.income.nominalInterest?.errorCode).not.toBeNull();
    expect(state.amortization.terms[1]?.income.amortization?.errorCode ?? null).toBeNull();
    state = take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'nominalInterest', raw: '560000' });
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(state.amortization.terms[1]?.income.nominalInterest?.approved).toBe(true);
    const afterNominal = render(state);
    expect(afterNominal).toContain('placeholder="Beregn med ="');
    expect(afterNominal).toContain('Indsæt effektiv rente');
    expect(afterNominal).toContain('Afventer renteomkostning i alt');
    expect(take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'amortization', raw: '=1+1' })).toBe(state);
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(state.amortization.terms[1]?.income.totalInterestExpense?.errorCode).not.toBeNull();
    expect(state.amortization.terms[1]?.income.amortization?.errorCode ?? null).toBeNull();
    const expenseRaw = '=6.590.000*[Effektiv rente · fuld præcision]';
    state = take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'totalInterestExpense', raw: expenseRaw });
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(state.amortization.terms[1]?.income.totalInterestExpense?.approved).toBe(true);
    expect(render(state)).not.toContain('>Indsæt effektiv rente</button>');
    expect(render(state)).toContain(`value="${expenseRaw}"`);
    expect(render(state)).not.toContain(state.caseResult.effectiveInterest.rate.toString());
    const amortization = state.caseResult.incomeSchedule[0]!.amortization;
    state = take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'amortization', raw: formula(amortization) });
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(state.amortization.terms[1]?.incomeApproved).toBe(true);
    expect(take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'nominalInterest', raw: '=2+2' })).toBe(state);
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('active');
    expect(render(state)).toContain('560.000,00 kr.');
  });

  it('opens balance term 1 only after the complete result row', () => {
    let state = atStep5(r1);
    state = approveSubrow(state, 1, 'income');
    expect(amortizationSubrowStatus(state, 1, 'income')).toBe('approved');
    expect(amortizationSubrowStatus(state, 1, 'balance')).toBe('active');
    expect(amortizationSubrowStatus(state, 2, 'income')).toBe('locked');
  });

  it('progresses result T1, balance T1, result T2, balance T2, then app remainder', () => {
    let state = atStep5(r3);
    for (const term of [1, 2]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
      expect(state.amortization.terms[term]?.approved).toBe(true);
    }
    expect(state.amortization.remainingCalculated).toBe(true);
    expect(state.currentStep).toBe('amortizedCost');
    expect(amortizationSubrowStatus(state, 3, 'income')).toBe('appCalculated');
    const history = take(state, { type: 'viewHistoricalStep', step: 'amortizedCost' });
    expect(render(history)).toContain('calculated-value');
    expect(render(history)).toContain('readOnly');
  });

  it('keeps the standing loan last term manual after the intervening rows open', () => {
    let state = atStep5(r5);
    for (const term of [1, 2]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
    }
    expect(amortizationSubrowStatus(state, 3, 'income')).toBe('appCalculated');
    expect(amortizationSubrowStatus(state, 20, 'income')).toBe('active');
    expect(state.amortization.remainingCalculated).toBe(false);
  });

  it('inserts only the rate reference at the caret and never duplicates it', () => {
    const initial = atStep5(r1);
    expect(render(initial)).not.toContain('>Indsæt effektiv rente</button>');
    const prefix = '=11227500*';
    const inserted = insertEffectiveRateReference(prefix, prefix.length, prefix.length);
    expect(inserted).toEqual({ raw: `${prefix}${EFFECTIVE_RATE_REFERENCE}`, caret: prefix.length + EFFECTIVE_RATE_REFERENCE.length });
    expect(insertEffectiveRateReference('', 0, 0).raw).toBe(EFFECTIVE_RATE_REFERENCE);
    expect(insertEffectiveRateReference(inserted.raw, inserted.caret, inserted.caret).raw).toBe(inserted.raw);
    expect(insertEffectiveRateReference('=100+200', 1, 1).raw).toBe(`=${EFFECTIVE_RATE_REFERENCE}100+200`);
    let state = take(initial, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'nominalInterest', raw: '560000' });
    state = take(state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' });
    expect(render(state)).toContain('>Indsæt effektiv rente</button>');
    state = take(state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'totalInterestExpense', raw: inserted.raw });
    expect(state.amortization.terms[1]?.income.totalInterestExpense?.raw).toBe(inserted.raw);
    expect(render(state)).toContain('disabled="" title="Indsætter den effektive rente');
    const readonly = renderToStaticMarkup(createElement(AmortizationStep, { state, onAction: () => {}, readOnly: true }));
    expect(readonly).not.toContain('>Indsæt effektiv rente</button>');
  });

  it('accepts R5 ordinary last-term work, preserves it, and shows the separate cent adjustment', () => {
    let state = atStep5(r5);
    const count = state.caseResult.contract.rows.length;
    const last = lastManualTermValues(state.caseResult.incomeSchedule[count - 1]!, state.caseResult.carryingSchedule[count - 1]!, state.caseResult.effectiveInterest.rate);
    expect(last.totalInterestExpense.toFixed(2)).toBe('328100.04');
    expect(last.closingCarryingAmount.toFixed(2)).toBe('0.01');
    expect(last.adjustment.toFixed(2)).toBe('-0.01');
    expect(last.matchesClosingAdjustment).toBe(true);
    for (const term of [1, 2]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
    }
    const rawExpense = `=${number(state.caseResult.carryingSchedule[count - 1]!.openingCarryingAmount)}*[Effektiv rente · fuld præcision]`;
    state = take(state, { type: 'editAmortizationField', term: count, subtable: 'income', field: 'nominalInterest', raw: number(state.caseResult.incomeSchedule[count - 1]!.nominalInterest) });
    state = take(state, { type: 'checkAmortizationSubrow', term: count, subtable: 'income' });
    state = take(state, { type: 'editAmortizationField', term: count, subtable: 'income', field: 'totalInterestExpense', raw: rawExpense });
    state = take(state, { type: 'checkAmortizationSubrow', term: count, subtable: 'income' });
    state = take(state, { type: 'editAmortizationField', term: count, subtable: 'income', field: 'amortization', raw: formula(last.amortization) });
    state = take(state, { type: 'checkAmortizationSubrow', term: count, subtable: 'income' });
    expect(state.amortization.terms[count]?.incomeApproved).toBe(true);
    state = approveSubrow(state, count, 'balance');
    expect(state.amortization.remainingCalculated).toBe(true);
    expect(state.currentStep).toBe('amortizedCost');
    expect(state.caseResult.carryingSchedule[count - 1]!.closingCarryingAmount.toFixed(2)).toBe('0.00');
    const finalIncome = state.caseResult.incomeSchedule[count - 1]!;
    expect(finalIncome.nominalInterest.plus(finalIncome.amortization).eq(finalIncome.totalInterestExpense)).toBe(true);
    expect(finalIncome.totalInterestExpense.toFixed(2)).toBe('328100.03');
    expect(state.amortization.terms[count]?.income.totalInterestExpense?.raw).toBe(rawExpense);
    expect(state.amortization.terms[count]?.income.totalInterestExpense?.approved).toBe(true);
    expect(state.amortization.terms[count]?.balance.closingCarryingAmount?.raw).toBe('=0,01+0');
    const html = render(state);
    expect(html).toContain('Afrundingsregulering:');
    expect(html).toContain('Efter afrunding: 0,00 kr.');
    const adapter = createMemorySessionStorage();
    expect(saveStudentSession(adapter, state).status).toBe('saved');
    const loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.amortization.terms[count]?.income.totalInterestExpense?.raw).toBe(rawExpense);
    expect(render(loaded.state)).toContain('Afrundingsregulering:');
  });

  it('rejects a materially wrong final standing-loan expense and leaves the balance locked', () => {
    let state = atStep5(r5);
    for (const term of [1, 2]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
    }
    const term = state.caseResult.contract.rows.length;
    const nominal = state.caseResult.incomeSchedule[term - 1]!.nominalInterest;
    state = take(state, { type: 'editAmortizationField', term, subtable: 'income', field: 'nominalInterest', raw: number(nominal) });
    state = take(state, { type: 'checkAmortizationSubrow', term, subtable: 'income' });
    state = take(state, { type: 'editAmortizationField', term, subtable: 'income', field: 'totalInterestExpense', raw: '=328101,04' });
    state = take(state, { type: 'checkAmortizationSubrow', term, subtable: 'income' });
    expect(state.amortization.terms[term]?.income.totalInterestExpense?.approved).toBe(false);
    expect(amortizationSubrowStatus(state, term, 'balance')).toBe('locked');
  });

  it('recognizes a cent-only closing adjustment for an annual standing bond', () => {
    const generated = { generatorVersion: '1.0.0', seed: 1, loanType: 'bullet' as const, attempts: 1,
      caseInput: { loanType: 'bullet' as const, financingType: 'bond' as const,
        issueDate: '2026-01-01' as const, nominalPrincipal: '10000000', nominalAnnualRate: '0.06',
        years: 5 as const, paymentsPerYear: 1 as const, openingBankBalance: '1000000',
        financingTerms: { issuePrice: '98', brokerageRate: '0.015', fixedCost: '50000' } } };
    const base = createStudentState(generated);
    let state: StudentState = { ...base, currentStep: 'amortizedCost', viewingStep: 'amortizedCost',
      completedSteps: ['proceeds', 'contractSchedule', 'effectiveInterest'] };
    const last = lastManualTermValues(state.caseResult.incomeSchedule[4]!, state.caseResult.carryingSchedule[4]!, state.caseResult.effectiveInterest.rate);
    expect(last.totalInterestExpense.toFixed(2)).toBe('690438.87');
    expect(last.closingCarryingAmount.toFixed(2)).toBe('0.01');
    expect(last.matchesClosingAdjustment).toBe(true);
    for (const term of [1, 2, 5]) {
      state = approveSubrow(state, term, 'income');
      state = approveSubrow(state, term, 'balance');
    }
    expect(state.amortization.remainingCalculated).toBe(true);
  });

  it('accepts the full precision IA reference and preserves raw formulas through restore', () => {
    const adapter = createMemorySessionStorage();
    let state = atStep5(r1);
    state = transitionStudentSession(adapter, state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'nominalInterest', raw: number(state.caseResult.incomeSchedule[0]!.nominalInterest) }).state;
    state = transitionStudentSession(adapter, state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' }).state;
    state = transitionStudentSession(adapter, state, { type: 'editAmortizationField', term: 1, subtable: 'income', field: 'totalInterestExpense', raw: '=6.590.000*[Effektiv rente · fuld præcision]' }).state;
    state = transitionStudentSession(adapter, state, { type: 'checkAmortizationSubrow', term: 1, subtable: 'income' }).state;
    expect(state.amortization.terms[1]?.income.totalInterestExpense?.approved).toBe(true);
    expect(state.amortization.terms[1]?.income.nominalInterest?.approved).toBe(true);
    const loaded = loadStudentSession(adapter);
    expect(loaded.status).toBe('restored');
    if (loaded.status !== 'restored') throw new Error('Restore failed');
    expect(loaded.state.amortization.terms[1]?.income.totalInterestExpense?.raw).toBe('=6.590.000*[Effektiv rente · fuld præcision]');
    expect(deriveStudentView(loaded.state).activeAmortizationSubtable).toBe('income');
    expect(loaded.state.caseResult.effectiveInterest.rate.toString()).toBe(state.caseResult.effectiveInterest.rate.toString());
  });

});
