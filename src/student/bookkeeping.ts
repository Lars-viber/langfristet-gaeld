import type Decimal from 'decimal.js';
import type { AccountNumber, NetMovement } from '../domain';
import { D, ZERO } from '../domain/decimal';
import { parsePostingAmount } from '../validation';
import type { StudentPostingLine } from '../validation';
import type { PostingBlockState, StudentState } from './types';

export const T_ACCOUNTS: readonly { number: AccountNumber; name: string }[] = [
  { number: '4410', name: 'Renteudgift, bank, lån' },
  { number: '4450', name: 'Låneomkostninger/amortisering' },
  { number: '5820', name: 'Bankkonto' },
  { number: '6320', name: 'Lån hos kreditinstitutter' },
  { number: '6330', name: 'Obligationslån' },
  { number: '6760', name: 'Kortfristet del af langfristede gældsforpligtelser' },
];

export interface BookkeepingBlock {
  number: number;
  kind: 'origination' | 'payment' | 'amortization' | 'reclassification';
  term: number | null;
  date: string;
  expected: readonly NetMovement[];
}

export function bookkeepingBlocks(state: StudentState): BookkeepingBlock[] {
  const result = state.caseResult;
  const issue = result.postingEvents.find((event) => event.kind === 'origination');
  if (!issue) throw new Error('Missing origination event');
  const blocks: BookkeepingBlock[] = [{ number: 1, kind: 'origination', term: null,
    date: issue.date, expected: issue.movements }];
  for (const row of result.actual2026Terms) {
    for (const kind of ['payment', 'amortization'] as const) {
      const event = result.postingEvents.find((candidate) => candidate.kind === kind && candidate.term === row.term);
      if (!event) throw new Error(`Missing ${kind} event for term ${row.term}`);
      blocks.push({ number: blocks.length + 1, kind, term: row.term, date: event.date, expected: event.movements });
    }
  }
  const reclassification = result.postingEvents.find((event) => event.kind === 'reclassification');
  blocks.push({ number: blocks.length + 1, kind: 'reclassification', term: null,
    date: result.classification.date, expected: reclassification?.movements ?? [] });
  return blocks;
}

export function bookkeepingBlockState(state: StudentState, block: BookkeepingBlock): PostingBlockState {
  if (block.kind === 'origination') return state.initialRecognition;
  if (block.kind === 'reclassification') return state.classification.reclassification;
  const termState = state.bookkeeping[block.term!];
  if (!termState) throw new Error(`Missing bookkeeping term ${block.term}`);
  return termState[block.kind];
}

export function activeBookkeepingBlock(state: StudentState): BookkeepingBlock | null {
  return bookkeepingBlocks(state).find((block) => !bookkeepingBlockState(state, block).approved) ?? null;
}

export function approvedPostingLines(state: StudentState): { number: number; line: StudentPostingLine }[] {
  return bookkeepingBlocks(state).flatMap((block) => bookkeepingBlockState(state, block).approved
    ? bookkeepingBlockState(state, block).lines.map((line) => ({ number: block.number, line })) : []);
}

export function accountPostingLines(state: StudentState, account: AccountNumber): { number: number; line: StudentPostingLine }[] {
  return approvedPostingLines(state).filter(({ line }) => line.account === account);
}

/** Opening bank is a visible, unnumbered opening amount, not a student posting. */
export function accountVisibleAmountCount(state: StudentState, account: AccountNumber): number {
  return accountPostingLines(state, account).length + (account === '5820' && !new D(state.generatedCase.caseInput.openingBankBalance).isZero() ? 1 : 0);
}

export function studentAccountNet(state: StudentState, account: AccountNumber): Decimal {
  let net = account === '5820' ? new D(state.generatedCase.caseInput.openingBankBalance) : ZERO;
  for (const { line } of accountPostingLines(state, account)) {
    const parsed = parsePostingAmount(line.amount);
    if (!parsed.correct || !parsed.value) throw new Error('Approved posting line cannot be parsed');
    net = net.plus(line.side === 'D' ? parsed.value : parsed.value.neg());
  }
  return net;
}

export function activeBalanceAccount(state: StudentState): AccountNumber | null {
  if (activeBookkeepingBlock(state)) return null;
  return T_ACCOUNTS.find(({ number }) => {
    const expected = state.caseResult.accountBalances?.find((balance) => balance.account === number);
    return expected?.status === 'balance' && !state.completion.balances[number]?.approved;
  })?.number ?? null;
}
