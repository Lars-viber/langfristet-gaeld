import { describe, expect, it } from 'vitest';
import { calculateLoan, moneyString } from '../../src/domain';
import { validatePostingBlock, type StudentPostingLine } from '../../src/validation';
import { goldenFixtures } from '../fixtures';

describe.each(goldenFixtures)('$id: L1 event adapter', (fixture) => {
  it('accepts each exact L1 domain posting event as student lines', () => {
    const loan = calculateLoan(fixture.input);
    for (const event of loan.postingEvents) {
      const lines: StudentPostingLine[] = event.movements.map((movement) => ({
        account: movement.account,
        side: movement.amount.isNegative() ? 'K' : 'D',
        amount: moneyString(movement.amount.abs()).replace('.', ','),
      }));
      const result = validatePostingBlock(lines, event.movements);
      expect(result.blockCorrect, `${event.kind} term ${event.term}`).toBe(true);
      expect(result.studentLines).toBe(lines);
    }
  });
});
