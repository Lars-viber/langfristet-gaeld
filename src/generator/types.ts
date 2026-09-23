import type { LoanCaseInput, LoanType } from '../domain';

export interface GenerateLevel1CaseInput {
  readonly loanType: LoanType;
  readonly seed: number;
}

export interface GeneratedLevel1Case {
  readonly generatorVersion: string;
  readonly seed: number;
  readonly loanType: LoanType;
  readonly attempts: number;
  readonly caseInput: Readonly<LoanCaseInput>;
}

export class GeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratorError';
  }
}
