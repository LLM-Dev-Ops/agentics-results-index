/**
 * Query builder for constructing safe, parameterized SELECT queries
 *
 * CRITICAL: This builder ONLY generates SELECT statements.
 * All values are parameterized to prevent SQL injection.
 */

import {
  RunFilters,
  QueryOptions,
  SortableField,
  SortDirection,
  SORTABLE_FIELDS,
  VALID_STATUSES,
  RunStatus,
} from '../types';

// View names (owned by Ruvector, consumed read-only by this service)
export const VIEWS = {
  COMPLETED_RUNS: 'v_completed_runs',
  SCENARIO_HISTORY: 'v_scenario_history',
  ENVIRONMENT_SUMMARY: 'v_environment_summary',
  ARTIFACT_REFERENCES: 'v_artifact_references',
} as const;

// Columns for v_completed_runs
const RUN_COLUMNS = [
  'run_id',
  'scenario_id',
  'environment',
  'status',
  'started_at',
  'completed_at',
  'duration_ms',
  'result_summary',
  'correlation_id',
  'metadata',
] as const;

interface QueryParts {
  select: string;
  from: string;
  where: string[];
  params: unknown[];
  orderBy: string | null;
  limit: number | null;
  offset: number | null;
}

/**
 * Build query for listing runs with filters
 */
export function buildRunsListQuery(
  filters: RunFilters,
  options: QueryOptions
): { sql: string; params: unknown[] } {
  const parts: QueryParts = {
    select: RUN_COLUMNS.join(', '),
    from: VIEWS.COMPLETED_RUNS,
    where: [],
    params: [],
    orderBy: null,
    limit: null,
    offset: null,
  };

  let paramIndex = 1;

  // Environment filter
  if (filters.environment) {
    parts.where.push(`environment = $${paramIndex}`);
    parts.params.push(filters.environment);
    paramIndex++;
  }

  // Status filter (supports multiple statuses)
  if (filters.status && filters.status.length > 0) {
    // Validate all statuses
    for (const s of filters.status) {
      if (!VALID_STATUSES.includes(s as RunStatus)) {
        throw new Error(`Invalid status: ${s}`);
      }
    }
    const placeholders = filters.status.map((_, i) => `$${paramIndex + i}`).join(', ');
    parts.where.push(`status IN (${placeholders})`);
    parts.params.push(...filters.status);
    paramIndex += filters.status.length;
  }

  // Scenario filter (supports wildcards with *)
  if (filters.scenario) {
    if (filters.scenario.includes('*')) {
      // Convert * to SQL LIKE pattern
      const pattern = filters.scenario.replace(/\*/g, '%');
      parts.where.push(`scenario_id LIKE $${paramIndex}`);
      parts.params.push(pattern);
    } else {
      parts.where.push(`scenario_id = $${paramIndex}`);
      parts.params.push(filters.scenario);
    }
    paramIndex++;
  }

  // Time filters
  if (filters.since) {
    parts.where.push(`completed_at >= $${paramIndex}`);
    parts.params.push(filters.since.toISOString());
    paramIndex++;
  }

  if (filters.before) {
    parts.where.push(`completed_at <= $${paramIndex}`);
    parts.params.push(filters.before.toISOString());
    paramIndex++;
  }

  // Ordering (validate field is in allowlist)
  const orderField = options.orderBy ?? 'completed_at';
  if (!SORTABLE_FIELDS.includes(orderField as SortableField)) {
    throw new Error(`Invalid sort field: ${orderField}`);
  }
  const orderDir = options.orderDirection ?? 'DESC';
  parts.orderBy = `${orderField} ${orderDir}`;

  // Pagination
  parts.limit = options.limit;
  parts.offset = options.offset;

  // Build SQL
  let sql = `SELECT ${parts.select} FROM ${parts.from}`;

  if (parts.where.length > 0) {
    sql += ` WHERE ${parts.where.join(' AND ')}`;
  }

  if (parts.orderBy) {
    sql += ` ORDER BY ${parts.orderBy}`;
  }

  if (parts.limit !== null) {
    sql += ` LIMIT ${parts.limit}`;
  }

  if (parts.offset !== null && parts.offset > 0) {
    sql += ` OFFSET ${parts.offset}`;
  }

  return { sql, params: parts.params };
}

/**
 * Build query for counting runs (for pagination total)
 */
export function buildRunsCountQuery(
  filters: RunFilters
): { sql: string; params: unknown[] } {
  const parts: QueryParts = {
    select: 'COUNT(*) as total',
    from: VIEWS.COMPLETED_RUNS,
    where: [],
    params: [],
    orderBy: null,
    limit: null,
    offset: null,
  };

  let paramIndex = 1;

  if (filters.environment) {
    parts.where.push(`environment = $${paramIndex}`);
    parts.params.push(filters.environment);
    paramIndex++;
  }

  if (filters.status && filters.status.length > 0) {
    const placeholders = filters.status.map((_, i) => `$${paramIndex + i}`).join(', ');
    parts.where.push(`status IN (${placeholders})`);
    parts.params.push(...filters.status);
    paramIndex += filters.status.length;
  }

  if (filters.scenario) {
    if (filters.scenario.includes('*')) {
      const pattern = filters.scenario.replace(/\*/g, '%');
      parts.where.push(`scenario_id LIKE $${paramIndex}`);
      parts.params.push(pattern);
    } else {
      parts.where.push(`scenario_id = $${paramIndex}`);
      parts.params.push(filters.scenario);
    }
    paramIndex++;
  }

  if (filters.since) {
    parts.where.push(`completed_at >= $${paramIndex}`);
    parts.params.push(filters.since.toISOString());
    paramIndex++;
  }

  if (filters.before) {
    parts.where.push(`completed_at <= $${paramIndex}`);
    parts.params.push(filters.before.toISOString());
    paramIndex++;
  }

  let sql = `SELECT ${parts.select} FROM ${parts.from}`;

  if (parts.where.length > 0) {
    sql += ` WHERE ${parts.where.join(' AND ')}`;
  }

  return { sql, params: parts.params };
}

/**
 * Build query for getting a single run by ID
 */
export function buildRunByIdQuery(runId: string): { sql: string; params: unknown[] } {
  const sql = `SELECT ${RUN_COLUMNS.join(', ')} FROM ${VIEWS.COMPLETED_RUNS} WHERE run_id = $1`;
  return { sql, params: [runId] };
}

/**
 * Build query for looking up a run by execution_id in metadata JSONB.
 * Per ADR-004: execution_id is the canonical primary index.
 */
export function buildRunByExecutionIdQuery(executionId: string): { sql: string; params: unknown[] } {
  const sql = `SELECT ${RUN_COLUMNS.join(', ')} FROM ${VIEWS.COMPLETED_RUNS} WHERE metadata->>'execution_id' = $1 ORDER BY completed_at DESC LIMIT 1`;
  return { sql, params: [executionId] };
}

/**
 * Build query for looking up a run by simulation_id in metadata JSONB.
 * Falls back to matching run_id if simulation_id is not explicitly stored.
 */
export function buildRunBySimulationIdQuery(simulationId: string): { sql: string; params: unknown[] } {
  const sql = `SELECT ${RUN_COLUMNS.join(', ')} FROM ${VIEWS.COMPLETED_RUNS} WHERE metadata->>'simulation_id' = $1 OR run_id = $1 ORDER BY completed_at DESC LIMIT 1`;
  return { sql, params: [simulationId] };
}

/**
 * Build reverse-lookup query: given a simulation_id, find a run whose
 * execution_id metadata maps back to it.
 */
export function buildRunBySimulationIdReverseLookupQuery(simulationId: string): { sql: string; params: unknown[] } {
  const sql = `SELECT ${RUN_COLUMNS.join(', ')} FROM ${VIEWS.COMPLETED_RUNS} WHERE metadata->>'simulation_id' = $1 OR metadata->>'execution_id' = $1 ORDER BY completed_at DESC LIMIT 1`;
  return { sql, params: [simulationId] };
}

/**
 * Build query for getting the most recent run
 */
export function buildLastRunQuery(
  environment: string,
  scenario?: string
): { sql: string; params: unknown[] } {
  const params: unknown[] = [environment];
  let sql = `SELECT ${RUN_COLUMNS.join(', ')} FROM ${VIEWS.COMPLETED_RUNS} WHERE environment = $1`;

  if (scenario) {
    sql += ` AND scenario_id = $2`;
    params.push(scenario);
  }

  sql += ` ORDER BY completed_at DESC LIMIT 1`;

  return { sql, params };
}

/**
 * Build query for environment summary statistics
 */
export function buildEnvironmentSummaryQuery(
  environment: string,
  since: Date
): { sql: string; params: unknown[] } {
  const sql = `
    SELECT
      COUNT(*) as total_runs,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
      AVG(duration_ms) as avg_duration_ms,
      MAX(completed_at) as last_run_at
    FROM ${VIEWS.COMPLETED_RUNS}
    WHERE environment = $1 AND completed_at >= $2
  `;

  return { sql, params: [environment, since.toISOString()] };
}

/**
 * Build query for scenario history
 */
export function buildScenarioHistoryQuery(
  scenarioId: string
): { sql: string; params: unknown[] } {
  const sql = `
    SELECT
      scenario_id,
      scenario_name,
      total_runs,
      successful_runs,
      failed_runs,
      last_run_at,
      avg_duration_ms
    FROM ${VIEWS.SCENARIO_HISTORY}
    WHERE scenario_id = $1
  `;

  return { sql, params: [scenarioId] };
}

/**
 * Build query for listing scenarios
 */
export function buildScenariosListQuery(
  options: QueryOptions
): { sql: string; params: unknown[] } {
  const sql = `
    SELECT
      scenario_id,
      scenario_name,
      total_runs,
      successful_runs,
      failed_runs,
      last_run_at,
      avg_duration_ms
    FROM ${VIEWS.SCENARIO_HISTORY}
    ORDER BY last_run_at DESC NULLS LAST
    LIMIT ${options.limit} OFFSET ${options.offset}
  `;

  return { sql, params: [] };
}

/**
 * Build query for runs by scenario
 */
export function buildRunsByScenarioQuery(
  scenarioId: string,
  filters: Omit<RunFilters, 'scenario'>,
  options: QueryOptions
): { sql: string; params: unknown[] } {
  // Reuse the standard runs list query with scenario pre-set
  return buildRunsListQuery({ ...filters, scenario: scenarioId }, options);
}

/**
 * Build query for artifact references by run
 */
export function buildArtifactsByRunQuery(
  runId: string
): { sql: string; params: unknown[] } {
  const sql = `
    SELECT
      artifact_id,
      run_id,
      artifact_type,
      artifact_name,
      storage_url,
      size_bytes,
      created_at
    FROM ${VIEWS.ARTIFACT_REFERENCES}
    WHERE run_id = $1
    ORDER BY created_at ASC
  `;

  return { sql, params: [runId] };
}
