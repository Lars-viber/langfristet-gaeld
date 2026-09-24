import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  buildContractSchedule, calculateLoan, calculateProceeds, contractDates,
  eventBalances, moneyString, npvAtRate, roundMoney,
} from '../../src/domain';
import type { LoanCaseInput } from '../../src/domain';

const bankCase: LoanCaseInput = {
  loanType: 'annuity', financingType: 'bank', issueDate: '2026-01-01',
  nominalPrincipal: '8000000', nominalAnnualRate: '0.08', years: 4,
  paymentsPerYear: 2, openingBankBalance: '1000000',
  financingTerms: { variableCostRate: '0.02', fixedCost: '100000' },
};
const bondCase: LoanCaseInput = {
  loanType: 'bullet', financingType: 'bond', issueDate: '2026-07-01',
  nominalPrincipal: '8000000', nominalAnnualRate: '0.05', years: 4,
  paymentsPerYear: 2, openingBankBalance: '1000000',
  financingTerms: { issuePrice: '96', brokerageRate: '0.01', fixedCost: '150000' },
};

describe('dates and proceeds', () => {
  it.each([
    ['2026-01-01', 1, ['2026-12-31']],
    ['2026-01-01', 2, ['2026-06-30', '2026-12-31']],
    ['2026-01-01', 4, ['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31']],
    ['2026-07-01', 2, ['2026-12-31']],
    ['2026-07-01', 4, ['2026-09-30', '2026-12-31']],
  ] as const)('builds the %s / %i calendar', (issueDate, paymentsPerYear, yearDates) => {
    const dates = contractDates({ issueDate, paymentsPerYear, years: 4 });
    expect(dates.filter((date) => date.startsWith('2026-'))).toEqual(yearDates);
    expect(dates).toHaveLength(4 * paymentsPerYear);
    expect(dates.every((date, index) => index === 0 || date > dates[index - 1]!)).toBe(true);
  });

  it('rejects medio issue with one annual payment', () => {
    expect(() => contractDates({ issueDate: '2026-07-01', paymentsPerYear: 1, years: 4 })).toThrow();
  });

  it('calculates bank costs and uses market value as the bond brokerage basis', () => {
    const bank = calculateProceeds(bankCase);
    const bond = calculateProceeds(bondCase);
    expect(bank.financingType).toBe('bank');
    expect(bond.financingType).toBe('bond');
    if (bank.financingType !== 'bank' || bond.financingType !== 'bond') throw new Error('Wrong financing type');
    expect(moneyString(bank.variableCost)).toBe('160000.00');
    expect(moneyString(bank.proceeds)).toBe('7740000.00');
    expect(moneyString(bond.marketValue)).toBe('7680000.00');
    expect(moneyString(bond.brokerage)).toBe('76800.00');
    expect(moneyString(bond.proceeds)).toBe('7453200.00');
  });

  it('uses decimal half-up for money', () => {
    expect(moneyString(roundMoney(new Decimal('1.005')))).toBe('1.01');
  });
});

describe('pure loan calculation', () => {
  it.each(['annuity', 'serial', 'bullet'] as const)('closes the %s contract and carrying schedules', (loanType) => {
    const result = calculateLoan({ ...bankCase, loanType });
    expect(result.contract.rows).toHaveLength(bankCase.years * bankCase.paymentsPerYear);
    expect(moneyString(result.contract.rows.at(-1)!.closingPrincipal)).toBe('0.00');
    expect(moneyString(result.carryingSchedule.at(-1)!.closingCarryingAmount)).toBe('0.00');
    expect(moneyString(result.carryingSchedule[0]!.openingCarryingAmount))
      .toBe(moneyString(result.proceeds.proceeds));
    expect(result.effectiveInterest.rate.gt(0)).toBe(true);
    expect(result.effectiveInterest.npvResidual.abs().lt('1e-30')).toBe(true);
    expect(npvAtRate(result.cashFlows, result.effectiveInterest.rate).abs().lt('1e-30')).toBe(true);
  });

  it('derives inflow, outflows, balanced 2026 events and year-end checks', () => {
    const result = calculateLoan(bankCase);
    expect(result.cashFlows[0]!.direction).toBe('inflow');
    expect(result.cashFlows[0]!.signedAmount.gt(0)).toBe(true);
    expect(result.cashFlows.slice(1).every((row) => row.direction === 'outflow' && row.signedAmount.lt(0))).toBe(true);
    expect(result.postingEvents.every(eventBalances)).toBe(true);
    expect(result.postingEvents.filter((event) => event.kind === 'payment')).toHaveLength(2);
    expect(result.postingEvents.every((event) => event.date <= '2026-12-31')).toBe(true);
    expect(result.classification.reclassificationRequired).toBe(true);
    expect(result.finalChecks).toEqual({
      debtReconciles: true, financialExpenseReconciles: true, accountsReconcile: true,
    });
  });

  it('omits zero principal movements and zero reclassification for a standing loan', () => {
    const result = calculateLoan(bondCase);
    expect(result.classification.shortTerm.isZero()).toBe(true);
    expect(result.classification.reclassificationRequired).toBe(false);
    expect(result.postingEvents.some((event) => event.kind === 'reclassification')).toBe(false);
    expect(result.postingEvents.filter((event) => event.kind === 'payment')
      .every((event) => event.movements.every((item) => item.account !== '6330'))).toBe(true);
    expect(result.accountBalances.find((balance) => balance.account === '6760')?.status).toBe('noBalance');
    expect(result.finalChecks.accountsReconcile).toBe(true);
  });

  it('builds a serial schedule with full repayment at maturity', () => {
    const rows = buildContractSchedule({ ...bankCase, loanType: 'serial' }).rows;
    expect(rows.every((row) => row.principalRepayment.eq('1000000'))).toBe(true);
    expect(rows.at(-1)!.closingPrincipal.isZero()).toBe(true);
  });
});
