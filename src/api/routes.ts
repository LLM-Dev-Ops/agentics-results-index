/**
 * API route definitions
 *
 * CRITICAL: All routes are GET-only per SPARC specification.
 * Non-GET methods return 405 Method Not Allowed.
 */

import { Router, Request, Response, NextFunction } from 'express';

// Handlers
import { getHealth } from './handlers/health';
import {
  listRunsHandler,
  getLastRunHandler,
  getLatestRunHandler,
  getRunByIdHandler,
  getRunArtifactsHandler,
} from './handlers/runs';
import { ingestResultHandler } from './handlers/ingest';
import {
  listScenariosHandler,
  getScenarioByIdHandler,
  getScenarioRunsHandler,
} from './handlers/scenarios';
import { getSummaryHandler } from './handlers/summary';

// Middleware
import {
  validateQuery,
  validateParams,
  runsQuerySchema,
  lastRunQuerySchema,
  summaryQuerySchema,
  runIdParamSchema,
  scenarioIdParamSchema,
} from './middleware/validation';
import { methodNotAllowedHandler } from './middleware/error-handler';

/**
 * Create the API router with all routes
 */
export function createApiRouter(): Router {
  const router = Router();

  // =========================================================================
  // Health Check
  // =========================================================================

  router.get('/health', getHealth);
  router.all('/health', methodNotAllowedHandler);

  // =========================================================================
  // Runs Endpoints
  // =========================================================================

  // GET /runs/last - must be before /runs/:id to avoid route conflict
  router.get('/runs/last', validateQuery(lastRunQuerySchema), getLastRunHandler);
  router.all('/runs/last', methodNotAllowedHandler);

  // GET /runs - list runs with filters
  router.get('/runs', validateQuery(runsQuerySchema), listRunsHandler);

  // POST /runs - ingest contract-compliant result packet
  router.post('/runs', ingestResultHandler);

  router.all('/runs', methodNotAllowedHandler);

  // GET /runs/:id - get single run
  router.get('/runs/:id', validateParams(runIdParamSchema), getRunByIdHandler);
  router.all('/runs/:id', methodNotAllowedHandler);

  // GET /runs/:id/artifacts - get artifact references
  router.get(
    '/runs/:id/artifacts',
    validateParams(runIdParamSchema),
    getRunArtifactsHandler
  );
  router.all('/runs/:id/artifacts', methodNotAllowedHandler);

  // =========================================================================
  // Scenarios Endpoints
  // =========================================================================

  // GET /scenarios - list scenarios
  router.get('/scenarios', listScenariosHandler);
  router.all('/scenarios', methodNotAllowedHandler);

  // GET /scenarios/:id - get scenario details
  router.get(
    '/scenarios/:id',
    validateParams(scenarioIdParamSchema),
    getScenarioByIdHandler
  );
  router.all('/scenarios/:id', methodNotAllowedHandler);

  // GET /scenarios/:id/runs - get runs for scenario
  router.get(
    '/scenarios/:id/runs',
    validateParams(scenarioIdParamSchema),
    validateQuery(runsQuerySchema),
    getScenarioRunsHandler
  );
  router.all('/scenarios/:id/runs', methodNotAllowedHandler);

  // =========================================================================
  // Results Endpoints
  // =========================================================================

  // GET /results/latest - most recently indexed run (no filters required)
  router.get('/results/latest', getLatestRunHandler);
  router.all('/results/latest', methodNotAllowedHandler);

  // =========================================================================
  // Summary Endpoints
  // =========================================================================

  // GET /summary - environment summary statistics
  router.get('/summary', validateQuery(summaryQuerySchema), getSummaryHandler);
  router.all('/summary', methodNotAllowedHandler);

  return router;
}

/**
 * Async handler wrapper to properly catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
