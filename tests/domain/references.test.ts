import { describe, expect, it } from 'vitest';
import { calculateLoan, eventBalances, moneyString, npvAtRate } from '../../src/domain';
import { goldenFixtures } from '../fixtures';

describe.each(goldenFixtures)('$id: frozen L0 reference', (fixture) => {
  const result = calculateLoan(fixture.input);

  it('matches the complete proceeds breakdown', () => {
    expect(moneyString(result.proceeds.proceeds)).toBe(fixture.proceeds.proceeds);
    expect(moneyString(result.proceeds.fixedCost)).toBe(fixture.proceeds.fixedCost);
    expect(result.proceeds.proceeds.gt(0)).toBe(true);
    expect(result.proceeds.proceeds.lt(result.proceeds.nominalPrincipal)).toBe(true);
    if (result.proceeds.financingType === 'bank') {
      expect(moneyString(result.proceeds.variableCost)).toBe(fixture.proceeds.variableCost);
    } else {
      expect(moneyString(result.proceeds.marketValue)).toBe(fixture.proceeds.marketValue);
      expect(moneyString(result.proceeds.brokerage)).toBe(fixture.proceeds.brokerage);
    }
  });

  it('matches every contractual term and date', () => {
    expect(result.contract.rows.map((row) => [
      row.term, row.date, moneyString(row.openingPrincipal), moneyString(row.payment),
      moneyString(row.nominalInterest), moneyString(row.principalRepayment),
      moneyString(row.closingPrincipal),
    ])).toEqual(fixture.contract);
    expect(result.contract.rows).toHaveLength(fixture.input.years * fixture.input.paymentsPerYear);
    expect(result.contract.rows.at(-1)?.closingPrincipal.isZero()).toBe(true);
    expect(result.contract.rows.every((row, index, rows) => index === 0 || row.date > rows[index - 1]!.date)).toBe(true);
  });

  it('matches every signed cash flow and the effective rate', () => {
    expect(result.cashFlows.map((row) => [row.term, row.date, row.direction, moneyString(row.amount)]))
      .toEqual(fixture.cashFlows);
    expect(result.cashFlows[0]?.signedAmount.gt(0)).toBe(true);
    expect(result.cashFlows.slice(1).every((row) => row.signedAmount.lt(0))).toBe(true);
    expect(result.effectiveInterest.displayedPercent).toBe(fixture.displayedEffectivePercent);
    expect(result.effectiveInterest.rate.gt(0)).toBe(true);
    expect(result.effectiveInterest.npvResidual.abs().lt('1e-30')).toBe(true);
    expect(npvAtRate(result.cashFlows, result.effectiveInterest.rate).abs().lt('1e-30')).toBe(true);
  });

  it('matches every income and carrying-amount row', () => {
    expect(result.incomeSchedule.map((row) => [
      row.term, row.date, moneyString(row.nominalInterest), moneyString(row.amortization),
      moneyString(row.totalInterestExpense),
    ])).toEqual(fixture.income);
    expect(result.carryingSchedule.map((row) => [
      row.term, row.date, moneyString(row.openingCarryingAmount),
      moneyString(row.principalRepayment), moneyString(row.amortization),
      moneyString(row.closingCarryingAmount),
    ])).toEqual(fixture.carrying);
    expect(moneyString(result.carryingSchedule[0]!.openingCarryingAmount)).toBe(fixture.proceeds.proceeds);
    expect(result.carryingSchedule.at(-1)?.closingCarryingAmount.isZero()).toBe(true);
    expect(result.incomeSchedule.every((row, index) => row.amortization.eq(result.carryingSchedule[index]!.amortization)))
      .toBe(true);
  });

  it('matches all 2026 postings, classification, balances, and final checks', () => {
    expect(result.actual2026Terms.map((row) => row.date)).toEqual(fixture.actual2026Dates);
    expect(result.postingEvents.map((event) => [
      event.kind, event.term, event.date,
      event.movements.map((item) => [item.account, moneyString(item.amount)]).sort(([a], [b]) => String(a).localeCompare(String(b))),
    ])).toEqual(fixture.postings.map(([kind, term, date, movements]) => [
      kind, term, date, [...movements].sort(([a], [b]) => a.localeCompare(b)),
    ]));
    expect(result.postingEvents.every(eventBalances)).toBe(true);
    expect(result.postingEvents.every((event) => event.date.startsWith('2026-'))).toBe(true);
    expect({
      carryingAmount: moneyString(result.classification.carryingAmount),
      shortTerm: moneyString(result.classification.shortTerm),
      longTerm: moneyString(result.classification.longTerm),
      reclassificationRequired: result.classification.reclassificationRequired,
    }).toEqual(fixture.yearEnd);
    expect(result.classification.shortTerm.plus(result.classification.longTerm)
      .eq(result.classification.carryingAmount)).toBe(true);
    expect(result.postingEvents.filter((event) => event.kind === 'reclassification'))
      .toHaveLength(fixture.yearEnd.reclassificationRequired ? 1 : 0);
    expect(result.accountBalances.map((balance) => balance.status === 'noBalance'
      ? [balance.account, 'noBalance']
      : [balance.account, moneyString(balance.amount), balance.side]))
      .toEqual(fixture.balances);
    expect(result.finalChecks).toEqual(fixture.checks);
  });
});
