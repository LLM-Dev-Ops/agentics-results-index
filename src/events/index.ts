/**
 * Events module - lifecycle-driven event processing
 *
 * Exports the EventBus and all subscriber registrations.
 * Call registerAllSubscribers() at startup after initializing
 * the EventBus and data pools.
 */

export {
  EventBus,
  initEventBus,
  getEventBus,
  resetEventBus,
  type LifecycleEvent,
  type LifecycleEventMap,
  type PublishResult,
} from './event-bus';

export { registerAllSubscribers } from './register';
