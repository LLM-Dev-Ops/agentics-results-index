/**
 * Result packet ingestion handler
 *
 * POST /api/v1/runs
 *
 * Accepts ONLY contract-compliant result packets validated against
 * the agentics-contracts ResultPacketSchema.
 *
 * Rejects malformed payloads with HTTP 400 and validation details.
 * Returns HTTP 500 on storage failure with execution_id in error logs.
 */

import { Request, Response } from 'express';
import { ResultPacketSchema } from 'agentics-contracts';
import type { ResultPacket } from 'agentics-contracts';
import { storeResultPacket } from '../../data/write-pool';
import { ErrorResponse, ERROR_CODES } from '../../types';

/**
 * POST /api/v1/runs
 *
 * Ingest a contract-compliant result packet.
 * Full Zod validation against ResultPacketSchema from agentics-contracts.
 * NO partial data accepted. NO silent failures.
 */
export async function ingestResultHandler(
  req: Request,
  res: Response
): Promise<void> {
  const requestId = req.requestId;

  // Runtime validation against canonical contract schema from agentics-contracts.
  // This is MANDATORY — not optional, not dev-only.
  const parsed = ResultPacketSchema.safeParse(req.body);

  if (!parsed.success) {
    const errorResponse: ErrorResponse = {
      error: {
        code: ERROR_CODES.INVALID_REQUEST,
        message: 'Result packet validation failed against agentics-contracts schema',
        details: parsed.error.errors.map((err) => ({
          field: err.path.join('.'),
          issue: err.message,
        })),
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(400).json(errorResponse);
    return;
  }

  const packet: ResultPacket = parsed.data;

  // Store the validated, contract-compliant payload.
  // Storage failure is NOT swallowed — returns explicit HTTP 500.
  try {
    await storeResultPacket(packet);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown storage error';
    console.error('[RESULTS_INDEX_STORAGE_FAILURE]', {
      execution_id: packet.execution_id,
      run_id: packet.run_id,
      error: message,
      requestId,
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `Storage failed for execution_id=${packet.execution_id}`,
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(500).json(errorResponse);
    return;
  }

  res.status(201).json({
    data: {
      execution_id: packet.execution_id,
      run_id: packet.run_id,
      status: 'stored',
    },
    metadata: { requestId },
  });
}
