import { ZodType } from 'zod';

export declare const SCHEMA_VERSION: '1.0.0';
export declare const MANDATORY_LAYERS: readonly ['specification', 'pseudocode', 'architecture', 'refinement', 'completion'];
export type MandatoryLayer = (typeof MANDATORY_LAYERS)[number];

export interface LayerRecord {
  layer_name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  assertions_passed: number;
  assertions_failed: number;
  error?: string;
}

export interface ExecutionProof {
  proof_hash: string;
  layerRecords: LayerRecord[];
  generated_at: string;
}

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

export interface SimulationResultSummary {
  assertions_passed: number;
  assertions_failed: number;
  total_layers: number;
  mandatory_layers_complete: boolean;
  [key: string]: unknown;
}

export interface ExecutionContext {
  repo_name: string;
  environment: string;
  triggered_by?: string;
  branch?: string;
  commit_sha?: string;
}

export interface ResultPacket {
  run_id: string;
  scenario_id: string;
  execution_id: string;
  simulation_id: string;
  parent_span_id: string;
  simulation_resolution: string;
  repo_name: string;
  environment: string;
  status: string;
  execution_metadata: ExecutionMetadata;
  executionProof: ExecutionProof;
  execution_context?: ExecutionContext;
  result_summary: SimulationResultSummary;
  correlation_id: string | null;
  timestamps?: {
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
}

export interface SimulationExecutionResult {
  run_id: string;
  scenario_id: string;
  execution_id: string;
  simulation_id: string;
  environment: string;
  status: string;
  execution_metadata: ExecutionMetadata;
  executionProof: ExecutionProof;
  result_summary: SimulationResultSummary;
  correlation_id: string | null;
}

export declare const LayerRecordSchema: ZodType<LayerRecord>;
export declare const ExecutionProofSchema: ZodType<ExecutionProof>;
export declare const ExecutionMetadataSchema: ZodType<ExecutionMetadata>;
export declare const SimulationResultSummarySchema: ZodType<SimulationResultSummary>;
export declare const ExecutionContextSchema: ZodType<ExecutionContext>;
export declare const ResultPacketSchema: ZodType<ResultPacket>;
export declare const SimulationExecutionResultSchema: ZodType<SimulationExecutionResult>;
