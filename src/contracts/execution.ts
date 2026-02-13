/**
 * agentics-contracts/execution
 *
 * Canonical execution contract types per ADR-001.
 * These are the REQUIRED invariants for all execution results.
 */

/**
 * Layer record - individual execution layer result
 */
export interface LayerRecord {
  layer_name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  assertions_passed: number;
  assertions_failed: number;
  error?: string;
}

/**
 * Execution proof - cryptographic and structural proof of execution
 * Per ADR-004: executionProof is REQUIRED, never optional.
 */
export interface ExecutionProof {
  proof_hash: string;
  layerRecords: LayerRecord[];
  generated_at: string;
}

/**
 * Execution metadata - identifies a specific execution run
 * Per ADR-001: execution_id, proof_hash, and layers_executed are REQUIRED.
 */
export interface ExecutionMetadata {
  execution_id: string;
  proof_hash: string;
  layers_executed: string[];
  schema_version: string;
  environment: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}

/**
 * Mandatory layers that must be present in a valid execution
 */
export const MANDATORY_LAYERS = [
  'specification',
  'pseudocode',
  'architecture',
  'refinement',
  'completion',
] as const;

export type MandatoryLayer = (typeof MANDATORY_LAYERS)[number];
