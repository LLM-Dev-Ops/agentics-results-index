/**
 * Data repository - read-only access to Ruvector views
 *
 * This layer transforms raw database rows into domain objects.
 * No business logic - only data access and mapping.
 */

import { executeReadOnlyQuery } from './pool';
import {
  buildRunsListQuery,
  buildRunsCountQuery,
  buildRunByIdQuery,
  buildRunByExecutionIdQuery,
  buildRunBySimulationIdQuery,
  buildRunBySimulationIdReverseLookupQuery,
  buildLastRunQuery,
  buildEnvironmentSummaryQuery,
  buildScenarioHistoryQuery,
  buildScenariosListQuery,
  buildRunsByScenarioQuery,
  buildArtifactsByRunQuery,
} from '../query/builder';
import {
  Run,
  Scenario,
  EnvironmentSummary,
  ArtifactReference,
  RunFilters,
  QueryOptions,
  Pagination,
  Environment,
  SummaryPeriod,
} from '../types';

// Database row types (internal, not exported)
interface RunRow {
  run_id: string;
  scenario_id: string;
  environment: string;
  status: string;
  started_at: Date;
  completed_at: Date;
  duration_ms: number;
  result_summary: Record<string, unknown> | null;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface ScenarioRow {
  scenario_id: string;
  scenario_name: string;
  total_runs: string; // COUNT returns string in pg
  successful_runs: string;
  failed_runs: string;
  last_run_at: Date | null;
  avg_duration_ms: string | null;
}

interface SummaryRow {
  total_runs: string;
  successful: string;
  failed: string;
  avg_duration_ms: string | null;
  last_run_at: Date | null;
}

interface ArtifactRow {
  artifact_id: string;
  run_id: string;
  artifact_type: string;
  artifact_name: string;
  storage_url: string;
  size_bytes: string;
  created_at: Date;
}

interface CountRow {
  total: string;
}

/**
 * Map database row to Run domain object
 */
function mapRowToRun(row: RunRow): Run {
  return {
    run_id: row.run_id,
    scenario_id: row.scenario_id,
    environment: row.environment as Environment,
    status: row.status as Run['status'],
    started_at: row.started_at.toISOString(),
    completed_at: row.completed_at.toISOString(),
    duration_ms: row.duration_ms,
    result_summary: row.result_summary,
    correlation_id: row.correlation_id,
    metadata: row.metadata,
  };
}

/**
 * Map database row to Scenario domain object
 */
function mapRowToScenario(row: ScenarioRow): Scenario {
  return {
    scenario_id: row.scenario_id,
    scenario_name: row.scenario_name,
    total_runs: parseInt(row.total_runs, 10),
    successful_runs: parseInt(row.successful_runs, 10),
    failed_runs: parseInt(row.failed_runs, 10),
    last_run_at: row.last_run_at?.toISOString() ?? null,
    avg_duration_ms: row.avg_duration_ms ? parseFloat(row.avg_duration_ms) : null,
  };
}

/**
 * Map database row to ArtifactReference domain object
 */
function mapRowToArtifact(row: ArtifactRow): ArtifactReference {
  return {
    artifact_id: row.artifact_id,
    run_id: row.run_id,
    artifact_type: row.artifact_type,
    artifact_name: row.artifact_name,
    storage_url: row.storage_url,
    size_bytes: parseInt(row.size_bytes, 10),
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Calculate time range for summary period
 */
function getPeriodSince(period: SummaryPeriod): Date {
  const now = new Date();
  switch (period) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Custom error for query failures — caught by handlers to return 200 not 500.
 */
export class QueryFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryFailureError';
  }
}

/**
 * List runs with filters and pagination.
 * Wraps query execution so NULL metadata rows never crash.
 */
export async function listRuns(
  filters: RunFilters,
  options: QueryOptions
): Promise<{ runs: Run[]; pagination: Pagination }> {
  try {
    // Execute count query for total
    const countQuery = buildRunsCountQuery(filters);
    const countResult = await executeReadOnlyQuery<CountRow>(countQuery.sql, countQuery.params);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Execute list query
    const listQuery = buildRunsListQuery(filters, options);
    const listResult = await executeReadOnlyQuery<RunRow>(listQuery.sql, listQuery.params);

    return {
      runs: listResult.rows.map(mapRowToRun),
      pagination: {
        offset: options.offset,
        limit: options.limit,
        total,
      },
    };
  } catch (err) {
    console.error('[RESULTS_INDEX_QUERY_ERROR]', {
      operation: 'listRuns',
      message: err instanceof Error ? err.message : 'Unknown query error',
    });
    throw new QueryFailureError('QueryFailure');
  }
}

/**
 * Get a single run by ID
 */
export async function getRunById(runId: string): Promise<Run | null> {
  const query = buildRunByIdQuery(runId);
  const result = await executeReadOnlyQuery<RunRow>(query.sql, query.params);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRun(result.rows[0]!);
}

/**
 * Look up a run by execution_id (stored in metadata JSONB).
 * Per ADR-004: execution_id is the canonical primary index.
 */
export async function getRunByExecutionId(executionId: string): Promise<Run | null> {
  const query = buildRunByExecutionIdQuery(executionId);
  const result = await executeReadOnlyQuery<RunRow>(query.sql, query.params);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRun(result.rows[0]!);
}

/**
 * Look up a run by simulation_id (stored in metadata JSONB or as run_id).
 */
export async function getRunBySimulationId(simulationId: string): Promise<Run | null> {
  const query = buildRunBySimulationIdQuery(simulationId);
  const result = await executeReadOnlyQuery<RunRow>(query.sql, query.params);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRun(result.rows[0]!);
}

/**
 * Reverse lookup: find a run whose execution_id mapping references
 * the given simulation_id.
 */
export async function getRunBySimulationIdReverse(simulationId: string): Promise<Run | null> {
  const query = buildRunBySimulationIdReverseLookupQuery(simulationId);
  const result = await executeReadOnlyQuery<RunRow>(query.sql, query.params);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRun(result.rows[0]!);
}

export type LookupMode = 'execution' | 'simulation';

export interface ResolvedRun {
  run: Run;
  lookupMode: LookupMode;
  resolvedExecutionId: string;
}

/**
 * Dual resolution per ADR-004:
 *
 *   exec-* → lookup by execution_id (canonical)
 *   sim-*  → lookup by simulation_id, reverse-lookup fallback
 *   UUID   → lookup by run_id (legacy)
 */
export async function resolveRunById(id: string): Promise<ResolvedRun | null> {
  if (id.startsWith('exec-')) {
    const run = await getRunByExecutionId(id);
    if (!run) return null;
    const resolvedExecutionId = (run.metadata?.['execution_id'] as string) ?? run.run_id;
    return { run, lookupMode: 'execution', resolvedExecutionId };
  }

  if (id.startsWith('sim-')) {
    // Primary: direct simulation_id lookup
    let run = await getRunBySimulationId(id);
    if (run) {
      const resolvedExecutionId = (run.metadata?.['execution_id'] as string) ?? run.run_id;
      return { run, lookupMode: 'simulation', resolvedExecutionId };
    }

    // Fallback: reverse lookup via execution_id mapping
    run = await getRunBySimulationIdReverse(id);
    if (run) {
      const resolvedExecutionId = (run.metadata?.['execution_id'] as string) ?? run.run_id;
      return { run, lookupMode: 'simulation', resolvedExecutionId };
    }

    return null;
  }

  // Legacy UUID path
  const run = await getRunById(id);
  if (!run) return null;
  const resolvedExecutionId = (run.metadata?.['execution_id'] as string) ?? run.run_id;
  return { run, lookupMode: 'execution', resolvedExecutionId };
}

/**
 * Get the most recent run for an environment
 */
export async function getLastRun(
  environment: Environment,
  scenario?: string
): Promise<Run | null> {
  try {
    const query = buildLastRunQuery(environment, scenario);
    const result = await executeReadOnlyQuery<RunRow>(query.sql, query.params);

    if (result.rows.length === 0) {
      return null;
    }

    return mapRowToRun(result.rows[0]!);
  } catch (err) {
    console.error('[RESULTS_INDEX_QUERY_ERROR]', {
      operation: 'getLastRun',
      message: err instanceof Error ? err.message : 'Unknown query error',
    });
    throw new QueryFailureError('QueryFailure');
  }
}

/**
 * Get environment summary statistics
 */
export async function getEnvironmentSummary(
  environment: Environment,
  period: SummaryPeriod
): Promise<EnvironmentSummary> {
  const since = getPeriodSince(period);
  const query = buildEnvironmentSummaryQuery(environment, since);
  const result = await executeReadOnlyQuery<SummaryRow>(query.sql, query.params);

  const row = result.rows[0];
  if (!row) {
    // Return empty summary if no data
    return {
      environment,
      period: {
        since: since.toISOString(),
        until: new Date().toISOString(),
      },
      total_runs: 0,
      successful: 0,
      failed: 0,
      success_rate: 0,
      avg_duration_ms: null,
      last_run_at: null,
    };
  }

  const totalRuns = parseInt(row.total_runs, 10);
  const successful = parseInt(row.successful, 10);
  const failed = parseInt(row.failed, 10);

  return {
    environment,
    period: {
      since: since.toISOString(),
      until: new Date().toISOString(),
    },
    total_runs: totalRuns,
    successful,
    failed,
    success_rate: totalRuns > 0 ? successful / totalRuns : 0,
    avg_duration_ms: row.avg_duration_ms ? parseFloat(row.avg_duration_ms) : null,
    last_run_at: row.last_run_at?.toISOString() ?? null,
  };
}

/**
 * Get scenario by ID
 */
export async function getScenarioById(scenarioId: string): Promise<Scenario | null> {
  const query = buildScenarioHistoryQuery(scenarioId);
  const result = await executeReadOnlyQuery<ScenarioRow>(query.sql, query.params);

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToScenario(result.rows[0]!);
}

/**
 * List scenarios with pagination
 */
export async function listScenarios(
  options: QueryOptions
): Promise<{ scenarios: Scenario[]; pagination: Pagination }> {
  const query = buildScenariosListQuery(options);
  const result = await executeReadOnlyQuery<ScenarioRow>(query.sql, query.params);

  // For simplicity, we don't count total scenarios (would need another query)
  // The pagination total is an estimate based on returned rows
  return {
    scenarios: result.rows.map(mapRowToScenario),
    pagination: {
      offset: options.offset,
      limit: options.limit,
      total: result.rows.length + options.offset, // Approximate
    },
  };
}

/**
 * Get runs for a specific scenario
 */
export async function getRunsByScenario(
  scenarioId: string,
  filters: Omit<RunFilters, 'scenario'>,
  options: QueryOptions
): Promise<{ runs: Run[]; pagination: Pagination }> {
  try {
    // Count query
    const countQuery = buildRunsCountQuery({ ...filters, scenario: scenarioId });
    const countResult = await executeReadOnlyQuery<CountRow>(countQuery.sql, countQuery.params);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // List query
    const listQuery = buildRunsByScenarioQuery(scenarioId, filters, options);
    const listResult = await executeReadOnlyQuery<RunRow>(listQuery.sql, listQuery.params);

    return {
      runs: listResult.rows.map(mapRowToRun),
      pagination: {
        offset: options.offset,
        limit: options.limit,
        total,
      },
    };
  } catch (err) {
    console.error('[RESULTS_INDEX_QUERY_ERROR]', {
      operation: 'getRunsByScenario',
      message: err instanceof Error ? err.message : 'Unknown query error',
    });
    throw new QueryFailureError('QueryFailure');
  }
}

/**
 * Get artifact references for a run
 */
export async function getArtifactsByRun(runId: string): Promise<ArtifactReference[]> {
  const query = buildArtifactsByRunQuery(runId);
  const result = await executeReadOnlyQuery<ArtifactRow>(query.sql, query.params);

  return result.rows.map(mapRowToArtifact);
}
