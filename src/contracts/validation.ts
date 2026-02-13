/**
 * ContractValidationAdapter
 *
 * Validates results against the canonical contract schema using
 * Zod schemas from agentics-contracts.
 *
 * Per ADR-004: If validation fails, return structured CLIError.
 * DO NOT throw raw exceptions.
 */

import {
  SimulationExecutionResultSchema,
} from 'agentics-contracts';
import type {
  SimulationExecutionResult,
} from 'agentics-contracts';
import type { ErrorCode } from '../types';

/**
 * Structured CLI error returned when contract validation fails
 */
export interface CLIError {
  code: ErrorCode;
  message: string;
  details: ValidationFailure[];
  requestId: string;
  timestamp: string;
}

export interface ValidationFailure {
  field: string;
  issue: string;
}

/**
 * Validate a result object against the SimulationExecutionResult schema
 * using the canonical Zod schema from agentics-contracts.
 *
 * Returns null if valid, or a list of validation failures.
 */
export function validateAgainstSchema(
  schemaName: 'SimulationExecutionResult',
  result: unknown
): ValidationFailure[] | null {
  if (schemaName !== 'SimulationExecutionResult') {
    return [{ field: 'schema', issue: `Unknown schema: ${schemaName}` }];
  }

  const parsed = SimulationExecutionResultSchema.safeParse(result);

  if (parsed.success) {
    return null;
  }

  const failures: ValidationFailure[] = parsed.error.errors.map((err) => ({
    field: err.path.join('.'),
    issue: err.message,
  }));

  return failures;
}

/**
 * Build a structured CLIError response from validation failures.
 */
export function buildCLIError(
  requestId: string,
  failures: ValidationFailure[]
): CLIError {
  return {
    code: 'INTERNAL_ERROR',
    message: `Contract validation failed for SimulationExecutionResult: ${failures.length} field(s) invalid`,
    details: failures,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Type guard to check if a result already conforms to SimulationExecutionResult
 */
export function isCanonicalResult(result: unknown): result is SimulationExecutionResult {
  return SimulationExecutionResultSchema.safeParse(result).success;
}
