/**
 * agentics-results-index
 *
 * Event-driven query and ingestion service for Agentics runs.
 *
 * This service subscribes to lifecycle events (execution_completed)
 * to index run metadata and artifact references. All payloads are
 * validated at runtime against agentics-contracts schemas. Storage
 * failures are never silently swallowed.
 *
 * Architecture:
 *   POST /api/v1/runs -> validate -> publish(execution_completed)
 *   EventBus -> store-run-metadata subscriber -> runs table
 *   EventBus -> index-artifacts subscriber -> artifacts table
 *   GET /api/v1/runs/* -> read-only query layer -> response
 *
 * @see /plans/SPARC_SPECIFICATION.md
 */

import { createServer, startServer } from './server';
import { initPool, closePool } from './data/pool';
import { initWritePool, closeWritePool } from './data/write-pool';
import { loadConfig, enforceStorageConfig } from './config';
import { initEventBus } from './events/event-bus';
import { registerAllSubscribers } from './events/register';

async function main(): Promise<void> {
  console.log('[startup] agentics-results-index starting...');

  // Enforce storage backend configuration BEFORE loading config.
  // If storage URL or credentials are missing, fail immediately.
  try {
    enforceStorageConfig();
    console.log('[startup] Storage backend configuration verified');
  } catch (err) {
    console.error('[startup] Storage configuration failed:', (err as Error).message);
    process.exit(1);
  }

  // Load configuration from environment
  try {
    const config = loadConfig();
    console.log(`[startup] Configuration loaded (env: ${config.nodeEnv})`);
  } catch (err) {
    console.error('[startup] Failed to load configuration:', (err as Error).message);
    process.exit(1);
  }

  // Initialize read-only database connection pool
  try {
    initPool();
    console.log('[startup] Database connection pool initialized (read-only mode)');
  } catch (err) {
    console.error('[startup] Failed to initialize database pool:', (err as Error).message);
    process.exit(1);
  }

  // Initialize write connection pool for result packet ingestion
  try {
    initWritePool();
    console.log('[startup] Write connection pool initialized');
  } catch (err) {
    console.error('[startup] Failed to initialize write pool:', (err as Error).message);
    process.exit(1);
  }

  // Initialize EventBus and register lifecycle event subscribers.
  // MUST happen after write pool init (subscribers depend on it).
  try {
    const bus = initEventBus();
    registerAllSubscribers(bus);
    console.log('[startup] EventBus initialized, subscribers registered');
    console.log('[startup] Subscriptions:', JSON.stringify(bus.listSubscriptions()));
  } catch (err) {
    console.error('[startup] Failed to initialize EventBus:', (err as Error).message);
    process.exit(1);
  }

  // Create and start HTTP server
  const app = createServer();
  startServer(app);

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('[fatal] Uncaught exception:', err.message);
    Promise.all([closePool(), closeWritePool()]).finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] Unhandled rejection:', reason);
    Promise.all([closePool(), closeWritePool()]).finally(() => process.exit(1));
  });
}

main().catch((err) => {
  console.error('[fatal] Startup failed:', err);
  process.exit(1);
});
