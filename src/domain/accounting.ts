import type Decimal from 'decimal.js';
import { D, sumMoney, ZERO } from './decimal';
import type {
  AccountNumber, CarryingAmountScheduleRow, ContractScheduleRow, IncomeScheduleRow,
  LoanCaseInput, NetMovement, PostingEvent, YearEndClassification,
} from './types';

export function debtAccount(input: LoanCaseInput): '6320' | '6330' {
  return input.financingType === 'bank' ? '6320' : '6330';
}

function movement(account: AccountNumber, amount: Decimal): NetMovement {
  return { account, amount };
}

export function eventBalances(event: PostingEvent): boolean {
  return sumMoney(event.movements.map((item) => item.amount)).eq(ZERO);
}

export function buildPostingEvents(
  input: LoanCaseInput,
  proceeds: Decimal,
  contract: readonly ContractScheduleRow[],
  income: readonly IncomeScheduleRow[],
  carrying: readonly CarryingAmountScheduleRow[],
  classification: YearEndClassification,
): PostingEvent[] {
  const debt = debtAccount(input);
  const events: PostingEvent[] = [{
    kind: 'origination', term: 0, date: input.issueDate,
    movements: [movement('5820', proceeds), movement(debt, proceeds.neg())],
  }];
  for (const [index, row] of contract.entries()) {
    if (row.date > '2026-12-31') continue;
    const amortization = income[index]?.amortization;
    if (!amortization || carrying[index]?.amortization !== amortization) {
      throw new Error('Income and carrying amortization do not align');
    }
    const paymentMovements = [movement('4410', row.nominalInterest)];
    if (row.principalRepayment.gt(ZERO)) paymentMovements.push(movement(debt, row.principalRepayment));
    paymentMovements.push(movement('5820', row.payment.neg()));
    events.push({ kind: 'payment', term: row.term, date: row.date, movements: paymentMovements });
    events.push({
      kind: 'amortization', term: row.term, date: row.date,
      movements: [movement('4450', amortization), movement(debt, amortization.neg())],
    });
  }
  if (classification.reclassificationRequired) {
    events.push({
      kind: 'reclassification', term: null, date: classification.date,
      movements: [movement(debt, classification.shortTerm), movement('6760', classification.shortTerm.neg())],
    });
  }
  if (events.some((event) => !eventBalances(event))) throw new Error('Unbalanced domain posting event');
  return events;
}

export function sumAccountMovements(events: readonly PostingEvent[], account: AccountNumber): Decimal {
  return sumMoney(events.flatMap((event) => event.movements
    .filter((item) => item.account === account).map((item) => item.amount)));
}

export function netOnAccount(
  events: readonly PostingEvent[], account: AccountNumber, openingBankBalance: string,
): Decimal {
  const opening = account === '5820' ? new D(openingBankBalance) : ZERO;
  return opening.plus(sumAccountMovements(events, account));
}
