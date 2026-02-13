/**
 * agentics-contracts
 *
 * Re-exports canonical contract types and schemas from the
 * agentics-contracts package. Results-index does NOT define its own
 * result packet shape — all types originate from the contracts package.
 */

// Re-export canonical types from agentics-contracts package
export type {
  ExecutionMetadata,
  ExecutionProof,
  LayerRecord,
  MandatoryLayer,
  SimulationExecutionResult,
  SimulationResultSummary,
  ResultPacket,
  ExecutionContext,
} from 'agentics-contracts';

// Re-export canonical schemas and constants from agentics-contracts package
export {
  MANDATORY_LAYERS,
  SCHEMA_VERSION,
  ResultPacketSchema,
  SimulationExecutionResultSchema,
  ExecutionMetadataSchema,
  ExecutionProofSchema,
  LayerRecordSchema,
  SimulationResultSummarySchema,
  ExecutionContextSchema,
} from 'agentics-contracts';

// Re-export local observability utilities (results-index specific, not contract definitions)
export type {
  ValidationStatus,
  InspectDebugLog,
  LookupMode,
  ResultsIndexLookupLog,
} from './observability';
export { logInspectDebug, logResultsIndexLookup } from './observability';

// Re-export local validation utilities
export {
  validateAgainstSchema,
  buildCLIError,
  isCanonicalResult,
} from './validation';
export type {
  CLIError,
  ValidationFailure,
} from './validation';

// Re-export local transform utilities
export { transformToCanonicalResult } from './transform';
