import { expect, it } from 'vitest';
declare const console: { log(message: string): void };
declare function setTimeout(handler: () => void, delay: number): unknown;
import type Decimal from 'decimal.js';
import { calculateLoan, calculateProceeds, contractDates, type LoanCaseInput, type LoanType } from '../../src/domain';
import { D, sumMoney, ZERO } from '../../src/domain/decimal';
import { generateLevel1Case, GENERATOR_VERSION } from '../../src/generator';
import { checkGuardrails } from '../../src/generator/guardrails';
import { annualRates, bankFixedCosts, bankVariableRates, bondBrokerageRates, bondFixedCosts, bondIssuePrices,
  financingTypes, openingBankBalances, paymentsPerYear, principals, years } from '../../src/generator/options';

const types: LoanType[] = ['annuity', 'serial', 'bullet'];
const fds = [
  { ppy: 1, date: '2026-01-01', first: '2026-12-31', payments: 1 },
  { ppy: 2, date: '2026-01-01', first: '2026-06-30', payments: 2 },
  { ppy: 4, date: '2026-01-01', first: '2026-03-31', payments: 4 },
  { ppy: 2, date: '2026-07-01', first: '2026-12-31', payments: 1 },
  { ppy: 4, date: '2026-07-01', first: '2026-09-30', payments: 2 },
] as const;
type FD = typeof fds[number];
type Financing = 'bank' | 'bond';
type Observation = { value: string; case: LoanCaseInput; seed?: number; payments2026?: string };
const report: any = { generatorVersion: GENERATOR_VERSION, auditedCommit: '87b9efd9651aceec1d4e4f8a4c22ed1570309257' };
function assert(ok: boolean, category: string, data: unknown): void {
  if (!ok) throw new Error(category + ': ' + JSON.stringify(data));
}
function has<T>(value: T, options: readonly T[]): boolean { return options.includes(value); }
function input(type: LoanType, financingType: Financing, principal: string, duration: 4 | 5,
  rate: string, opening: string, fd: FD, terms: LoanCaseInput['financingTerms']): LoanCaseInput {
  return { loanType: type, financingType, nominalPrincipal: principal, years: duration,
    nominalAnnualRate: rate, openingBankBalance: opening, issueDate: fd.date,
    paymentsPerYear: fd.ppy, financingTerms: terms } as LoanCaseInput;
}
function optionsCheck(c: LoanCaseInput): void {
  assert(has(c.loanType, types) && has(c.financingType, financingTypes) &&
    has(c.nominalPrincipal, principals) && has(c.years, years) &&
    has(c.nominalAnnualRate, annualRates) && has(c.openingBankBalance, openingBankBalances) &&
    fds.some(fd => fd.ppy === c.paymentsPerYear && fd.date === c.issueDate), 'option set', c);
  if (c.financingType === 'bank')
    assert(has(c.financingTerms.variableCostRate, bankVariableRates) && has(c.financingTerms.fixedCost, bankFixedCosts) &&
      !('issuePrice' in c.financingTerms) && !('brokerageRate' in c.financingTerms), 'bank terms', c);
  else
    assert(has(c.financingTerms.issuePrice, bondIssuePrices) && has(c.financingTerms.brokerageRate, bondBrokerageRates) &&
      has(c.financingTerms.fixedCost, bondFixedCosts) && !('variableCostRate' in c.financingTerms), 'bond terms', c);
}
function ranges(): Record<Financing, { min?: Observation; max?: Observation }> {
  return { bank: {}, bond: {} };
}
function observeRange(r: ReturnType<typeof ranges>, financing: Financing, o: Observation): void {
  if (!r[financing].min || new D(o.value).lt(r[financing].min.value)) r[financing].min = o;
  if (!r[financing].max || new D(o.value).gt(r[financing].max.value)) r[financing].max = o;
}
function tick(): Promise<void> { return new Promise(resolve => setTimeout(resolve, 0)); }
function structural(): void {
  const start = Date.now(), counts = { bank: 0, bond: 0 }, failures: Record<string, number> = {};
  const proceedsRatios = ranges();
  function audit(c: LoanCaseInput): void {
    counts[c.financingType]++;
    const bad: string[] = [];
    const check = (ok: boolean, label: string): void => { if (!ok) bad.push(label); };
    try { optionsCheck(c); } catch { bad.push('option set/terms'); }
    const p = new D(c.nominalPrincipal), result = calculateProceeds(c), q = result.proceeds;
    check(p.gt('6000000'), 'principal floor');
    check(c.paymentsPerYear !== 1 || c.issueDate !== '2026-07-01', 'medio+1');
    check(p.isInteger() && new D(c.openingBankBalance).isInteger() &&
      new D(c.financingTerms.fixedCost).isInteger(), 'source whole kroner');
    check(q.isInteger(), 'proceeds whole kroner');
    check(q.gt(ZERO) && q.lt(p) && q.gte(p.times('0.9')), 'proceeds bounds');
    if (result.financingType === 'bank' && c.financingType === 'bank') {
      check(result.variableCost.isInteger(), 'variable cost whole kroner');
      check(result.variableCost.eq(p.times(c.financingTerms.variableCostRate)), 'variable cost base');
    } else if (result.financingType === 'bond' && c.financingType === 'bond') {
      const market = p.times(c.financingTerms.issuePrice).div(100);
      check(new D(c.financingTerms.issuePrice).lt(100), 'under par');
      check(result.marketValue.isInteger(), 'market whole kroner');
      check(result.brokerage.isInteger(), 'brokerage whole kroner');
      check(result.marketValue.eq(market) &&
        result.brokerage.eq(market.times(c.financingTerms.brokerageRate)), 'brokerage market base');
    } else bad.push('financing type result');
    for (const label of bad) failures[label] = (failures[label] ?? 0) + 1;
    assert(bad.length === 0, 'structural invariant', { c, bad });
    observeRange(proceedsRatios, c.financingType, { value: q.div(p).toString(), case: c });
  }
  for (const p of principals) for (const y of years) for (const r of annualRates)
    for (const o of openingBankBalances) for (const fd of fds) {
      for (const variableCostRate of bankVariableRates) for (const fixedCost of bankFixedCosts)
        audit(input('annuity', 'bank', p, y, r, o, fd, { variableCostRate, fixedCost }));
      for (const issuePrice of bondIssuePrices) for (const brokerageRate of bondBrokerageRates)
        for (const fixedCost of bondFixedCosts)
          audit(input('annuity', 'bond', p, y, r, o, fd, { issuePrice, brokerageRate, fixedCost }));
    }
  assert(counts.bank === 84000 && counts.bond === 151200, 'structural count', counts);
  report.structural = { counts, total: counts.bank + counts.bond, failures, proceedsRatios,
    runtimeMs: Date.now() - start, loanTypeIndependent: true };
}
function full(c: LoanCaseInput, seed?: number): { bank: Observation; rate: Observation; proceeds: Decimal } {
  optionsCheck(c);
  const d = calculateLoan(c), bad = checkGuardrails(c, d);
  assert(bad.length === 0, 'domain invariant', { seed, c, bad });
  const fd = fds.find(x => x.ppy === c.paymentsPerYear && x.date === c.issueDate)!;
  const dates = contractDates(c);
  assert(d.contract.rows.length === c.years * c.paymentsPerYear &&
    d.contract.rows[0]?.date === fd.first && d.actual2026Terms.length === fd.payments &&
    d.contract.rows.every((row, i) => row.date === dates[i]), 'dates/2026 payments', { seed, c });
  const payments = sumMoney(d.actual2026Terms.map(row => row.payment));
  const bank = new D(c.openingBankBalance).plus(d.proceeds.proceeds).minus(payments);
  assert(bank.gte(ZERO), 'year-end bank', { seed, c, bank: bank.toString() });
  return { bank: { value: bank.toString(), case: c, seed, payments2026: payments.toString() },
    rate: { value: d.effectiveInterest.rate.toString(), case: c, seed },
    proceeds: d.proceeds.proceeds };
}
async function extremal(): Promise<void> {
  const start = Date.now(), counts = { bank: 0, bond: 0 };
  let minBank: Observation | undefined;
  for (const type of types) for (const p of [principals[0], principals.at(-1)!])
    for (const y of years) for (const r of [annualRates[0], annualRates.at(-1)!])
      for (const o of [openingBankBalances[0], openingBankBalances.at(-1)!]) for (const fd of fds) {
        for (const variableCostRate of [bankVariableRates[0], bankVariableRates.at(-1)!])
          for (const fixedCost of [bankFixedCosts[0], bankFixedCosts.at(-1)!]) {
            const b = full(input(type, 'bank', p, y, r, o, fd, { variableCostRate, fixedCost })).bank;
            if (!minBank || new D(b.value).lt(minBank.value)) minBank = b;
            counts.bank++;
          }
        for (const issuePrice of [bondIssuePrices[0], bondIssuePrices.at(-1)!])
          for (const brokerageRate of [bondBrokerageRates[0], bondBrokerageRates.at(-1)!])
            for (const fixedCost of [bondFixedCosts[0], bondFixedCosts.at(-1)!]) {
              const b = full(input(type, 'bond', p, y, r, o, fd, { issuePrice, brokerageRate, fixedCost })).bank;
              if (!minBank || new D(b.value).lt(minBank.value)) minBank = b;
              counts.bond++;
            }
        await tick();
      }
  assert(counts.bank === 960 && counts.bond === 1920, 'extremal count', counts);
  report.extremal = { counts, total: counts.bank + counts.bond, failures: 0, minimumBank: minBank,
    runtimeMs: Date.now() - start };
}
type Row = { distribution: string; option: string; N: number; expected: number; observed: number;
  deviation: number; z: number };
async function seeded(): Promise<void> {
  const start = Date.now(), buckets: Record<string, Map<string, number>> = {};
  const histogram = new Map<number, number>(), proceedsRatios = ranges();
  const duplicate: Record<LoanType, { full: Set<string>; economics: Set<string> }> = {
    annuity: { full: new Set(), economics: new Set() },
    serial: { full: new Set(), economics: new Set() },
    bullet: { full: new Set(), economics: new Set() },
  };
  function add(name: string, value: string | number): void {
    const b = buckets[name] ??= new Map(), key = String(value);
    b.set(key, (b.get(key) ?? 0) + 1);
  }
  let minBank: Observation | undefined, minRate: Observation | undefined, maxRate: Observation | undefined;
  let sumAttempts = 0, minAttempts = Infinity, maxAttempts = 0, retryCount = 0;
  const retryExamples: { loanType: LoanType; seed: number; attempts: number }[] = [];
  const repeat = new Map<string, string>();
  const selected = new Set([0, 5000, 9999, 10000, 15000, 19999, 20000, 25000, 29999]);
  for (const [index, type] of types.entries()) for (let n = 0; n < 10000; n++) {
    const seed = index * 10000 + n, g = generateLevel1Case({ loanType: type, seed }), c = g.caseInput;
    assert(g.loanType === type && c.loanType === type && g.seed === seed &&
      g.generatorVersion === '1.0.0' && g.attempts >= 1, 'generator metadata', { seed, g });
    const d = full(c, seed);
    if (!minBank || new D(d.bank.value).lt(minBank.value)) minBank = d.bank;
    if (!minRate || new D(d.rate.value).lt(minRate.value)) minRate = d.rate;
    if (!maxRate || new D(d.rate.value).gt(maxRate.value)) maxRate = d.rate;
    observeRange(proceedsRatios, c.financingType,
      { value: d.proceeds.div(c.nominalPrincipal).toString(), case: c, seed });
    add('financing', c.financingType); add('years', c.years); add('paymentsPerYear', c.paymentsPerYear);
    add('annualRate', c.nominalAnnualRate); add('principal', c.nominalPrincipal);
    add('openingBank', c.openingBankBalance); add('issueOverall', c.issueDate);
    add('frequencyDate', String(c.paymentsPerYear) + '/' + c.issueDate);
    if (c.paymentsPerYear > 1) add('issuePpy' + c.paymentsPerYear, c.issueDate);
    if (c.financingType === 'bank') {
      add('bankVariable', c.financingTerms.variableCostRate); add('bankFixed', c.financingTerms.fixedCost);
    } else {
      add('bondPrice', c.financingTerms.issuePrice); add('bondBrokerage', c.financingTerms.brokerageRate);
      add('bondFixed', c.financingTerms.fixedCost);
    }
    duplicate[type].full.add(JSON.stringify(c));
    const { openingBankBalance: excluded, ...economics } = c;
    duplicate[type].economics.add(JSON.stringify(economics));
    histogram.set(g.attempts, (histogram.get(g.attempts) ?? 0) + 1);
    sumAttempts += g.attempts; minAttempts = Math.min(minAttempts, g.attempts);
    maxAttempts = Math.max(maxAttempts, g.attempts);
    if (g.attempts > 1) {
      retryCount++;
      if (retryExamples.length < 10) retryExamples.push({ loanType: type, seed, attempts: g.attempts });
      assert(JSON.stringify(generateLevel1Case({ loanType: type, seed })) === JSON.stringify(g),
        'retry reproducibility', { type, seed });
    }
    if (selected.has(seed)) repeat.set(type + '/' + seed, JSON.stringify(g));
    if (n % 50 === 49) await tick();
    if (n % 1000 === 999) console.log('L4_PROGRESS ' + type + ' ' + (n + 1));
  }
  for (const [key, value] of repeat) {
    const [type, seed] = key.split('/') as [LoanType, string];
    assert(JSON.stringify(generateLevel1Case({ loanType: type, seed: Number(seed) })) === value,
      'post-stress reproducibility', key);
  }
  const specs: { name: string; options: readonly (string | number)[]; probs?: readonly number[] }[] = [
    { name: 'financing', options: financingTypes }, { name: 'years', options: years },
    { name: 'paymentsPerYear', options: paymentsPerYear }, { name: 'annualRate', options: annualRates },
    { name: 'principal', options: principals }, { name: 'openingBank', options: openingBankBalances },
    { name: 'bankVariable', options: bankVariableRates }, { name: 'bankFixed', options: bankFixedCosts },
    { name: 'bondPrice', options: bondIssuePrices }, { name: 'bondBrokerage', options: bondBrokerageRates },
    { name: 'bondFixed', options: bondFixedCosts },
    { name: 'issuePpy2', options: ['2026-01-01', '2026-07-01'] },
    { name: 'issuePpy4', options: ['2026-01-01', '2026-07-01'] },
    { name: 'issueOverall', options: ['2026-01-01', '2026-07-01'], probs: [2 / 3, 1 / 3] },
  ];
  const distributions: Row[] = [];
  for (const s of specs) {
    const b = buckets[s.name] ?? new Map(), N = [...b.values()].reduce((a, v) => a + v, 0);
    for (const [i, option] of s.options.entries()) {
      const p = s.probs?.[i] ?? 1 / s.options.length, observed = b.get(String(option)) ?? 0;
      const expected = N * p, deviation = observed - expected;
      const row = { distribution: s.name, option: String(option), N, expected, observed, deviation,
        z: Math.abs(deviation) / Math.sqrt(N * p * (1 - p)) };
      distributions.push(row);
      assert(observed > 0 && row.z <= 6, 'distribution smoke/coverage', row);
    }
  }
  const frequencyDate = Object.fromEntries(buckets.frequencyDate ?? []);
  const medioPlusOne = buckets.frequencyDate?.get('1/2026-07-01') ?? 0;
  assert(Object.keys(frequencyDate).length === 5 && medioPlusOne === 0, 'date coverage', frequencyDate);
  const duplicates = Object.fromEntries(types.map(type => {
    const uniqueFull = duplicate[type].full.size, uniqueEconomics = duplicate[type].economics.size;
    assert(uniqueFull >= 7500 && uniqueEconomics >= 6000, 'duplicate collapse',
      { type, uniqueFull, uniqueEconomics });
    return [type, { generated: 10000, uniqueFull, duplicateFull: 10000 - uniqueFull,
      duplicateFullRate: (10000 - uniqueFull) / 10000, uniqueEconomics,
      duplicateEconomics: 10000 - uniqueEconomics,
      duplicateEconomicsRate: (10000 - uniqueEconomics) / 10000 }];
  }));
  report.seeded = { counts: { annuity: 10000, serial: 10000, bullet: 10000, total: 30000 },
    failures: 0, attempts: { histogram: Object.fromEntries(histogram), min: minAttempts,
      max: maxAttempts, mean: sumAttempts / 30000, one: histogram.get(1) ?? 0,
      overOne: retryCount, retryExamples, naturalRejectionObserved: retryCount > 0 },
    distributions, maximumZ: distributions.reduce((a, b) => a.z > b.z ? a : b),
    frequencyDate, medioPlusOne, duplicates, proceedsRatios,
    minimumBank: minBank, minimumEffectiveRate: minRate, maximumEffectiveRate: maxRate,
    reproducibility: { checked: [...repeat.keys()], pass: true },
    rawEqualsAcceptedFirstDraws: retryCount === 0, runtimeMs: Date.now() - start };
}
it('audits structural space, full extremal matrix, and 30,000 seeded cases', async () => {
  structural(); await extremal(); await seeded();
  expect(report.seeded.failures).toBe(0);
  console.log('L4_AUDIT_JSON=' + JSON.stringify(report));
}, 3_600_000);
