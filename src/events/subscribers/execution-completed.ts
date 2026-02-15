/**
 * execution_completed subscriber
 *
 * Reacts to the execution_completed lifecycle event by:
 * 1. Storing run metadata (validated ResultPacket -> runs table)
 * 2. Indexing artifact references from the execution proof
 *
 * This is the PRIMARY ingestion path. The POST /api/v1/runs endpoint
 * publishes to the EventBus; this subscriber handles persistence.
 */

import type { ResultPacket } from 'agentics-contracts';
import { storeResultPacket } from '../../data/write-pool';
import { indexArtifactsFromPacket } from '../../data/write-pool';
import type { EventBus } from '../event-bus';

/**
 * Register the execution_completed subscriber on the given EventBus.
 *
 * Subscriber responsibilities:
 * - Store run metadata in the runs table
 * - Index artifact references for later query
 */
export function registerExecutionCompletedSubscriber(bus: EventBus): void {
  bus.subscribe(
    'execution_completed',
    'store-run-metadata',
    async (packet: ResultPacket): Promise<void> => {
      console.log(
        `[execution_completed] Storing run metadata for execution_id=${packet.execution_id}`
      );
      await storeResultPacket(packet);
      console.log(
        `[execution_completed] Run metadata stored: run_id=${packet.run_id}`
      );
    }
  );

  bus.subscribe(
    'execution_completed',
    'index-artifacts',
    async (packet: ResultPacket): Promise<void> => {
      console.log(
        `[execution_completed] Indexing artifacts for execution_id=${packet.execution_id}`
      );
      await indexArtifactsFromPacket(packet);
      console.log(
        `[execution_completed] Artifacts indexed for run_id=${packet.run_id}`
      );
    }
  );
}
