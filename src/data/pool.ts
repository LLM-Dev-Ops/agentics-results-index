/**
 * Read-only connection pool for Ruvector Postgres
 *
 * CRITICAL: This pool enforces read-only access at multiple layers:
 * 1. Connection configuration (default_transaction_read_only)
 * 2. Session-level SET TRANSACTION READ ONLY
 * 3. Query validation (only SELECT allowed)
 */

import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { getConfig } from '../config';

let pool: Pool | null = null;

/**
 * Initialize the read-only connection pool
 */
export function initPool(): Pool {
  if (pool) {
    return pool;
  }

  const config = getConfig();

  // Build connection config - use Unix socket if available (Cloud SQL)
  const poolConfig: PoolConfig = config.database.socketPath
    ? {
        // Cloud SQL Unix socket connection
        host: config.database.socketPath,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
        min: config.database.poolMin,
        max: config.database.poolMax,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        // Read-only enforcement at connection level
        options: '-c default_transaction_read_only=on',
      }
    : {
        // TCP/IP connection
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
        min: config.database.poolMin,
        max: config.database.poolMax,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        // Read-only enforcement at connection level
        options: '-c default_transaction_read_only=on',
      };

  console.log(`[pool] Connecting to database: ${config.database.database} via ${config.database.socketPath || config.database.host}:${config.database.port}`);

  pool = new Pool(poolConfig);

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('[pool] Unexpected error on idle client:', err.message);
  });

  pool.on('connect', (client) => {
    // Double-ensure read-only mode on each new connection
    client.query('SET TRANSACTION READ ONLY').catch((err) => {
      console.error('[pool] Failed to set read-only transaction:', err.message);
    });
  });

  return pool;
}

/**
 * Get the connection pool (initializes if needed)
 */
export function getPool(): Pool {
  if (!pool) {
    return initPool();
  }
  return pool;
}

/**
 * Acquire a read-only client from the pool
 * Sets statement timeout for query safety
 */
export async function acquireReadOnlyClient(): Promise<PoolClient> {
  const p = getPool();
  const client = await p.connect();
  const config = getConfig();

  // Set statement timeout to prevent runaway queries
  await client.query(`SET statement_timeout = ${config.database.statementTimeoutMs}`);

  // Ensure read-only transaction mode
  await client.query('SET TRANSACTION READ ONLY');

  return client;
}

/**
 * Execute a read-only query with automatic client management
 *
 * SECURITY: Validates that SQL starts with SELECT before execution
 */
export async function executeReadOnlyQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  // Defense in depth: verify query is SELECT-only
  const normalizedSql = sql.trim().toUpperCase();
  if (!normalizedSql.startsWith('SELECT')) {
    throw new Error('Only SELECT queries are permitted on this read-only service');
  }

  // Additional checks for dangerous keywords
  const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
  for (const keyword of forbiddenKeywords) {
    // Check for keyword as a word boundary (not part of column name)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(sql)) {
      throw new Error(`Forbidden keyword '${keyword}' detected in query`);
    }
  }

  const client = await acquireReadOnlyClient();
  try {
    const result = await client.query<T>(sql, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Health check - verify database connectivity
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await executeReadOnlyQuery('SELECT 1 as health_check');
    return result.rows.length === 1;
  } catch (err) {
    const error = err as Error;
    console.error('[pool] Health check failed:', error.message);
    return false;
  }
}

/**
 * Gracefully close the pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * For testing - reset pool
 */
export function resetPool(): void {
  pool = null;
}
