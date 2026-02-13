/**
 * agentics-contracts/observability
 *
 * Debug logging and observability types per ADR-008.
 * results-index MUST NOT generate spans; logging only.
 */

export type ValidationStatus = 'valid' | 'invalid' | 'legacy_transformed';

export interface InspectDebugLog {
  execution_id: string;
  schema_version: string;
  validation_status: ValidationStatus;
  timestamp: string;
}

/**
 * Log inspect debug information.
 * results-index is read-only: no spans, no mutations, logging only.
 */
export function logInspectDebug(entry: InspectDebugLog): void {
  console.log(
    `[debug:inspect] execution_id=${entry.execution_id} schema_version=${entry.schema_version} validation_status=${entry.validation_status}`
  );
}
