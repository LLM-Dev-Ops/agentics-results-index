'use strict';

const { z } = require('zod');

const SCHEMA_VERSION = '1.0.0';

const MANDATORY_LAYERS = Object.freeze([
  'specification',
  'pseudocode',
  'architecture',
  'refinement',
  'completion',
]);

const LayerRecordSchema = z.object({
  layer_name: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  duration_ms: z.number().nonnegative(),
  assertions_passed: z.number().int().nonnegative(),
  assertions_failed: z.number().int().nonnegative(),
  error: z.string().optional(),
});

const ExecutionProofSchema = z.object({
  proof_hash: z.string().min(1),
  layerRecords: z.array(LayerRecordSchema),
  generated_at: z.string().min(1),
});

const ExecutionMetadataSchema = z.object({
  execution_id: z.string().min(1),
  proof_hash: z.string().min(1),
  layers_executed: z.array(z.string()),
  schema_version: z.string().min(1),
  environment: z.string().min(1),
  started_at: z.string().min(1),
  completed_at: z.string().min(1),
  duration_ms: z.number().nonnegative(),
});

const SimulationResultSummarySchema = z.object({
  assertions_passed: z.number().int().nonnegative(),
  assertions_failed: z.number().int().nonnegative(),
  total_layers: z.number().int().nonnegative(),
  mandatory_layers_complete: z.boolean(),
}).passthrough();

const ExecutionContextSchema = z.object({
  repo_name: z.string().min(1),
  environment: z.string().min(1),
  triggered_by: z.string().optional(),
  branch: z.string().optional(),
  commit_sha: z.string().optional(),
});

const ResultPacketSchema = z.object({
  run_id: z.string().min(1),
  scenario_id: z.string().min(1),
  execution_id: z.string().min(1),
  simulation_id: z.string().min(1),
  parent_span_id: z.string().min(1),
  simulation_resolution: z.string().min(1),
  repo_name: z.string().min(1),
  environment: z.string().min(1),
  status: z.string().min(1),
  execution_metadata: ExecutionMetadataSchema,
  executionProof: ExecutionProofSchema,
  execution_context: ExecutionContextSchema.optional(),
  result_summary: SimulationResultSummarySchema,
  correlation_id: z.string().nullable(),
  timestamps: z.object({
    started_at: z.string().min(1),
    completed_at: z.string().min(1),
    duration_ms: z.number().nonnegative(),
  }).optional(),
});

const SimulationExecutionResultSchema = z.object({
  run_id: z.string().min(1),
  scenario_id: z.string().min(1),
  execution_id: z.string().min(1),
  simulation_id: z.string().min(1),
  environment: z.string().min(1),
  status: z.string().min(1),
  created_at: z.string().min(1),
  execution_metadata: ExecutionMetadataSchema,
  executionProof: ExecutionProofSchema,
  result_summary: SimulationResultSummarySchema,
  correlation_id: z.string().nullable(),
});

module.exports = {
  SCHEMA_VERSION,
  MANDATORY_LAYERS,
  LayerRecordSchema,
  ExecutionProofSchema,
  ExecutionMetadataSchema,
  SimulationResultSummarySchema,
  ExecutionContextSchema,
  ResultPacketSchema,
  SimulationExecutionResultSchema,
};
