/**
 * Typed EventBus for lifecycle-driven event processing
 *
 * Replaces direct HTTP-to-storage coupling with an event-driven model.
 * Services subscribe to lifecycle events (e.g. execution_completed)
 * and react asynchronously to incoming event payloads.
 *
 * Design:
 * - In-process pub/sub (no external broker dependency required)
 * - Typed event map ensures compile-time safety
 * - Subscribers run sequentially per event to preserve ordering guarantees
 * - Errors in one subscriber do not prevent others from executing
 */

import type { ResultPacket } from 'agentics-contracts';

/**
 * Lifecycle events emitted by the Agentics platform.
 * Each key is an event name; the value is the payload type.
 */
export interface LifecycleEventMap {
  execution_completed: ResultPacket;
  execution_failed: ResultPacket;
}

export type LifecycleEvent = keyof LifecycleEventMap;

/**
 * Subscriber function signature.
 * Receives the event payload and must return a Promise.
 * Throwing an error logs and continues to the next subscriber.
 */
export type EventSubscriber<E extends LifecycleEvent> = (
  payload: LifecycleEventMap[E]
) => Promise<void>;

interface SubscriberEntry<E extends LifecycleEvent = LifecycleEvent> {
  name: string;
  handler: EventSubscriber<E>;
}

/**
 * In-process event bus for lifecycle-driven event processing.
 *
 * Usage:
 *   const bus = new EventBus();
 *   bus.subscribe('execution_completed', 'index-results', async (packet) => { ... });
 *   await bus.publish('execution_completed', packet);
 */
export class EventBus {
  private subscribers = new Map<LifecycleEvent, SubscriberEntry[]>();
  private publishCount = 0;

  /**
   * Subscribe to a lifecycle event.
   *
   * @param event - The lifecycle event name
   * @param name - Human-readable subscriber name (for logging)
   * @param handler - Async handler invoked when the event fires
   */
  subscribe<E extends LifecycleEvent>(
    event: E,
    name: string,
    handler: EventSubscriber<E>
  ): void {
    const existing = this.subscribers.get(event) ?? [];
    existing.push({ name, handler: handler as EventSubscriber<LifecycleEvent> });
    this.subscribers.set(event, existing);
    console.log(`[event-bus] Subscriber registered: "${name}" -> ${event}`);
  }

  /**
   * Publish a lifecycle event to all registered subscribers.
   *
   * Subscribers execute sequentially. Errors are logged but do not
   * prevent subsequent subscribers from running.
   *
   * @param event - The lifecycle event name
   * @param payload - The typed event payload
   * @returns Summary of subscriber execution results
   */
  async publish<E extends LifecycleEvent>(
    event: E,
    payload: LifecycleEventMap[E]
  ): Promise<PublishResult> {
    this.publishCount++;
    const entries = this.subscribers.get(event) ?? [];

    if (entries.length === 0) {
      console.warn(`[event-bus] No subscribers for event: ${event}`);
      return { event, subscriberCount: 0, succeeded: 0, failed: 0, errors: [] };
    }

    console.log(
      `[event-bus] Publishing ${event} to ${entries.length} subscriber(s)`
    );

    let succeeded = 0;
    let failed = 0;
    const errors: SubscriberError[] = [];

    for (const entry of entries) {
      try {
        await entry.handler(payload);
        succeeded++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[event-bus] Subscriber "${entry.name}" failed on ${event}:`,
          message
        );
        errors.push({ subscriber: entry.name, error: message });
      }
    }

    return { event, subscriberCount: entries.length, succeeded, failed, errors };
  }

  /**
   * Get subscriber count for a specific event (for health checks).
   */
  subscriberCount(event: LifecycleEvent): number {
    return (this.subscribers.get(event) ?? []).length;
  }

  /**
   * Total number of events published since startup.
   */
  get totalPublished(): number {
    return this.publishCount;
  }

  /**
   * List all registered subscriptions (for diagnostics).
   */
  listSubscriptions(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [event, entries] of this.subscribers) {
      result[event] = entries.map((e) => e.name);
    }
    return result;
  }
}

export interface PublishResult {
  event: string;
  subscriberCount: number;
  succeeded: number;
  failed: number;
  errors: SubscriberError[];
}

export interface SubscriberError {
  subscriber: string;
  error: string;
}

// Singleton instance
let busInstance: EventBus | null = null;

export function initEventBus(): EventBus {
  if (busInstance) return busInstance;
  busInstance = new EventBus();
  console.log('[event-bus] EventBus initialized');
  return busInstance;
}

export function getEventBus(): EventBus {
  if (!busInstance) {
    throw new Error('EventBus not initialized — call initEventBus() at startup');
  }
  return busInstance;
}

export function resetEventBus(): void {
  busInstance = null;
}
