import Decimal from 'decimal.js';
import { STUDENT_STATE_VERSION } from '../student';
import type { StudentState } from '../student';
import { PERSISTENCE_SCHEMA_VERSION, RULESET_VERSION } from './types';
import type { JsonValue } from './types';

function jsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null) {
    // Decimal.isDecimal also recognizes instances from the domain's cloned constructor.
    if (Decimal.isDecimal(value)) {
      return value.toFixed(); // Plain decimal notation, without exponent or precision loss.
    }
    if (Array.isArray(value)) return value.map(jsonSafe);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  throw new Error('StudentState contains a non-JSON value');
}

export function serializeStudentSession(state: StudentState): JsonValue {
  if (state.schemaVersion !== STUDENT_STATE_VERSION) throw new Error('Unsupported StudentState version');
  const { generatedCase, ...studentState } = state;
  return jsonSafe({
    schemaVersion: PERSISTENCE_SCHEMA_VERSION,
    rulesetVersion: RULESET_VERSION,
    generatorVersion: generatedCase.generatorVersion,
    studentStateVersion: STUDENT_STATE_VERSION,
    selectedLoanType: generatedCase.loanType,
    seed: generatedCase.seed,
    generatedCase,
    studentState,
  });
}
