/**
 * Summary endpoint handlers
 *
 * Provides aggregated statistics for dashboards.
 * READ-ONLY: Pre-computed from existing data.
 */

import { Request, Response, NextFunction } from 'express';
import { getEnvironmentSummary } from '../../data/repository';
import {
  SuccessResponse,
  EnvironmentSummary,
  Environment,
  SummaryPeriod,
} from '../../types';

interface SummaryQueryParams {
  environment: Environment;
  period: SummaryPeriod;
}

/**
 * GET /api/v1/summary
 *
 * Get environment summary statistics for dashboards.
 * Provides run counts, success rates, and timing information.
 */
export async function getSummaryHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as SummaryQueryParams;

    const startTime = Date.now();
    const summary = await getEnvironmentSummary(query.environment, query.period);
    const queryTimeMs = Date.now() - startTime;

    const response: SuccessResponse<EnvironmentSummary> = {
      data: summary,
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
