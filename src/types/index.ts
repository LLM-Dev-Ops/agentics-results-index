/**
 * Domain types for agentics-results-index
 * Read-only query service - no mutation types defined
 */

// Valid run completion statuses (excludes 'running' per SPARC spec)
export const VALID_STATUSES = ['completed', 'failed', 'cancelled', 'timeout'] as const;
export type RunStatus = (typeof VALID_STATUSES)[number];

// Valid environments
export const VALID_ENVIRONMENTS = ['production', 'staging', 'development', 'local'] as const;
export type Environment = (typeof VALID_ENVIRONMENTS)[number];

// Valid time periods for summaries
export const VALID_PERIODS = ['24h', '7d', '30d'] as const;
export type SummaryPeriod = (typeof VALID_PERIODS)[number];

// Valid sort directions
export type SortDirection = 'ASC' | 'DESC';

// Sortable fields (allowlist per SPARC spec)
export const SORTABLE_FIELDS = ['completed_at', 'started_at', 'duration_ms'] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

/**
 * Run domain model - represents a completed simulation run
 */
export interface Run {
  run_id: string;
  scenario_id: string;
  environment: Environment;
  status: RunStatus;
  created_at: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  result_summary: ResultSummary | null;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Result summary embedded in runs
 */
export interface ResultSummary {
  assertions_passed?: number;
  assertions_failed?: number;
  [key: string]: unknown;
}

/**
 * Scenario domain model
 */
export interface Scenario {
  scenario_id: string;
  scenario_name: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run_at: string | null;
  avg_duration_ms: number | null;
}

/**
 * Environment summary for dashboards
 */
export interface EnvironmentSummary {
  environment: Environment;
  period: {
    since: string;
    until: string;
  };
  total_runs: number;
  successful: number;
  failed: number;
  success_rate: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
}

/**
 * Artifact reference (URLs only, no fetching per SPARC spec)
 */
export interface ArtifactReference {
  artifact_id: string;
  run_id: string;
  artifact_type: string;
  artifact_name: string;
  storage_url: string;
  size_bytes: number;
  created_at: string;
}

/**
 * Pagination metadata
 */
export interface Pagination {
  offset: number;
  limit: number;
  total: number;
}

/**
 * Query filters for runs
 */
export interface RunFilters {
  environment?: Environment;
  status?: RunStatus[];
  scenario?: string;
  since?: Date;
  before?: Date;
}

/**
 * Query options (ordering, pagination)
 */
export interface QueryOptions {
  orderBy?: SortableField;
  orderDirection?: SortDirection;
  limit: number;
  offset: number;
}

/**
 * API response envelope for success
 */
export interface SuccessResponse<T> {
  data: T;
  pagination?: Pagination;
  metadata?: {
    queryTimeMs: number;
    requestId: string;
  };
}

/**
 * Error detail for validation errors
 */
export interface ErrorDetail {
  field: string;
  issue: string;
  allowed?: readonly string[];
}

/**
 * API error codes (per SPARC spec)
 */
export const ERROR_CODES = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * API error response envelope
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    requestId: string;
    timestamp: string;
  };
}

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: 'ok' | 'error';
    eventBus?: 'ok' | 'error';
  };
  eventSubscriptions?: Record<string, string[]>;
}
