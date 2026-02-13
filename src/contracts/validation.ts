/**
 * ContractValidationAdapter
 *
 * Validates inspect responses against the canonical contract schema
 * before returning them to clients.
 *
 * Per ADR-004: If validation fails, return structured CLIError.
 * DO NOT throw raw exceptions.
 */

import type { SimulationExecutionResult } from './simulation';
import type { ErrorResponse, ErrorCode } from '../types';

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
 * Validate a result object against the SimulationExecutionResult schema.
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

  const failures: ValidationFailure[] = [];
  const r = result as Record<string, unknown>;

  if (!r || typeof r !== 'object') {
    return [{ field: 'root', issue: 'Result must be an object' }];
  }

  // Required top-level fields
  if (!r['run_id'] || typeof r['run_id'] !== 'string') {
    failures.push({ field: 'run_id', issue: 'Required string field missing' });
  }
  if (!r['scenario_id'] || typeof r['scenario_id'] !== 'string') {
    failures.push({ field: 'scenario_id', issue: 'Required string field missing' });
  }
  if (!r['status'] || typeof r['status'] !== 'string') {
    failures.push({ field: 'status', issue: 'Required string field missing' });
  }

  // execution_metadata is REQUIRED (ADR-001)
  const meta = r['execution_metadata'] as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') {
    failures.push({ field: 'execution_metadata', issue: 'Required object missing' });
  } else {
    if (!meta['execution_id'] || typeof meta['execution_id'] !== 'string') {
      failures.push({ field: 'execution_metadata.execution_id', issue: 'Required string field missing' });
    }
    if (!meta['proof_hash'] || typeof meta['proof_hash'] !== 'string') {
      failures.push({ field: 'execution_metadata.proof_hash', issue: 'Required string field missing' });
    }
    if (!Array.isArray(meta['layers_executed'])) {
      failures.push({ field: 'execution_metadata.layers_executed', issue: 'Required array missing' });
    }
  }

  // executionProof is REQUIRED (ADR-004)
  const proof = r['executionProof'] as Record<string, unknown> | undefined;
  if (!proof || typeof proof !== 'object') {
    failures.push({ field: 'executionProof', issue: 'Required object missing' });
  } else {
    if (!proof['proof_hash'] || typeof proof['proof_hash'] !== 'string') {
      failures.push({ field: 'executionProof.proof_hash', issue: 'Required string field missing' });
    }
    if (!Array.isArray(proof['layerRecords'])) {
      failures.push({ field: 'executionProof.layerRecords', issue: 'Required array missing' });
    }
  }

  // result_summary is REQUIRED
  const summary = r['result_summary'] as Record<string, unknown> | undefined;
  if (!summary || typeof summary !== 'object') {
    failures.push({ field: 'result_summary', issue: 'Required object missing' });
  } else {
    if (typeof summary['mandatory_layers_complete'] !== 'boolean') {
      failures.push({ field: 'result_summary.mandatory_layers_complete', issue: 'Required boolean field missing' });
    }
  }

  return failures.length > 0 ? failures : null;
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
  return validateAgainstSchema('SimulationExecutionResult', result) === null;
}
