import { describe, expect, it } from 'vitest';
import { D } from '../../src/domain/decimal';
import { calculateLoan, type LoanType } from '../../src/domain';
import { generateLevel1Case } from '../../src/generator';
import { checkGuardrails } from '../../src/generator/guardrails';
import {
  annualRates, bankFixedCosts, bankVariableRates, bondBrokerageRates,
  bondFixedCosts, bondIssuePrices, financingTypes, openingBankBalances,
  paymentsPerYear, principals, years,
} from '../../src/generator/options';
import { createPrng } from '../../src/generator/prng';

const loanTypes: readonly LoanType[] = ['annuity', 'serial', 'bullet'];
const fixedSeeds = [0, 1, 2, 42, 2026, 123456789, 0xFFFFFFFF] as const;
const expectedCalendars = new Set(['2026-01-01/1', '2026-01-01/2', '2026-01-01/4',
  '2026-07-01/2', '2026-07-01/4']);

describe('fixed generator regressions', () => {
  it.each(loanTypes.flatMap((loanType) => fixedSeeds.map((seed) => ({ loanType, seed }))))
    ('$loanType seed $seed retains exact generated snapshot', ({ loanType, seed }) => {
      expect(generateLevel1Case({ loanType, seed })).toMatchSnapshot();
    });

  it('retains the Mulberry32 uint32 sequence for seed zero', () => {
    const next = createPrng(0);
    expect(Array.from({ length: 8 }, () => next())).toMatchSnapshot();
  });

  it('returns identical output for repeated calls', () => {
    const expected = generateLevel1Case({ loanType: 'annuity', seed: 42 });
    for (let index = 0; index < 10; index++) {
      expect(generateLevel1Case({ loanType: 'annuity', seed: 42 })).toEqual(expected);
    }
  }, 15_000);

  it('is independent of call order and has no shared generator state', () => {
    const first = generateLevel1Case({ loanType: 'serial', seed: 0 });
    generateLevel1Case({ loanType: 'bullet', seed: 1 });
    generateLevel1Case({ loanType: 'annuity', seed: 2 });
    expect(generateLevel1Case({ loanType: 'serial', seed: 0 })).toEqual(first);
  });
});

describe('generated Level 1 contract sample', () => {
  it('keeps all options in their sets and every accepted case inside all guardrails', () => {
    const calendars = new Set<string>();
    let minimumAttempts = Infinity;
    let maximumAttempts = 0;
    let rejectedCase: { loanType: LoanType; seed: number; attempts: number } | undefined;

    for (const loanType of loanTypes) {
      for (let seed = 0; seed < 100; seed++) {
        const generated = generateLevel1Case({ loanType, seed });
        const input = generated.caseInput;
        const result = calculateLoan(input);
        expect(generated.loanType).toBe(loanType);
        expect(input.loanType).toBe(loanType);
        expect(checkGuardrails(input, result)).toEqual([]);
        expect(financingTypes).toContain(input.financingType);
        expect(principals).toContain(input.nominalPrincipal);
        expect(years).toContain(input.years);
        expect(paymentsPerYear).toContain(input.paymentsPerYear);
        expect(annualRates).toContain(input.nominalAnnualRate);
        expect(openingBankBalances).toContain(input.openingBankBalance);
        if (input.financingType === 'bank') {
          expect(bankVariableRates).toContain(input.financingTerms.variableCostRate);
          expect(bankFixedCosts).toContain(input.financingTerms.fixedCost);
          expect(result.proceeds.financingType).toBe('bank');
          if (result.proceeds.financingType === 'bank') {
            expect(result.proceeds.variableCost.isInteger()).toBe(true);
          }
        } else {
          expect(bondIssuePrices).toContain(input.financingTerms.issuePrice);
          expect(bondBrokerageRates).toContain(input.financingTerms.brokerageRate);
          expect(bondFixedCosts).toContain(input.financingTerms.fixedCost);
          expect(result.proceeds.financingType).toBe('bond');
          if (result.proceeds.financingType === 'bond') {
            expect(result.proceeds.marketValue.isInteger()).toBe(true);
            expect(result.proceeds.brokerage.isInteger()).toBe(true);
            expect(result.proceeds.brokerage.eq(
              result.proceeds.marketValue.times(input.financingTerms.brokerageRate),
            )).toBe(true);
          }
        }
        expect(new D(input.nominalPrincipal).isInteger()).toBe(true);
        expect(result.proceeds.proceeds.isInteger()).toBe(true);
        calendars.add(`${input.issueDate}/${input.paymentsPerYear}`);
        minimumAttempts = Math.min(minimumAttempts, generated.attempts);
        maximumAttempts = Math.max(maximumAttempts, generated.attempts);
        if (generated.attempts > 1 && !rejectedCase) {
          rejectedCase = { loanType, seed, attempts: generated.attempts };
        }
      }
    }

    expect(calendars).toEqual(expectedCalendars);
    expect(calendars.has('2026-07-01/1')).toBe(false);
    expect(minimumAttempts).toBeGreaterThanOrEqual(1);
    expect({ sampleCases: 300, minimumAttempts, maximumAttempts, rejectedCase }).toMatchSnapshot();
  }, 60_000);
});
