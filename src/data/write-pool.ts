/**
 * Write pool for result packet storage
 *
 * Separate from the read-only pool. Used exclusively by
 * the POST ingestion endpoint to store contract-compliant
 * result packets.
 */

import { Pool, PoolConfig } from 'pg';
import { getConfig } from '../config';
import type { ResultPacket } from 'agentics-contracts';

let writePool: Pool | null = null;

/**
 * Initialize the write connection pool.
 * MUST be called at startup after config is loaded.
 */
export function initWritePool(): Pool {
  if (writePool) {
    return writePool;
  }

  const config = getConfig();

  const poolConfig: PoolConfig = config.database.socketPath
    ? {
        host: config.database.socketPath,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
        min: 1,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
        user: config.database.user,
        password: config.database.password,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
        min: 1,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      };

  writePool = new Pool(poolConfig);

  writePool.on('error', (err) => {
    console.error('[write-pool] Unexpected error on idle client:', err.message);
  });

  console.log('[write-pool] Write connection pool initialized');

  return writePool;
}

/**
 * Store a validated result packet.
 *
 * Storage format EXACTLY matches contract schema:
 * - No field renaming
 * - No flattening of nested objects
 * - No enum conversion
 * - Full contract payload preserved in metadata JSONB
 *
 * Throws on failure — caller MUST handle errors explicitly.
 */
export async function storeResultPacket(packet: ResultPacket): Promise<void> {
  if (!writePool) {
    throw new Error('Write pool not initialized — cannot store result packet');
  }

  const client = await writePool.connect();
  try {
    const sql = `
      INSERT INTO runs (
        run_id,
        scenario_id,
        environment,
        status,
        started_at,
        completed_at,
        duration_ms,
        result_summary,
        correlation_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    // Preserve full contract structure in metadata JSONB.
    // No field renaming, no flattening, no enum conversion.
    const metadata: Record<string, unknown> = {
      execution_id: packet.execution_id,
      simulation_id: packet.simulation_id,
      parent_span_id: packet.parent_span_id,
      simulation_resolution: packet.simulation_resolution,
      repo_name: packet.repo_name,
      proof_hash: packet.execution_metadata.proof_hash,
      layers_executed: packet.execution_metadata.layers_executed,
      schema_version: packet.execution_metadata.schema_version,
      executionProof: packet.executionProof,
      execution_context: packet.execution_context ?? null,
      timestamps: packet.timestamps ?? null,
    };

    const params = [
      packet.run_id,
      packet.scenario_id,
      packet.environment,
      packet.status,
      packet.execution_metadata.started_at,
      packet.execution_metadata.completed_at,
      packet.execution_metadata.duration_ms,
      JSON.stringify(packet.result_summary),
      packet.correlation_id,
      JSON.stringify(metadata),
    ];

    await client.query(sql, params);
  } finally {
    client.release();
  }
}

/**
 * Gracefully close the write pool
 */
export async function closeWritePool(): Promise<void> {
  if (writePool) {
    await writePool.end();
    writePool = null;
  }
}
