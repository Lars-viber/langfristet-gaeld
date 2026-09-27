import { D } from '../domain/decimal';
import type { StudentState } from '../student';
import { STUDENT_STATE_VERSION, STUDENT_STEPS } from '../student';
import { PERSISTENCE_SCHEMA_VERSION, RULESET_VERSION } from './types';
import type { PersistenceErrorCode, RestoreResult } from './types';

class PersistenceFault extends Error {
  constructor(readonly code: PersistenceErrorCode) { super(code); }
}
type Reader = (value: unknown) => unknown;
const fail = (code: PersistenceErrorCode = 'INVALID_SESSION'): never => { throw new PersistenceFault(code); };
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const str: Reader = (value) => typeof value === 'string' ? value : fail();
const bool: Reader = (value) => typeof value === 'boolean' ? value : fail();
const integer = (min: number, max: number): Reader => (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fail();
const literal = (...values: readonly (string | number)[]): Reader => (value) =>
  values.includes(value as string | number) ? value : fail();
const nullable = (read: Reader): Reader => (value) => value === null ? null : read(value);
const array = (read: Reader): Reader => (value) => Array.isArray(value) ? value.map(read) : fail();
const object = (shape: Record<string, Reader>): Reader => (value) => {
  if (!isObject(value) || Object.keys(value).some((key) => !Object.hasOwn(shape, key))) return fail();
  const result: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(shape)) {
    if (!Object.hasOwn(value, key)) return fail();
    result[key] = read(value[key]);
  }
  return result;
};
const partial = (keys: readonly string[], read: Reader): Reader => (value) => {
  if (!isObject(value) || Object.keys(value).some((key) => !keys.includes(key))) return fail();
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, read(item)]));
};
const terms = (read: Reader): Reader => (value) => {
  if (!isObject(value) || Object.keys(value).some((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) > 20)) return fail();
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, read(item)]));
};
const decimal: Reader = (value) => {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return fail('INVALID_DECIMAL');
  try {
    const parsed = new D(value);
    return parsed.isFinite() ? parsed : fail('INVALID_DECIMAL');
  } catch { return fail('INVALID_DECIMAL'); }
};
const decimalText: Reader = (value) => { decimal(value); return value; };
const date: Reader = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail();
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]! ? value : fail();
};
const loanType = literal('annuity', 'serial', 'bullet');
const account = literal('4410', '4450', '5820', '6320', '6330', '6760');
const side = literal('D', 'K');
const step = literal(...STUDENT_STEPS);
const errorCode = nullable(literal(
  'MISSING_EQUALS', 'NO_ACTUAL_OPERATION', 'INVALID_FORMULA', 'UNKNOWN_REFERENCE',
  'DIVISION_BY_ZERO', 'NON_FINITE_RESULT', 'NEGATIVE_AMOUNT_NOT_ALLOWED',
  'WRONG_RESULT', 'WRONG_SIGN', 'INVALID_AMOUNT', 'INVALID_SIGN',
  'WRONG_DEBIT_CREDIT_SIDE', 'IRRELEVANT_ACCOUNT', 'UNBALANCED_POSTING_BLOCK',
  'WRONG_NET_MOVEMENT',
));

const caseInput: Reader = (value) => {
  if (!isObject(value)) return fail();
  const common = {
    loanType, financingType: literal('bank', 'bond'), issueDate: date,
    nominalPrincipal: decimalText, nominalAnnualRate: decimalText,
    years: literal(4, 5), paymentsPerYear: literal(1, 2, 4), openingBankBalance: decimalText,
  };
  const financingTerms = value.financingType === 'bank'
    ? object({ variableCostRate: decimalText, fixedCost: decimalText })
    : value.financingType === 'bond'
      ? object({ issuePrice: decimalText, brokerageRate: decimalText, fixedCost: decimalText }) : fail();
  return object({ ...common, financingTerms })(value);
};
const generatedCase = object({
  generatorVersion: str, seed: integer(0, 0xFFFFFFFF), loanType,
  attempts: integer(1, 10_000), caseInput,
});
const proceeds: Reader = (value) => {
  if (!isObject(value)) return fail();
  return value.financingType === 'bank'
    ? object({ financingType: literal('bank'), nominalPrincipal: decimal, variableCost: decimal, fixedCost: decimal, proceeds: decimal })(value)
    : value.financingType === 'bond'
      ? object({ financingType: literal('bond'), nominalPrincipal: decimal, marketValue: decimal, brokerage: decimal, fixedCost: decimal, proceeds: decimal })(value)
      : fail();
};
const contractRow = object({ term: integer(1, 20), date, openingPrincipal: decimal, payment: decimal, nominalInterest: decimal, principalRepayment: decimal, closingPrincipal: decimal });
const cashFlowRow = object({ term: integer(0, 20), date, direction: literal('inflow', 'outflow'), amount: decimal, signedAmount: decimal });
const incomeRow = object({ term: integer(1, 20), date, nominalInterest: decimal, amortization: decimal, totalInterestExpense: decimal });
const carryingRow = object({ term: integer(1, 20), date, openingCarryingAmount: decimal, principalRepayment: decimal, amortization: decimal, closingCarryingAmount: decimal });
const movement = object({ account, amount: decimal });
const postingEvent = object({ kind: literal('origination', 'payment', 'amortization', 'reclassification'), term: nullable(integer(0, 20)), date, movements: array(movement) });
const classification = object({ date: literal('2026-12-31'), carryingAmount: decimal, shortTerm: decimal, longTerm: decimal, reclassificationRequired: bool });
const accountBalance: Reader = (value) => {
  if (!isObject(value)) return fail();
  return value.status === 'balance'
    ? object({ account, status: literal('balance'), amount: decimal, side })(value)
    : value.status === 'noBalance' ? object({ account, status: literal('noBalance') })(value) : fail();
};
const caseResult = object({
  input: caseInput, proceeds,
  contract: object({ termRate: decimal, standardPayment: nullable(decimal), rows: array(contractRow) }),
  cashFlows: array(cashFlowRow),
  effectiveInterest: object({ rate: decimal, displayedPercent: str, npvResidual: decimal }),
  incomeSchedule: array(incomeRow), carryingSchedule: array(carryingRow),
  actual2026Terms: array(contractRow), postingEvents: array(postingEvent),
  classification, accountBalances: nullable(array(accountBalance)),
});
const field = object({ raw: str, approved: bool, errorCode });
const postingLine = object({ account, side, amount: str });
const block = object({
  lines: array(postingLine), approved: bool, errors: array((value) => {
    const code = errorCode(value);
    return code === null ? fail() : code;
  }),
  accountStatuses: array(object({ account, netCorrect: bool, studentNet: str })),
});
const cashFlowInput = object({ amount: str, sign: nullable(literal('+', '-')), approved: bool, errorCode });
const amortizationTerm = object({
  income: partial(['nominalInterest', 'amortization', 'totalInterestExpense'], field),
  balance: partial(['openingCarryingAmount', 'principalRepayment', 'amortization', 'closingCarryingAmount'], field),
  incomeApproved: bool, balanceApproved: bool, approved: bool,
});
const finalBalance = object({ raw: str, approved: bool, errorCode, side: nullable(side) });
const scheduleState: Reader = (value) => {
  if (!isObject(value)) return fail();
  // Older L5 sessions did not store the explicit YDELSE action.
  const compatible = Object.hasOwn(value, 'annuityPaymentCalculated')
    ? value : { ...value, annuityPaymentCalculated: false };
  return object({
    prerequisites: partial(['principal', 'termCount', 'termRate', 'fixedRepayment'], field),
    annuityPaymentCalculated: bool,
    rows: terms(partial(['openingPrincipal', 'payment', 'nominalInterest', 'principalRepayment', 'closingPrincipal'], field)),
    approvedTerms: array(integer(1, 20)), remainingCalculated: bool,
  })(compatible);
};
const studentState = object({
  schemaVersion: literal(STUDENT_STATE_VERSION), caseResult, currentStep: step,
  viewingStep: step, completedSteps: array(step), sessionStatus: literal('active', 'completed'),
  proceeds: partial(['variableCost', 'marketValue', 'brokerage', 'proceeds'], field),
  initialRecognition: block,
  schedule: scheduleState,
  effectiveInterest: object({ rows: terms(cashFlowInput), approvedTerms: array(integer(0, 20)), remainingCalculated: bool, rateCalculated: bool }),
  amortization: object({ terms: terms(amortizationTerm), remainingCalculated: bool }),
  bookkeeping: terms(object({ payment: block, amortization: block })),
  classification: object({
    fields: partial(['carryingAmount', 'shortTerm', 'longTerm'], field),
    shortTermAnswer: nullable(literal('yes', 'no')),
    upcomingRepayments: terms(field), reconciled: bool, reclassification: block,
    reclassificationAnswer: nullable(literal('yes', 'no')), answerErrorCode: errorCode,
  }),
  completion: object({
    balances: partial(['4410', '4450', '5820', '6320', '6330', '6760'], finalBalance),
    checks: object({ debtReconciles: bool, financialExpenseReconciles: bool, accountsReconcile: bool }),
  }),
});

export function deserializeStudentSession(input: unknown): RestoreResult {
  try {
    if (!isObject(input)) return fail();
    if (input.schemaVersion !== PERSISTENCE_SCHEMA_VERSION) return fail('UNSUPPORTED_SCHEMA_VERSION');
    if (input.rulesetVersion !== RULESET_VERSION) return fail('UNSUPPORTED_RULESET_VERSION');
    if (input.studentStateVersion !== STUDENT_STATE_VERSION) return fail('UNSUPPORTED_STUDENT_STATE_VERSION');
    if (typeof input.generatorVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.generatorVersion)) return fail('INVALID_GENERATOR_VERSION');
    // Earlier v2 snapshots may omit Step 3 work; keep the same schema and start it empty.
    const rawState = input.studentState;
    const rawInterest = isObject(rawState) ? rawState.effectiveInterest : undefined;
    const interest = isObject(rawInterest) ? rawInterest : rawInterest === undefined ? {} : rawInterest;
    const rawAmortization = isObject(rawState) ? rawState.amortization : undefined;
    const amortization = isObject(rawAmortization) ? rawAmortization : rawAmortization === undefined ? {} : rawAmortization;
    const rawClassification = isObject(rawState) ? rawState.classification : undefined;
    const classification = isObject(rawClassification) ? rawClassification : rawClassification === undefined ? {} : rawClassification;
    const emptyTerm = () => ({ income: {}, balance: {}, incomeApproved: false, balanceApproved: false, approved: false });
    const normalized = isObject(rawState) && isObject(interest) && isObject(amortization) && isObject(classification) ? {
      ...input, studentState: { ...rawState, effectiveInterest: {
        rows: {}, approvedTerms: [], remainingCalculated: false, rateCalculated: false, ...interest,
      }, amortization: { terms: { 1: emptyTerm(), 2: emptyTerm() }, remainingCalculated: false, ...amortization },
      classification: { fields: {}, shortTermAnswer: null, upcomingRepayments: {}, reconciled: false,
        reclassification: { lines: [], approved: false, errors: [], accountStatuses: [] },
        reclassificationAnswer: null, answerErrorCode: null, ...classification } },
    } : input;
    const document = object({
      schemaVersion: literal(PERSISTENCE_SCHEMA_VERSION), rulesetVersion: literal(RULESET_VERSION),
      generatorVersion: str, studentStateVersion: literal(STUDENT_STATE_VERSION),
      selectedLoanType: loanType, seed: integer(0, 0xFFFFFFFF), generatedCase, studentState,
    })(normalized) as Record<string, unknown>;
    const snapshot = document.generatedCase as Record<string, unknown>;
    const stored = document.studentState as Record<string, unknown>;
    if (snapshot.generatorVersion !== document.generatorVersion || snapshot.seed !== document.seed || snapshot.loanType !== document.selectedLoanType) return fail();
    if (!/^\d+\.\d+\.\d+$/.test(snapshot.generatorVersion as string)) return fail('INVALID_GENERATOR_VERSION');
    const inputCase = snapshot.caseInput as Record<string, unknown>;
    if (inputCase.loanType !== snapshot.loanType) return fail();
    // Stored snapshots remain authoritative across generator releases. Never regenerate here.
    if (JSON.stringify(inputCase) !== JSON.stringify((stored.caseResult as Record<string, unknown>).input)) return fail();
    const savedSchedule = (normalized.studentState as Record<string, unknown>).schedule as Record<string, unknown>;
    if (!Object.hasOwn(savedSchedule, 'annuityPaymentCalculated')) {
      const schedule = stored.schedule as StudentState['schedule'];
      schedule.annuityPaymentCalculated = snapshot.loanType === 'annuity'
        && (schedule.approvedTerms.length > 0 || schedule.remainingCalculated);
    }
    return { status: 'restored', state: { ...stored, generatedCase: snapshot } as unknown as StudentState };
  } catch (error) {
    return { status: 'error', code: error instanceof PersistenceFault ? error.code : 'INVALID_SESSION' };
  }
}
