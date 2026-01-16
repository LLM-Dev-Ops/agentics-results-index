/**
 * Inspect Command
 *
 * Provides programmatic access to run inspection with executive synthesis.
 * Used for results analysis and decision support.
 */

import {
  listRuns,
  getRunById,
  getLastRun,
  getRunsByScenario,
} from '../data/repository';
import {
  buildExecutiveSummary,
  buildMetricsFromRuns,
  elevateRiskForProduction,
  isProductionTarget,
  type ExecutiveSummary,
} from '../synthesis';
import type {
  Run,
  Environment,
  RunFilters,
  QueryOptions,
  Pagination,
} from '../types';

// ============================================================================
// Result Types
// ============================================================================

/**
 * Base result for inspect commands
 */
export interface InspectCommandResult {
  success: boolean;
  runs: Run[];
  pagination?: Pagination;
  synthesis?: ExecutiveSummary;
  error?: string;
}

/**
 * Result for inspecting the latest run
 */
export interface InspectLatestResult {
  success: boolean;
  run: Run | null;
  synthesis?: ExecutiveSummary;
  error?: string;
}

/**
 * Result for inspecting a specific run by ID
 */
export interface InspectRunResult {
  success: boolean;
  run: Run | null;
  synthesis?: ExecutiveSummary;
  error?: string;
}

/**
 * Result for inspecting runs by scenario
 */
export interface InspectScenarioResult {
  success: boolean;
  scenarioId: string;
  runs: Run[];
  pagination?: Pagination;
  synthesis?: ExecutiveSummary;
  error?: string;
}

// ============================================================================
// Input Types
// ============================================================================

export interface InspectListInput {
  environment?: Environment;
  scenario?: string;
  since?: Date;
  before?: Date;
  limit?: number;
  offset?: number;
}

export interface InspectLatestInput {
  environment: Environment;
  scenario?: string;
}

export interface InspectRunInput {
  runId: string;
}

export interface InspectScenarioInput {
  scenarioId: string;
  environment?: Environment;
  since?: Date;
  before?: Date;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Command Functions
// ============================================================================

/**
 * Inspect runs with optional filters
 *
 * Returns runs matching the criteria with executive synthesis
 * based on aggregated results.
 */
export async function inspectRuns(
  input: InspectListInput
): Promise<InspectCommandResult> {
  try {
    const filters: RunFilters = {
      environment: input.environment,
      scenario: input.scenario,
      since: input.since,
      before: input.before,
    };

    const options: QueryOptions = {
      orderBy: 'completed_at',
      orderDirection: 'DESC',
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    };

    const { runs, pagination } = await listRuns(filters, options);

    // Build executive synthesis from results
    const metrics = buildMetricsFromRuns(runs);

    const synthesis = buildExecutiveSummary(
      {
        environment: input.environment ?? 'development',
        timestamp: new Date().toISOString(),
        version: process.env['APP_VERSION'],
        commit_sha: process.env['GIT_SHA'],
      },
      metrics,
      ['results index query', 'response parsing', 'synthesis generation']
    );

    // Elevate risk for production environments
    if (input.environment && isProductionTarget(input.environment)) {
      elevateRiskForProduction(synthesis);
    }

    return {
      success: true,
      runs,
      pagination,
      synthesis,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      runs: [],
      error: message,
    };
  }
}

/**
 * Inspect the latest run for an environment
 *
 * Returns the most recent run with synthesis based on its status.
 */
export async function inspectLatest(
  input: InspectLatestInput
): Promise<InspectLatestResult> {
  try {
    const run = await getLastRun(input.environment, input.scenario);

    if (!run) {
      return {
        success: true,
        run: null,
        error: `No runs found for environment '${input.environment}'`,
      };
    }

    // Build synthesis from single run
    const metrics = buildMetricsFromRuns([run]);

    const synthesis = buildExecutiveSummary(
      {
        environment: input.environment,
        timestamp: new Date().toISOString(),
        version: process.env['APP_VERSION'],
        commit_sha: process.env['GIT_SHA'],
      },
      metrics,
      ['results index query', 'response parsing', 'synthesis generation']
    );

    // Elevate risk for production environments
    if (isProductionTarget(input.environment)) {
      elevateRiskForProduction(synthesis);
    }

    return {
      success: true,
      run,
      synthesis,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      run: null,
      error: message,
    };
  }
}

/**
 * Inspect a specific run by ID
 *
 * Returns the run details with synthesis based on its status.
 */
export async function inspectRun(
  input: InspectRunInput
): Promise<InspectRunResult> {
  try {
    const run = await getRunById(input.runId);

    if (!run) {
      return {
        success: true,
        run: null,
        error: `Run '${input.runId}' not found`,
      };
    }

    // Build synthesis from single run
    const metrics = buildMetricsFromRuns([run]);

    const synthesis = buildExecutiveSummary(
      {
        environment: run.environment,
        timestamp: new Date().toISOString(),
        version: process.env['APP_VERSION'],
        commit_sha: process.env['GIT_SHA'],
      },
      metrics,
      ['results index query', 'response parsing', 'synthesis generation']
    );

    // Elevate risk for production environments
    if (isProductionTarget(run.environment)) {
      elevateRiskForProduction(synthesis);
    }

    return {
      success: true,
      run,
      synthesis,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      run: null,
      error: message,
    };
  }
}

/**
 * Inspect runs for a specific scenario
 *
 * Returns all runs for a scenario with aggregated synthesis.
 */
export async function inspectScenario(
  input: InspectScenarioInput
): Promise<InspectScenarioResult> {
  try {
    const filters: Omit<RunFilters, 'scenario'> = {
      environment: input.environment,
      since: input.since,
      before: input.before,
    };

    const options: QueryOptions = {
      orderBy: 'completed_at',
      orderDirection: 'DESC',
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
    };

    const { runs, pagination } = await getRunsByScenario(
      input.scenarioId,
      filters,
      options
    );

    // Determine environment from runs or input
    const environment = input.environment ?? runs[0]?.environment ?? 'development';

    // Build executive synthesis from aggregated results
    const metrics = buildMetricsFromRuns(runs);

    const synthesis = buildExecutiveSummary(
      {
        environment,
        timestamp: new Date().toISOString(),
        version: process.env['APP_VERSION'],
        commit_sha: process.env['GIT_SHA'],
      },
      metrics,
      ['results index query', 'response parsing', 'synthesis generation']
    );

    // Elevate risk for production environments
    if (isProductionTarget(environment)) {
      elevateRiskForProduction(synthesis);
    }

    return {
      success: true,
      scenarioId: input.scenarioId,
      runs,
      pagination,
      synthesis,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      scenarioId: input.scenarioId,
      runs: [],
      error: message,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick check if latest production run is healthy
 *
 * Returns true only if the latest production run completed successfully.
 */
export async function isProductionHealthy(
  scenario?: string
): Promise<boolean> {
  const result = await inspectLatest({
    environment: 'production',
    scenario,
  });

  if (!result.success || !result.run) {
    return false;
  }

  return result.run.status === 'completed';
}

/**
 * Get recommendation for a specific environment
 *
 * Returns the synthesis recommendation for the latest run.
 */
export async function getEnvironmentRecommendation(
  environment: Environment,
  scenario?: string
): Promise<{ recommendation: string; rationale: string } | null> {
  const result = await inspectLatest({ environment, scenario });

  if (!result.success || !result.synthesis) {
    return null;
  }

  return {
    recommendation: result.synthesis.recommendation,
    rationale: result.synthesis.rationale,
  };
}
