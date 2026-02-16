/**
 * Express server setup
 *
 * Configures the HTTP server with all middleware and routes.
 * READ-ONLY service: no mutation endpoints exposed.
 */

import express, { Application, Request, Response } from 'express';
import { createApiRouter } from './api/routes';
import { assignRequestId } from './api/middleware/validation';
import { errorHandler, notFoundHandler } from './api/middleware/error-handler';
import { getConfig } from './config';

/**
 * Create and configure the Express application
 */
export function createServer(): Application {
  const app = express();
  const config = getConfig();

  // =========================================================================
  // Security & Basic Middleware
  // =========================================================================

  // Disable X-Powered-By header
  app.disable('x-powered-by');

  // Request ID assignment (for tracing)
  app.use(assignRequestId);

  // JSON parsing (sized for POST result packet ingestion)
  app.use(express.json({ limit: '1mb' }));

  // Request logging (simple, no sensitive data)
  app.use((req: Request, _res: Response, next) => {
    const start = Date.now();
    _res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(
        `[http] ${req.method} ${req.path} ${_res.statusCode} ${duration}ms requestId=${req.requestId}`
      );
    });
    next();
  });

  // =========================================================================
  // CORS (if needed for browser access)
  // =========================================================================

  app.use((_req: Request, res: Response, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Max-Age', '86400');

    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // =========================================================================
  // API Routes
  // =========================================================================

  // Mount API router at /api/v1
  const apiRouter = createApiRouter();
  app.use('/api/v1', apiRouter);

  // Root endpoint - service info
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'agentics-results-index',
      version: '1.0.0',
      description: 'Contract-aligned query and ingestion service for Agentics runs',
      documentation: '/api/v1/health',
      endpoints: {
        health: 'GET /api/v1/health',
        runs: 'GET /api/v1/runs',
        ingestRun: 'POST /api/v1/runs',
        lastRun: 'GET /api/v1/runs/last',
        runById: 'GET /api/v1/runs/:id',
        artifacts: 'GET /api/v1/runs/:id/artifacts',
        scenarios: 'GET /api/v1/scenarios',
        scenarioById: 'GET /api/v1/scenarios/:id',
        scenarioRuns: 'GET /api/v1/scenarios/:id/runs',
        latestResult: 'GET /api/v1/results/latest',
        summary: 'GET /api/v1/summary',
      },
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  // 404 handler for undefined routes
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

/**
 * Start the HTTP server
 */
export function startServer(app: Application): void {
  const config = getConfig();

  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] agentics-results-index listening on ${config.host}:${config.port}`);
    console.log(`[server] Environment: ${config.nodeEnv}`);
    console.log(`[server] Read-only mode: ENABLED`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[server] SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[server] SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });
  });
}
