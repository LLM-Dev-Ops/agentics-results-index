/**
 * Subscriber registration
 *
 * Registers all lifecycle event subscribers on the EventBus.
 * Called once at startup after the EventBus and data pools
 * are initialized.
 */

import type { EventBus } from './event-bus';
import { registerExecutionCompletedSubscriber } from './subscribers/execution-completed';

/**
 * Register all event subscribers.
 *
 * Order matters: subscribers for the same event execute in
 * registration order. store-run-metadata runs before index-artifacts.
 */
export function registerAllSubscribers(bus: EventBus): void {
  console.log('[events] Registering lifecycle event subscribers...');

  registerExecutionCompletedSubscriber(bus);

  const subs = bus.listSubscriptions();
  const total = Object.values(subs).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[events] ${total} subscriber(s) registered across ${Object.keys(subs).length} event(s)`);
}
