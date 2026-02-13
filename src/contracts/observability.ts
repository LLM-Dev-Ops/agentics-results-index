/**
 * agentics-contracts/observability
 *
 * Debug logging and observability types per ADR-008.
 * results-index MUST NOT generate spans; logging only.
 */

export type ValidationStatus = 'valid' | 'invalid' | 'legacy_transformed';

export type LookupMode = 'execution' | 'simulation';

export interface InspectDebugLog {
  execution_id: string;
  schema_version: string;
  validation_status: ValidationStatus;
  timestamp: string;
}

/**
 * Structured lookup log per ADR-004 execution authority.
 * Emitted on every resolve operation.
 */
export interface ResultsIndexLookupLog {
  input_id: string;
  resolved_execution_id: string | null;
  lookup_mode: LookupMode;
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

/**
 * Log structured lookup resolution per ADR-004.
 */
export function logResultsIndexLookup(entry: ResultsIndexLookupLog): void {
  console.log(
    `[RESULTS_INDEX_LOOKUP] input_id=${entry.input_id} resolved_execution_id=${entry.resolved_execution_id ?? 'null'} lookup_mode=${entry.lookup_mode}`
  );
}
