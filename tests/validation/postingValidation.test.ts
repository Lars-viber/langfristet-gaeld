import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/decimal';
import type { NetMovement } from '../../src/domain/types';
import { validatePostingBlock, type StudentPostingLine } from '../../src/validation';

const payment: NetMovement[] = [
  { account: '4410', amount: new D(100) },
  { account: '6320', amount: new D(300) },
  { account: '5820', amount: new D(-400) },
];
const exact: StudentPostingLine[] = [
  { account: '4410', side: 'D', amount: '100' },
  { account: '6320', side: 'D', amount: '300' },
  { account: '5820', side: 'K', amount: '400' },
];

describe('posting-block net movement', () => {
  it('accepts exact gross lines and retains their identity', () => {
    const before = JSON.stringify(exact);
    const result = validatePostingBlock(exact, payment);
    expect(result.blockCorrect).toBe(true);
    expect(result.balanced).toBe(true);
    expect(result.studentLines).toBe(exact);
    expect(JSON.stringify(exact)).toBe(before);
  });

  it('accepts debit and credit intermediate workings on relevant accounts', () => {
    const lines: StudentPostingLine[] = [
      { account: '4410', side: 'D', amount: '100' },
      { account: '6320', side: 'D', amount: '400' },
      { account: '6320', side: 'K', amount: '100' },
      { account: '5820', side: 'D', amount: '700' },
      { account: '5820', side: 'K', amount: '1.100' },
    ];
    const result = validatePostingBlock(lines, payment);
    expect(result.blockCorrect).toBe(true);
    expect(result.accountStatuses.every((status) => status.netCorrect)).toBe(true);
    expect(result.studentLines).toBe(lines);
  });

  it('accepts credit net through opposing sides', () => {
    const expected: NetMovement[] = [
      { account: '4450', amount: new D(300) },
      { account: '6320', amount: new D(-300) },
    ];
    const lines: StudentPostingLine[] = [
      { account: '4450', side: 'D', amount: '400' },
      { account: '4450', side: 'K', amount: '100' },
      { account: '6320', side: 'D', amount: '700' },
      { account: '6320', side: 'K', amount: '1.000' },
    ];
    expect(validatePostingBlock(lines, expected).blockCorrect).toBe(true);
  });

  it('rejects wrong net movement', () => {
    const lines = exact.map((line) => ({ ...line }));
    lines[1]!.amount = '299';
    const result = validatePostingBlock(lines, payment);
    expect(result.blockCorrect).toBe(false);
    expect(result.errors).toContain('WRONG_NET_MOVEMENT');
    expect(result.errors).toContain('UNBALANCED_POSTING_BLOCK');
  });

  it('checks balance independently even if supplied target nets are inconsistent', () => {
    const inconsistent: NetMovement[] = [
      { account: '4410', amount: new D(300) },
      { account: '5820', amount: new D(-200) },
    ];
    const lines: StudentPostingLine[] = [
      { account: '4410', side: 'D', amount: '300' },
      { account: '5820', side: 'K', amount: '200' },
    ];
    const result = validatePostingBlock(lines, inconsistent);
    expect(result.accountStatuses.every((status) => status.netCorrect)).toBe(true);
    expect(result.balanced).toBe(false);
    expect(result.errors).toEqual(['UNBALANCED_POSTING_BLOCK']);
  });

  it('rejects irrelevant accounts and zero stuffing', () => {
    const irrelevant: StudentPostingLine[] = [...exact, { account: '6760', side: 'D', amount: '1' }, { account: '6760', side: 'K', amount: '1' }];
    expect(validatePostingBlock(irrelevant, payment).errors).toContain('IRRELEVANT_ACCOUNT');
    expect(validatePostingBlock([...exact, { account: '6760', side: 'D', amount: '0' }], payment).errors)
      .toContain('IRRELEVANT_ACCOUNT');
  });

  it('requires no zero principal posting in a bullet-loan payment', () => {
    const expected: NetMovement[] = [
      { account: '4410', amount: new D(100) },
      { account: '6320', amount: new D(0) },
      { account: '5820', amount: new D(-100) },
    ];
    const lines: StudentPostingLine[] = [
      { account: '4410', side: 'D', amount: '100' },
      { account: '5820', side: 'K', amount: '100' },
    ];
    expect(validatePostingBlock(lines, expected).blockCorrect).toBe(true);
    expect(validatePostingBlock([...lines, { account: '6320', side: 'D', amount: '0' }], expected).blockCorrect).toBe(false);
  });

  it('rejects malformed, negative and zero posting amounts', () => {
    expect(validatePostingBlock([{ account: '4410', side: 'D', amount: '-100' }], payment).errors)
      .toContain('NEGATIVE_AMOUNT_NOT_ALLOWED');
    expect(validatePostingBlock([{ account: '4410', side: 'D', amount: '7.50.000' }], payment).errors)
      .toContain('INVALID_AMOUNT');
    expect(validatePostingBlock([{ account: '4410', side: 'D', amount: '0' }], payment).errors)
      .toContain('INVALID_AMOUNT');
  });
});
