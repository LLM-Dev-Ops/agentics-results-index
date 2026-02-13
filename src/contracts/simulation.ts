/**
 * agentics-contracts/simulation
 *
 * Canonical simulation result contract per ADR-001 and ADR-008.
 * SimulationExecutionResult is the single source of truth for inspect responses.
 */

import type { ExecutionMetadata, ExecutionProof } from './execution';

/**
 * Result summary within a simulation execution
 */
export interface SimulationResultSummary {
  assertions_passed: number;
  assertions_failed: number;
  total_layers: number;
  mandatory_layers_complete: boolean;
  [key: string]: unknown;
}

/**
 * SimulationExecutionResult - the canonical contract shape
 * returned by all inspect endpoints.
 *
 * Per ADR-008: execution_metadata and executionProof are REQUIRED.
 * Per ADR-001: layerRecords may NOT be missing.
 */
export interface SimulationExecutionResult {
  run_id: string;
  scenario_id: string;
  environment: string;
  status: string;
  execution_metadata: ExecutionMetadata;
  executionProof: ExecutionProof;
  result_summary: SimulationResultSummary;
  correlation_id: string | null;
}

/**
 * Schema version for the current contract
 */
export const SCHEMA_VERSION = '1.0.0';
