import type { ISODate, LoanCaseInput, PaymentsPerYear } from './types';

const months: Record<PaymentsPerYear, readonly number[]> = {
  1: [12],
  2: [6, 12],
  4: [3, 6, 9, 12],
};
const days: Record<number, number> = { 3: 31, 6: 30, 9: 30, 12: 31 };

function iso(year: number, month: number): ISODate {
  return `${year}-${String(month).padStart(2, '0')}-${days[month]}` as ISODate;
}

export function contractDates(input: Pick<LoanCaseInput, 'issueDate' | 'years' | 'paymentsPerYear'>): ISODate[] {
  if (input.issueDate !== '2026-01-01' && input.issueDate !== '2026-07-01') {
    throw new Error('Unsupported Level 1 issue date');
  }
  if (input.issueDate === '2026-07-01' && input.paymentsPerYear === 1) {
    throw new Error('Medio issue with one annual payment is not a Level 1 case');
  }
  if (!(input.paymentsPerYear in months) || (input.years !== 4 && input.years !== 5)) {
    throw new Error('Unsupported Level 1 term configuration');
  }

  const count = input.years * input.paymentsPerYear;
  const result: ISODate[] = [];
  for (let year = 2026; result.length < count; year++) {
    for (const month of months[input.paymentsPerYear]) {
      const date = iso(year, month);
      if (date > input.issueDate) result.push(date);
      if (result.length === count) break;
    }
  }
  return result;
}
