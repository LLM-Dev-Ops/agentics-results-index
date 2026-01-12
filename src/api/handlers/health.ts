/**
 * Health check endpoint handler
 *
 * Provides service health status including database connectivity.
 */

import { Request, Response } from 'express';
import { checkDatabaseHealth } from '../../data/pool';
import { HealthResponse } from '../../types';

/**
 * GET /api/v1/health
 *
 * Returns service health status
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const dbHealthy = await checkDatabaseHealth();

  const response: HealthResponse = {
    status: dbHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? 'ok' : 'error',
    },
  };

  // Return 200 even if degraded (for load balancer compatibility)
  // Return 503 only if completely unhealthy
  const statusCode = dbHealthy ? 200 : 503;

  res.status(statusCode).json(response);
}
