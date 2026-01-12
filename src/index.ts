/**
 * agentics-results-index
 *
 * Read-only query service for inspecting completed Agentics runs.
 *
 * This service is the READ side of the Agentics CQRS split.
 * It NEVER executes simulations, mutates state, or owns schemas.
 *
 * @see /plans/SPARC_SPECIFICATION.md
 */

import { createServer, startServer } from './server';
import { initPool, closePool } from './data/pool';
import { loadConfig } from './config';

async function main(): Promise<void> {
  console.log('[startup] agentics-results-index starting...');

  // Load configuration from environment
  try {
    const config = loadConfig();
    console.log(`[startup] Configuration loaded (env: ${config.nodeEnv})`);
  } catch (err) {
    console.error('[startup] Failed to load configuration:', (err as Error).message);
    process.exit(1);
  }

  // Initialize database connection pool
  try {
    initPool();
    console.log('[startup] Database connection pool initialized (read-only mode)');
  } catch (err) {
    console.error('[startup] Failed to initialize database pool:', (err as Error).message);
    process.exit(1);
  }

  // Create and start HTTP server
  const app = createServer();
  startServer(app);

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('[fatal] Uncaught exception:', err.message);
    closePool().finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] Unhandled rejection:', reason);
    closePool().finally(() => process.exit(1));
  });
}

main().catch((err) => {
  console.error('[fatal] Startup failed:', err);
  process.exit(1);
});
