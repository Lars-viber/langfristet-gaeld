import { describe, expect, it } from 'vitest';
import { calculateLoan, type LoanCaseInput, type LoanResult } from '../../src/domain';
import { D, ZERO } from '../../src/domain/decimal';
import { generateLevel1Case } from '../../src/generator';
import { checkGuardrails } from '../../src/generator/guardrails';

function findCase(financingType: 'bank' | 'bond', loanType: 'annuity' | 'serial' | 'bullet'): LoanCaseInput {
  for (let seed = 0; seed < 100; seed++) {
    const input = generateLevel1Case({ loanType, seed }).caseInput;
    if (input.financingType === financingType) return input;
  }
  throw new Error(`No ${financingType} case in the deterministic sample`);
}

describe('generator guardrails reject broken domain results', () => {
  it('rejects a negative year-end bank balance', () => {
    const input: LoanCaseInput = { ...findCase('bank', 'annuity'), openingBankBalance: '-10000000' };
    expect(checkGuardrails(input, calculateLoan(input))).toContain('year-end bank');
  });

  it('rejects brokerage calculated on principal instead of market value', () => {
    const input = findCase('bond', 'serial');
    if (input.financingType !== 'bond') throw new Error('Expected bond case');
    const result = calculateLoan(input);
    if (result.proceeds.financingType !== 'bond') throw new Error('Expected bond proceeds');
    const wrongBrokerage = new D(input.nominalPrincipal).times(input.financingTerms.brokerageRate);
    const changed: LoanResult = {
      ...result,
      proceeds: { ...result.proceeds, brokerage: wrongBrokerage },
    };
    expect(checkGuardrails(input, changed)).toContain('bond market value/brokerage');
  });

  it('rejects unbalanced posting events and unreconciled balances', () => {
    const input = findCase('bank', 'serial');
    const result = calculateLoan(input);
    const alteredEvents = result.postingEvents.map((event, index) => index === 0
      ? { ...event, movements: event.movements.map((movement, movementIndex) => movementIndex === 0
        ? { ...movement, amount: movement.amount.plus(1) } : movement) }
      : event);
    expect(checkGuardrails(input, { ...result, postingEvents: alteredEvents })).toContain('posting events');

    const alteredBalances = result.accountBalances.map((balance) =>
      balance.account === '5820' && balance.status === 'balance'
        ? { ...balance, amount: balance.amount.plus(1) } : balance);
    expect(checkGuardrails(input, { ...result, accountBalances: alteredBalances }))
      .toContain('account balances');
  });

  it('rejects zero and ordinary principal postings on a standing loan', () => {
    const input = findCase('bank', 'bullet');
    const result = calculateLoan(input);
    const firstPayment = result.postingEvents.findIndex((event) => event.kind === 'payment');
    if (firstPayment < 0) throw new Error('Expected 2026 payment');
    const debtAccount: '6320' | '6330' = input.financingType === 'bank' ? '6320' : '6330';
    const alteredEvents = result.postingEvents.map((event, index) => index === firstPayment
      ? { ...event, movements: [...event.movements, { account: debtAccount, amount: ZERO }] }
      : event);
    const failures = checkGuardrails(input, { ...result, postingEvents: alteredEvents });
    expect(failures).toContain('zero posting amount');
    expect(failures).toContain('standing-loan ordinary principal posting');
  });

  it('rejects nonpositive amortization', () => {
    const input = findCase('bank', 'annuity');
    const result = calculateLoan(input);
    const incomeSchedule = result.incomeSchedule.map((row, index) =>
      index === 0 ? { ...row, amortization: ZERO } : row);
    expect(checkGuardrails(input, { ...result, incomeSchedule }))
      .toContain('positive amortization amounts');
  });
});
