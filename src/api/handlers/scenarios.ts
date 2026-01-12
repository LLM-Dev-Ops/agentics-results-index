/**
 * Scenario endpoint handlers
 *
 * Handles /scenarios endpoints for querying scenario history.
 * READ-ONLY: No execution or mutation operations.
 */

import { Request, Response, NextFunction } from 'express';
import {
  getScenarioById,
  listScenarios,
  getRunsByScenario,
} from '../../data/repository';
import { NotFoundError } from '../middleware/error-handler';
import {
  RunFilters,
  QueryOptions,
  SuccessResponse,
  Scenario,
  Run,
  Environment,
  RunStatus,
  SortableField,
  SortDirection,
} from '../../types';
import { getConfig } from '../../config';

interface ScenarioIdParams {
  id: string;
}

interface ScenarioRunsQueryParams {
  environment?: Environment;
  status?: RunStatus[];
  since?: string;
  before?: string;
  limit?: number;
  offset?: number;
  order?: { field: string; direction: 'ASC' | 'DESC' };
}

interface ListQueryParams {
  limit?: number;
  offset?: number;
}

/**
 * GET /api/v1/scenarios
 *
 * List all scenarios with their execution history summaries.
 */
export async function listScenariosHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const config = getConfig();
    const query = req.query as unknown as ListQueryParams;

    const options: QueryOptions = {
      limit: query.limit ?? config.query.defaultPageSize,
      offset: query.offset ?? 0,
    };

    const startTime = Date.now();
    const { scenarios, pagination } = await listScenarios(options);
    const queryTimeMs = Date.now() - startTime;

    const response: SuccessResponse<Scenario[]> = {
      data: scenarios,
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
 * GET /api/v1/scenarios/:id
 *
 * Get scenario details including execution history summary.
 */
export async function getScenarioByIdHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as ScenarioIdParams;

    const startTime = Date.now();
    const scenario = await getScenarioById(id);
    const queryTimeMs = Date.now() - startTime;

    if (!scenario) {
      throw new NotFoundError(`Scenario with ID '${id}' not found`);
    }

    const response: SuccessResponse<Scenario> = {
      data: scenario,
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
 * GET /api/v1/scenarios/:id/runs
 *
 * Get all runs for a specific scenario.
 */
export async function getScenarioRunsHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as unknown as ScenarioIdParams;
    const config = getConfig();
    const query = req.query as unknown as ScenarioRunsQueryParams;

    // First verify the scenario exists
    const scenario = await getScenarioById(id);
    if (!scenario) {
      throw new NotFoundError(`Scenario with ID '${id}' not found`);
    }

    const filters: Omit<RunFilters, 'scenario'> = {
      environment: query.environment,
      status: query.status,
      since: query.since ? new Date(query.since) : undefined,
      before: query.before ? new Date(query.before) : undefined,
    };

    const options: QueryOptions = {
      orderBy: (query.order?.field as SortableField) ?? 'completed_at',
      orderDirection: (query.order?.direction as SortDirection) ?? 'DESC',
      limit: query.limit ?? config.query.defaultPageSize,
      offset: query.offset ?? 0,
    };

    const startTime = Date.now();
    const { runs, pagination } = await getRunsByScenario(id, filters, options);
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
