/**
 * Legacy-to-Contract Transformation
 *
 * Safe fallback: if result format is legacy, transform into
 * canonical contract shape before returning.
 *
 * results-index is READ ONLY - this only transforms response shapes,
 * never mutates execution artifacts.
 */

import { createHash } from 'crypto';
import type { Run } from '../types';
import type { SimulationExecutionResult } from './simulation';
import type { ExecutionMetadata, ExecutionProof, LayerRecord } from './execution';
import { MANDATORY_LAYERS } from './execution';
import { SCHEMA_VERSION } from './simulation';

/**
 * Check whether a Run already contains canonical contract data
 * in its metadata field (new-format runs will embed this).
 */
function hasCanonicalMetadata(run: Run): boolean {
  if (!run.metadata) return false;
  const m = run.metadata;
  return (
    typeof m['execution_id'] === 'string' &&
    typeof m['proof_hash'] === 'string' &&
    Array.isArray(m['layers_executed'])
  );
}

/**
 * Check whether a Run already contains executionProof data
 */
function hasExecutionProof(run: Run): boolean {
  if (!run.metadata) return false;
  const proof = run.metadata['executionProof'];
  return (
    typeof proof === 'object' &&
    proof !== null &&
    Array.isArray((proof as Record<string, unknown>)['layerRecords'])
  );
}

/**
 * Derive a deterministic proof hash from run data.
 * Used as fallback for legacy runs that don't have a real proof hash.
 */
function deriveLegacyProofHash(run: Run): string {
  const content = `${run.run_id}:${run.scenario_id}:${run.status}:${run.completed_at}`;
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Build synthetic layer records from a legacy run's result_summary.
 * Legacy runs don't have per-layer data, so we synthesize a single
 * aggregate layer record.
 */
function buildLegacyLayerRecords(run: Run): LayerRecord[] {
  const summary = run.result_summary;
  return [
    {
      layer_name: 'aggregate',
      status: run.status === 'completed' ? 'passed' : 'failed',
      duration_ms: run.duration_ms,
      assertions_passed: typeof summary?.assertions_passed === 'number' ? summary.assertions_passed : 0,
      assertions_failed: typeof summary?.assertions_failed === 'number' ? summary.assertions_failed : 0,
      error: run.status === 'failed' ? `Legacy run failed with status: ${run.status}` : undefined,
    },
  ];
}

/**
 * Determine which mandatory layers are present.
 * For legacy runs, none are individually tracked.
 * For new runs, layers_executed from metadata is used.
 */
function checkMandatoryLayersComplete(layersExecuted: string[]): boolean {
  return MANDATORY_LAYERS.every((layer) => layersExecuted.includes(layer));
}

/**
 * Transform a Run (legacy or new) into the canonical SimulationExecutionResult.
 *
 * If the run already contains canonical metadata, extract it.
 * Otherwise, synthesize a valid contract shape from available data.
 */
export function transformToCanonicalResult(run: Run): {
  result: SimulationExecutionResult;
  isLegacy: boolean;
} {
  // Check if run already has canonical contract data embedded
  if (hasCanonicalMetadata(run) && hasExecutionProof(run)) {
    const meta = run.metadata!;
    const proofData = meta['executionProof'] as Record<string, unknown>;
    const layersExecuted = meta['layers_executed'] as string[];

    const execution_metadata: ExecutionMetadata = {
      execution_id: meta['execution_id'] as string,
      proof_hash: meta['proof_hash'] as string,
      layers_executed: layersExecuted,
      schema_version: (meta['schema_version'] as string) ?? SCHEMA_VERSION,
      environment: run.environment,
      started_at: run.started_at,
      completed_at: run.completed_at,
      duration_ms: run.duration_ms,
    };

    const executionProof: ExecutionProof = {
      proof_hash: meta['proof_hash'] as string,
      layerRecords: proofData['layerRecords'] as LayerRecord[],
      generated_at: (proofData['generated_at'] as string) ?? run.completed_at,
    };

    const summary = run.result_summary ?? {};
    const totalLayers = executionProof.layerRecords.length;
    const totalPassed = executionProof.layerRecords.reduce((n, lr) => n + lr.assertions_passed, 0);
    const totalFailed = executionProof.layerRecords.reduce((n, lr) => n + lr.assertions_failed, 0);

    return {
      result: {
        run_id: run.run_id,
        scenario_id: run.scenario_id,
        environment: run.environment,
        status: run.status,
        execution_metadata,
        executionProof,
        result_summary: {
          assertions_passed: typeof summary['assertions_passed'] === 'number' ? summary['assertions_passed'] : totalPassed,
          assertions_failed: typeof summary['assertions_failed'] === 'number' ? summary['assertions_failed'] : totalFailed,
          total_layers: totalLayers,
          mandatory_layers_complete: checkMandatoryLayersComplete(layersExecuted),
        },
        correlation_id: run.correlation_id,
      },
      isLegacy: false,
    };
  }

  // Legacy fallback: synthesize canonical shape from available data
  const proofHash = deriveLegacyProofHash(run);
  const layerRecords = buildLegacyLayerRecords(run);
  const layersExecuted = layerRecords.map((lr) => lr.layer_name);

  const execution_metadata: ExecutionMetadata = {
    execution_id: run.run_id, // Use run_id as execution_id for legacy
    proof_hash: proofHash,
    layers_executed: layersExecuted,
    schema_version: SCHEMA_VERSION,
    environment: run.environment,
    started_at: run.started_at,
    completed_at: run.completed_at,
    duration_ms: run.duration_ms,
  };

  const executionProof: ExecutionProof = {
    proof_hash: proofHash,
    layerRecords,
    generated_at: run.completed_at,
  };

  const summary = run.result_summary ?? {};

  return {
    result: {
      run_id: run.run_id,
      scenario_id: run.scenario_id,
      environment: run.environment,
      status: run.status,
      execution_metadata,
      executionProof,
      result_summary: {
        assertions_passed: typeof summary['assertions_passed'] === 'number' ? summary['assertions_passed'] : 0,
        assertions_failed: typeof summary['assertions_failed'] === 'number' ? summary['assertions_failed'] : 0,
        total_layers: layerRecords.length,
        mandatory_layers_complete: false, // Legacy runs cannot confirm mandatory layers
      },
      correlation_id: run.correlation_id,
    },
    isLegacy: true,
  };
}
