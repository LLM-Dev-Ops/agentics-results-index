/**
 * Health check endpoint handler
 *
 * Provides service health status including database connectivity
 * and EventBus subscription status.
 */

import { Request, Response } from 'express';
import { checkDatabaseHealth } from '../../data/pool';
import { getEventBus } from '../../events/event-bus';
import { HealthResponse } from '../../types';

/**
 * GET /api/v1/health
 *
 * Returns service health status including event subscriptions
 */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const dbHealthy = await checkDatabaseHealth();

  let eventBusHealthy = false;
  let subscriptions: Record<string, string[]> = {};
  try {
    const bus = getEventBus();
    eventBusHealthy = bus.subscriberCount('execution_completed') > 0;
    subscriptions = bus.listSubscriptions();
  } catch {
    eventBusHealthy = false;
  }

  const allHealthy = dbHealthy && eventBusHealthy;

  const response: HealthResponse = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealthy ? 'ok' : 'error',
      eventBus: eventBusHealthy ? 'ok' : 'error',
    },
    eventSubscriptions: subscriptions,
  };

  const statusCode = dbHealthy ? 200 : 503;

  res.status(statusCode).json(response);
}
