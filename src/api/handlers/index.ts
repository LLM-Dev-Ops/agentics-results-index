/**
 * API handlers index
 *
 * Re-exports all handlers for convenient importing.
 */

export { getHealth } from './health';
export {
  listRunsHandler,
  getLastRunHandler,
  getRunByIdHandler,
  getRunArtifactsHandler,
} from './runs';
export {
  listScenariosHandler,
  getScenarioByIdHandler,
  getScenarioRunsHandler,
} from './scenarios';
export { getSummaryHandler } from './summary';
