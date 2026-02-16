/**
 * Run inspection endpoint handlers
 *
 * Handles all /runs endpoints for querying completed runs.
 * READ-ONLY: No execution or mutation operations.
 *
 * All single-run responses are transformed to canonical
 * SimulationExecutionResult contract shape before returning.
 */

import { Request, Response, NextFunction } from 'express';
import {
  listRuns,
  getRunById,
  getLastRun,
  getLatestRun,
  getArtifactsByRun,
  resolveRunById,
  QueryFailureError,
} from '../../data/repository';
import { NotFoundError } from '../middleware/error-handler';
import {
  RunFilters,
  QueryOptions,
  SuccessResponse,
  Run,
  ArtifactReference,
  Pagination,
  Environment,
  RunStatus,
  SortableField,
  SortDirection,
} from '../../types';

// Import from contracts ONLY
import type { SimulationExecutionResult } from '../../contracts';
import {
  transformToCanonicalResult,
  validateAgainstSchema,
  buildCLIError,
  logInspectDebug,
  logResultsIndexLookup,
  SCHEMA_VERSION,
} from '../../contracts';

// Type for validated query params
interface RunsQueryParams {
  environment?: Environment;
  status?: RunStatus[];
  scenario?: string;
  since?: string;
  before?: string;
  limit: number;
  offset: number;
  order: { field: string; direction: 'ASC' | 'DESC' };
}

interface LastRunQueryParams {
  environment: Environment;
  scenario?: string;
}

interface RunIdParams {
  id: string;
}

/**
 * Transform a Run to contract shape, validate, and log.
 * Returns the validated result or sends a structured error response.
 * NEVER throws — all errors are returned as values.
 */
function transformRunForResponse(
  run: Run,
  requestId: string
): { result: SimulationExecutionResult; error?: never } | { result?: never; error: ReturnType<typeof buildCLIError> } {
  const { result, isLegacy } = transformToCanonicalResult(run);

  // DEBUG logging — null-safe access
  logInspectDebug({
    execution_id: result.execution_metadata?.execution_id ?? run.run_id,
    schema_version: SCHEMA_VERSION,
    validation_status: isLegacy ? 'legacy_transformed' : 'valid',
    timestamp: new Date().toISOString(),
  });

  // Contract validation
  const failures = validateAgainstSchema('SimulationExecutionResult', result);
  if (failures) {
    logInspectDebug({
      execution_id: result.execution_metadata?.execution_id ?? run.run_id,
      schema_version: SCHEMA_VERSION,
      validation_status: 'invalid',
      timestamp: new Date().toISOString(),
    });
    return { error: buildCLIError(requestId, failures) };
  }

  return { result };
}

/**
 * Safely transform a single run, catching any unexpected errors.
 * Returns null (with a warning log) instead of throwing.
 */
function safeTransformRun(
  run: Run,
  requestId: string
): SimulationExecutionResult | null {
  try {
    const transformed = transformRunForResponse(run, requestId);
    if (transformed.error) {
      console.warn('[RESULTS_INDEX_TRANSFORM_SKIPPED]', {
        run_id: run.run_id,
        reason: transformed.error.message,
      });
      return null;
    }
    return transformed.result;
  } catch (err) {
    console.warn('[RESULTS_INDEX_TRANSFORM_SKIPPED]', {
      run_id: run.run_id,
      reason: err instanceof Error ? err.message : 'Unknown transform error',
    });
    return null;
  }
}

/**
 * GET /api/v1/runs
 *
 * List runs with optional filters and pagination.
 * Default order: newest first (completed_at DESC)
 * Returns canonical SimulationExecutionResult contract shape.
 */
export async function listRunsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as RunsQueryParams;

    const filters: RunFilters = {
      environment: query.environment,
      status: query.status,
      scenario: query.scenario,
      since: query.since ? new Date(query.since) : undefined,
      before: query.before ? new Date(query.before) : undefined,
    };

    const options: QueryOptions = {
      orderBy: query.order.field as SortableField,
      orderDirection: query.order.direction as SortDirection,
      limit: query.limit,
      offset: query.offset,
    };

    const startTime = Date.now();
    const { runs, pagination } = await listRuns(filters, options);
    const queryTimeMs = Date.now() - startTime;

    // Guard: empty result set
    if (!runs || runs.length === 0) {
      res.status(200).json({
        result_packet: {
          results: [],
          pagination,
          metadata: { queryTimeMs, requestId: req.requestId },
        },
      });
      return;
    }

    // Transform all runs — skip invalid rows instead of throwing
    const results = runs
      .map((run) => safeTransformRun(run, req.requestId))
      .filter((r): r is SimulationExecutionResult => r !== null);

    res.status(200).json({
      result_packet: {
        results,
        pagination,
        metadata: {
          queryTimeMs,
          requestId: req.requestId,
        },
      },
    });
  } catch (err) {
    if (err instanceof QueryFailureError) {
      console.error('[RESULTS_INDEX_QUERY_FAILURE]', {
        reason: err.message,
        requestId: req.requestId,
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Query execution failed',
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
    next(err);
  }
}

/**
 * GET /api/v1/runs/last
 *
 * Get the most recent run for an environment.
 * Optionally filter by scenario.
 * HARDENED: Never returns 500. Never throws. Never calls next(err).
 */
export async function getLastRunHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as LastRunQueryParams;

    const run = await getLastRun(query.environment, query.scenario);

    if (!run) {
      res.status(200).json({ result_packet: null, found: false, message: 'No runs indexed yet' });
      return;
    }

    const result = safeTransformRun(run, req.requestId);

    if (!result) {
      res.status(200).json({ result_packet: null, found: false, message: 'No runs indexed yet' });
      return;
    }

    res.status(200).json({
      result_packet: result,
      found: true,
    });
  } catch (err) {
    console.error('[RESULTS_INDEX_LAST_ERROR]', {
      error: err instanceof Error ? err.message : 'Unknown error',
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve last run',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * GET /api/v1/results/latest
 *
 * Get the most recently indexed run across all environments.
 * If no runs exist, returns { found: false, message: "No runs indexed yet" } with 200.
 * HARDENED: Never returns 500. Never throws. Never calls next(err).
 */
export async function getLatestRunHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const run = await getLatestRun();

    if (!run) {
      res.status(200).json({ found: false, message: 'No runs indexed yet' });
      return;
    }

    const result = safeTransformRun(run, req.requestId);

    if (!result) {
      res.status(200).json({ found: false, message: 'No runs indexed yet' });
      return;
    }

    res.status(200).json({
      data: result,
      metadata: { requestId: req.requestId },
    });
  } catch (err) {
    console.error('[RESULTS_INDEX_LATEST_ERROR]', {
      error: err instanceof Error ? err.message : 'Unknown error',
      requestId: req.requestId,
    });
    res.status(200).json({ found: false, message: 'No runs indexed yet' });
  }
}

/**
 * GET /api/v1/runs/:id
 *
 * Get a single run by its ID.
 * Supports ADR-004 dual resolution:
 *   exec-* → lookup by execution_id (canonical)
 *   sim-*  → lookup by simulation_id, with reverse-lookup fallback
 *   UUID   → lookup by run_id (legacy)
 *
 * HARDENED: Never returns 500. Returns 404 only for explicit not-found.
 */
export async function getRunByIdHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as RunIdParams;

    const resolved = await resolveRunById(id);

    // Structured lookup log per ADR-004
    logResultsIndexLookup({
      input_id: id,
      resolved_execution_id: resolved?.resolvedExecutionId ?? null,
      lookup_mode: id.startsWith('sim-') ? 'simulation' : 'execution',
    });

    if (!resolved) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Run with ID '${id}' not found`, requestId: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const result = safeTransformRun(resolved.run, req.requestId);

    if (!result) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Run '${id}' could not be transformed`, requestId: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    res.status(200).json({
      data: result,
      metadata: { requestId: req.requestId },
    });
  } catch (err) {
    console.error('[RESULTS_INDEX_RESOLVE_ERROR]', {
      error: err instanceof Error ? err.message : 'Unknown error',
      id: req.params['id'],
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to resolve run',
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * GET /api/v1/runs/:id/artifacts
 *
 * Get artifact references for a run.
 * Supports ADR-004 dual resolution for the run ID.
 * Returns URLs only - does not fetch artifact content.
 */
export async function getRunArtifactsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as RunIdParams;

    // Resolve via ADR-004 dual resolution
    const resolved = await resolveRunById(id);
    if (!resolved) {
      throw new NotFoundError(`Run with ID '${id}' not found`);
    }

    const startTime = Date.now();
    // Artifacts are always keyed by run_id (the DB primary key)
    const artifacts = await getArtifactsByRun(resolved.run.run_id);
    const queryTimeMs = Date.now() - startTime;

    const response: SuccessResponse<ArtifactReference[]> = {
      data: artifacts,
      metadata: {
        queryTimeMs,
        requestId: req.requestId,
      },
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
