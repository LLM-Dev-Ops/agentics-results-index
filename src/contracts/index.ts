/**
 * agentics-contracts
 *
 * Canonical contract types for the Agentics platform.
 * All inspect responses MUST conform to these contracts.
 *
 * Import paths:
 *   contracts/execution
 *   contracts/simulation
 *   contracts/observability
 */

// Re-export all contract types
export type {
  ExecutionMetadata,
  ExecutionProof,
  LayerRecord,
  MandatoryLayer,
} from './execution';
export { MANDATORY_LAYERS } from './execution';

export type {
  SimulationExecutionResult,
  SimulationResultSummary,
} from './simulation';
export { SCHEMA_VERSION } from './simulation';

export type {
  ValidationStatus,
  InspectDebugLog,
} from './observability';
export { logInspectDebug } from './observability';

export {
  validateAgainstSchema,
  buildCLIError,
  isCanonicalResult,
} from './validation';
export type {
  CLIError,
  ValidationFailure,
} from './validation';

export { transformToCanonicalResult } from './transform';
