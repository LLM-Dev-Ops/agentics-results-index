/**
 * Run inspection endpoint handlers
 *
 * Handles all /runs endpoints for querying completed runs.
 * READ-ONLY: No execution or mutation operations.
 */

import { Request, Response, NextFunction } from 'express';
import {
  listRuns,
  getRunById,
  getLastRun,
  getArtifactsByRun,
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
 * GET /api/v1/runs
 *
 * List runs with optional filters and pagination.
 * Default order: newest first (completed_at DESC)
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

    const response: SuccessResponse<Run[]> = {
      data: runs,
      pagination,
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

/**
 * GET /api/v1/runs/last
 *
 * Get the most recent run for an environment.
 * Optionally filter by scenario.
 */
export async function getLastRunHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as LastRunQueryParams;

    const startTime = Date.now();
    const run = await getLastRun(query.environment, query.scenario);
    const queryTimeMs = Date.now() - startTime;

    if (!run) {
      const scenarioMsg = query.scenario ? ` and scenario '${query.scenario}'` : '';
      throw new NotFoundError(
        `No completed runs found for environment '${query.environment}'${scenarioMsg}`
      );
    }

    const response: SuccessResponse<Run> = {
      data: run,
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

/**
 * GET /api/v1/runs/:id
 *
 * Get a single run by its ID.
 */
export async function getRunByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as RunIdParams;

    const startTime = Date.now();
    const run = await getRunById(id);
    const queryTimeMs = Date.now() - startTime;

    if (!run) {
      throw new NotFoundError(`Run with ID '${id}' not found`);
    }

    const response: SuccessResponse<Run> = {
      data: run,
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

/**
 * GET /api/v1/runs/:id/artifacts
 *
 * Get artifact references for a run.
 * Returns URLs only - does not fetch artifact content.
 */
export async function getRunArtifactsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as RunIdParams;

    // First verify the run exists
    const run = await getRunById(id);
    if (!run) {
      throw new NotFoundError(`Run with ID '${id}' not found`);
    }

    const startTime = Date.now();
    const artifacts = await getArtifactsByRun(id);
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
