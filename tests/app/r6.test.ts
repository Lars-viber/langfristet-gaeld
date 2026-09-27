import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateAccountBalances } from '../../src/domain';
import type { NetMovement } from '../../src/domain';
import { createStudentState, applyStudentAction } from '../../src/student';
import type { StudentState } from '../../src/student';
import { activeBookkeepingBlock, accountPostingLines, accountVisibleAmountCount, bookkeepingBlocks, studentAccountNet, T_ACCOUNTS } from '../../src/student/bookkeeping';
import { BookkeepingStep } from '../../src/components/BookkeepingStep';
import { deserializeStudentSession, serializeStudentSession } from '../../src/persistence';
import { r1 } from '../fixtures/r1';
import { r6 } from '../fixtures/r6';
import type { GoldenFixture } from '../fixtures/types';

const text = (value: { toFixed(places: number): string }) => value.toFixed(2).replace('.', ',');
function atStep6(fixture: GoldenFixture): StudentState {
  const state = createStudentState({ generatorVersion: '1.0.0', seed: 1, loanType: fixture.input.loanType, attempts: 1, caseInput: fixture.input });
  state.currentStep = 'yearBookkeeping';
  state.viewingStep = 'yearBookkeeping';
  state.completedSteps = ['proceeds', 'contractSchedule', 'effectiveInterest', 'amortizedCost', 'classification'];
  state.caseResult.accountBalances = calculateAccountBalances(state.caseResult.input, state.caseResult.postingEvents);
  for (const balance of state.caseResult.accountBalances) {
    if (balance.status === 'balance') state.completion.balances[balance.account] = { raw: '', approved: false, side: null, errorCode: null };
  }
  return state;
}
function lines(movements: readonly NetMovement[]) {
  return movements.filter((entry) => !entry.amount.isZero()).map((entry) => ({
    account: entry.account, side: entry.amount.isNegative() ? 'K' as const : 'D' as const, amount: text(entry.amount.abs()),
  }));
}
function approveActive(state: StudentState): StudentState {
  const active = activeBookkeepingBlock(state);
  if (!active) throw new Error('No active block');
  if (active.expected.length === 0) {
    state = applyStudentAction(state, { type: 'setReclassificationAnswer', answer: 'no' });
    return applyStudentAction(state, { type: 'checkReclassificationAnswer' });
  }
  state = applyStudentAction(state, { type: 'setPostingBlockLines', number: active.number, lines: lines(active.expected) });
  return applyStudentAction(state, { type: 'checkPostingBlock', number: active.number });
}

describe('R6 permanent T-account workflow', () => {
  it('ignores and discards only wholly empty draft rows, retaining non-empty validation', () => {
    let state = atStep6(r1);
    const active = activeBookkeepingBlock(state)!;
    const correct = lines(active.expected);
    const empty = { account: '6760' as const, side: 'D' as const, amount: '' };
    state = applyStudentAction(state, { type: 'setPostingBlockLines', number: active.number, lines: [...correct, empty] });
    state = applyStudentAction(state, { type: 'checkPostingBlock', number: active.number });
    expect(state.initialRecognition.approved).toBe(true);
    expect(state.initialRecognition.errors).toEqual([]);
    expect(state.initialRecognition.lines).toEqual(correct);
    for (const amount of ['100', 'abc']) {
      let attempt = atStep6(r1);
      attempt = applyStudentAction(attempt, { type: 'setPostingBlockLines', number: active.number, lines: [...correct, { ...empty, amount }] });
      attempt = applyStudentAction(attempt, { type: 'checkPostingBlock', number: active.number });
      expect(attempt.initialRecognition.approved).toBe(false);
      expect(attempt.initialRecognition.lines.at(-1)?.amount).toBe(amount);
    }
  });

  it('labels the read-only bank opening balance and uses the shared light panel', () => {
    const html = renderToStaticMarkup(createElement(BookkeepingStep, { state: atStep6(r1), onAction: () => {}, readOnly: false }));
    expect(html).toContain('Saldo primo');
    expect(html).toContain('class="r6-info classification-reference"');
  });
  it('shows all six accounts from entry and starts with manual origination', () => {
    const state = atStep6(r1);
    const html = renderToStaticMarkup(createElement(BookkeepingStep, { state, onAction: () => {}, readOnly: false }));
    expect(T_ACCOUNTS).toHaveLength(6);
    for (const account of T_ACCOUNTS) expect(html).toContain(account.name);
    expect(html).toContain('Bogfør postering 1');
    expect(html).toContain('Godkendt provenu');
    expect(html).toContain('Resultat · godkendt');
    expect(html).toContain('Balance · godkendt');
    expect(state.initialRecognition.lines).toEqual([]);
    expect(bookkeepingBlocks(state).at(-1)?.kind).toBe('reclassification');
  });

  it('keeps wrong and split lines and gates each chronological block', () => {
    let state = atStep6(r1);
    const issue = activeBookkeepingBlock(state)!;
    expect(applyStudentAction(state, { type: 'checkPostingBlock', number: issue.number + 1 })).toBe(state);
    state = applyStudentAction(state, { type: 'setPostingBlockLines', number: 1, lines: [
      { account: '5820', side: 'D', amount: '1' },
    ] });
    state = applyStudentAction(state, { type: 'checkPostingBlock', number: 1 });
    expect(state.initialRecognition.approved).toBe(false);
    expect(state.initialRecognition.lines).toHaveLength(1);
    const proceeds = state.caseResult.proceeds.proceeds;
    state = applyStudentAction(state, { type: 'setPostingBlockLines', number: 1, lines: [
      { account: '5820', side: 'D', amount: `=${text(proceeds)}+100` },
      { account: '5820', side: 'K', amount: '100' },
      { account: '6320', side: 'K', amount: text(proceeds) },
    ] });
    state = applyStudentAction(state, { type: 'checkPostingBlock', number: 1 });
    expect(state.initialRecognition.approved).toBe(true);
    expect(state.initialRecognition.lines).toHaveLength(3);
    expect(accountPostingLines(state, '5820').map((entry) => entry.number)).toEqual([1, 1]);
    expect(activeBookkeepingBlock(state)?.kind).toBe('payment');
    expect(applyStudentAction(state, { type: 'setPostingBlockLines', number: 1, lines: [] })).toBe(state);
  });

  it('rejects a negative, wrong-side, irrelevant and incorrect amount without hiding student work', () => {
    let state = atStep6(r1);
    const issue = activeBookkeepingBlock(state)!;
    const expected = lines(issue.expected);
    const variants = [
      [{ ...expected[0]!, amount: '-1' }, expected[1]!],
      [{ ...expected[0]!, side: 'K' as const }, expected[1]!],
      [...expected, { account: '6760' as const, side: 'D' as const, amount: '1' }],
      [{ ...expected[0]!, amount: '1' }, expected[1]!],
    ];
    for (const attempt of variants) {
      state = applyStudentAction(state, { type: 'setPostingBlockLines', number: 1, lines: attempt });
      state = applyStudentAction(state, { type: 'checkPostingBlock', number: 1 });
      expect(state.initialRecognition.approved).toBe(false);
      expect(state.initialRecognition.lines).toEqual(attempt);
      expect(activeBookkeepingBlock(state)?.number).toBe(1);
    }
  });

  it('keeps zero reclassification as a numbered answer block without a zero line', () => {
    let state = atStep6(r6);
    const last = bookkeepingBlocks(state).at(-1)!;
    for (let index = 1; index < last.number; index += 1) state = approveActive(state);
    expect(activeBookkeepingBlock(state)?.number).toBe(last.number);
    expect(last.expected).toEqual([]);
    expect(applyStudentAction(state, { type: 'setPostingBlockLines', number: last.number, lines: [
      { account: '6760', side: 'D', amount: '0' },
    ] })).toBe(state);
    state = applyStudentAction(state, { type: 'setReclassificationAnswer', answer: 'yes' });
    state = applyStudentAction(state, { type: 'checkReclassificationAnswer' });
    expect(state.classification.reclassification.approved).toBe(false);
    state = applyStudentAction(state, { type: 'setReclassificationAnswer', answer: 'no' });
    state = applyStudentAction(state, { type: 'checkReclassificationAnswer' });
    expect(state.classification.reclassification.approved).toBe(true);
    expect(state.classification.reclassification.lines).toEqual([]);
    expect(activeBookkeepingBlock(state)).toBeNull();
  });

  it('requires calculation for 2+ visible amounts but direct input for one, with separate D/K', () => {
    let state = atStep6(r6);
    for (const _ of bookkeepingBlocks(state)) state = approveActive(state);
    const first = state.caseResult.accountBalances!.find((entry) => entry.account === '4410')!;
    if (first.status !== 'balance') throw new Error('Expected balance');
    expect(accountVisibleAmountCount(state, '4410')).toBe(1);
    state = applyStudentAction(state, { type: 'editFinalBalance', account: '4410', formula: text(first.amount), side: first.side === 'D' ? 'K' : 'D' });
    state = applyStudentAction(state, { type: 'checkFinalBalance', account: '4410' });
    expect(state.completion.balances['4410']?.errorCode).toBe('WRONG_DEBIT_CREDIT_SIDE');
    state = applyStudentAction(state, { type: 'editFinalBalance', account: '4410', side: first.side });
    state = applyStudentAction(state, { type: 'checkFinalBalance', account: '4410' });
    expect(state.completion.balances['4410']?.approved).toBe(true);
    const bank = state.caseResult.accountBalances!.find((entry) => entry.account === '5820')!;
    if (bank.status !== 'balance') throw new Error('Expected bank balance');
    expect(accountVisibleAmountCount(state, '5820')).toBeGreaterThan(1);
    state = applyStudentAction(state, { type: 'editFinalBalance', account: '5820', formula: text(bank.amount), side: bank.side });
    expect(applyStudentAction(state, { type: 'checkFinalBalance', account: '5820' })).toBe(state);
    const second = state.caseResult.accountBalances!.find((entry) => entry.account === '4450')!;
    if (second.status !== 'balance') throw new Error('Expected expense balance');
    state = applyStudentAction(state, { type: 'editFinalBalance', account: '4450', formula: text(second.amount), side: second.side });
    state = applyStudentAction(state, { type: 'checkFinalBalance', account: '4450' });
    expect(state.completion.balances['4450']?.approved).toBe(true);
    state = applyStudentAction(state, { type: 'editFinalBalance', account: '5820', formula: text(bank.amount), side: bank.side });
    state = applyStudentAction(state, { type: 'checkFinalBalance', account: '5820' });
    expect(state.completion.balances['5820']?.errorCode).toBe('MISSING_EQUALS');
    state = applyStudentAction(state, { type: 'editFinalBalance', account: '5820', formula: `=${text(bank.amount)}+0` });
    state = applyStudentAction(state, { type: 'checkFinalBalance', account: '5820' });
    expect(state.completion.balances['5820']?.approved).toBe(true);
  });

  it('requires all blocks before balances, then 0/1/2+ balance rules and explicit completion', () => {
    let state = atStep6(r6);
    const count = bookkeepingBlocks(state).length;
    for (let index = 0; index < count; index += 1) state = approveActive(state);
    expect(activeBookkeepingBlock(state)).toBeNull();
    expect(state.completedSteps).not.toContain('yearBookkeeping');
    expect(state.classification.reclassification.lines).toEqual([]);
    expect(accountVisibleAmountCount(state, '6760')).toBe(0);
    const balances = state.caseResult.accountBalances!;
    for (const account of T_ACCOUNTS) {
      const expected = balances.find((entry) => entry.account === account.number);
      if (!expected || expected.status === 'noBalance') {
        expect(studentAccountNet(state, account.number).isZero()).toBe(true);
        continue;
      }
      const amount = text(expected.amount);
      const raw = accountVisibleAmountCount(state, account.number) === 1 ? amount : `=${amount}+0`;
      state = applyStudentAction(state, { type: 'editFinalBalance', account: account.number, formula: raw, side: expected.side });
      state = applyStudentAction(state, { type: 'checkFinalBalance', account: account.number });
      expect(state.completion.balances[account.number]?.approved).toBe(true);
      expect(state.completion.balances[account.number]?.raw).toBe(raw);
    }
    expect(state.completedSteps).toContain('yearBookkeeping');
    expect(state.currentStep).toBe('yearBookkeeping');
    const moved = applyStudentAction(state, { type: 'continueToNextStep' });
    expect(moved.currentStep).toBe('finalOverview');
    const historical = applyStudentAction(moved, { type: 'viewHistoricalStep', step: 'yearBookkeeping' });
    const html = renderToStaticMarkup(createElement(BookkeepingStep, { state: historical, onAction: () => {}, readOnly: true }));
    expect(html).toContain('Tilbage til aktuelt trin');
    expect(html).toContain('Trinnet er skrivebeskyttet.');
    expect(html).not.toContain('+ Postering');
    expect(html).not.toContain('Kontrollér saldo');
    expect(applyStudentAction(historical, { type: 'setPostingBlockLines', number: 1, lines: [] })).toBe(historical);
    const snapshot = serializeStudentSession(state);
    const restored = deserializeStudentSession(snapshot);
    expect(restored.status).toBe('restored');
    if (restored.status === 'restored') expect(restored.state.initialRecognition.lines).toEqual(state.initialRecognition.lines);
  });
});
