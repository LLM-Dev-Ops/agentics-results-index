/**
 * Result packet ingestion handler
 *
 * POST /api/v1/runs
 *
 * Accepts ONLY contract-compliant result packets validated against
 * the agentics-contracts ResultPacketSchema.
 *
 * Event-driven: validates the payload, then publishes an
 * execution_completed event to the EventBus. Subscribers handle
 * storage, artifact indexing, and any other downstream processing.
 *
 * Rejects malformed payloads with HTTP 400 and validation details.
 * Returns HTTP 500 if any subscriber fails during event processing.
 */

import { Request, Response } from 'express';
import { ResultPacketSchema } from 'agentics-contracts';
import type { ResultPacket } from 'agentics-contracts';
import { getEventBus } from '../../events/event-bus';
import { ErrorResponse, ERROR_CODES } from '../../types';

/**
 * POST /api/v1/runs
 *
 * Ingest a contract-compliant result packet via lifecycle event.
 * Full Zod validation against ResultPacketSchema from agentics-contracts.
 * NO partial data accepted. NO silent failures.
 *
 * After validation, publishes execution_completed to the EventBus.
 * Subscribers (store-run-metadata, index-artifacts) handle persistence.
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

  // Publish execution_completed lifecycle event.
  // Subscribers handle storage and artifact indexing.
  // Failure in any subscriber is surfaced as HTTP 500.
  try {
    const bus = getEventBus();
    const result = await bus.publish('execution_completed', packet);

    if (result.failed > 0) {
      const failedNames = result.errors.map((e) => e.subscriber).join(', ');
      console.error('[RESULTS_INDEX_EVENT_FAILURE]', {
        execution_id: packet.execution_id,
        run_id: packet.run_id,
        failed_subscribers: failedNames,
        errors: result.errors,
        requestId,
      });

      const errorResponse: ErrorResponse = {
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: `Event processing failed for execution_id=${packet.execution_id} (subscribers: ${failedNames})`,
          requestId,
          timestamp: new Date().toISOString(),
        },
      };
      res.status(500).json(errorResponse);
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown event bus error';
    console.error('[RESULTS_INDEX_EVENT_BUS_ERROR]', {
      execution_id: packet.execution_id,
      run_id: packet.run_id,
      error: message,
      requestId,
    });

    const errorResponse: ErrorResponse = {
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `Event bus error for execution_id=${packet.execution_id}`,
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
      event: 'execution_completed',
    },
    metadata: { requestId },
  });
}
