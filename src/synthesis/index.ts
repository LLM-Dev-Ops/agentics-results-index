/**
 * Executive Synthesis Module
 *
 * Provides types and builders for generating executive summaries
 * from simulation results with risk assessment and recommendations.
 */

import type { Environment, Run } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Risk levels for synthesis assessment
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Recommendation outcomes based on analysis
 */
export type Recommendation = 'APPROVE' | 'DEFER' | 'REJECT';

/**
 * Deploy reference metadata for traceability
 */
export interface DeployReference {
  environment: Environment;
  timestamp: string;
  version?: string;
  commit_sha?: string;
}

/**
 * Execution metrics from run analysis
 */
export interface ExecutionMetrics {
  success_rate: number;
  failed_iterations: number;
  blocking_issues: string[];
  total_runs?: number;
  avg_duration_ms?: number | null;
}

/**
 * Executive summary combining reference, metrics, and assessment
 */
export interface ExecutiveSummary {
  deploy_reference: DeployReference;
  metrics: ExecutionMetrics;
  steps_executed: string[];
  risk_level: RiskLevel;
  recommendation: Recommendation;
  rationale: string;
  generated_at: string;
}

// ============================================================================
// Builder Functions
// ============================================================================

/**
 * Calculate risk level based on metrics
 */
function calculateRiskLevel(metrics: ExecutionMetrics): RiskLevel {
  const { success_rate, failed_iterations, blocking_issues } = metrics;

  // Critical: more than 50% failure or any blocking issues
  if (success_rate < 0.5 || blocking_issues.length > 0) {
    return 'critical';
  }

  // High: 50-75% success rate or more than 2 failed iterations
  if (success_rate < 0.75 || failed_iterations > 2) {
    return 'high';
  }

  // Medium: 75-90% success rate or 1-2 failed iterations
  if (success_rate < 0.9 || failed_iterations > 0) {
    return 'medium';
  }

  // Low: 90%+ success rate with no failures
  return 'low';
}

/**
 * Determine recommendation based on metrics
 */
function determineRecommendation(metrics: ExecutionMetrics): Recommendation {
  const { success_rate, failed_iterations, blocking_issues } = metrics;

  // Reject if majority failed or blocking issues exist
  if (success_rate < 0.5 || blocking_issues.length > 0) {
    return 'REJECT';
  }

  // Defer if mixed results
  if (success_rate < 1.0 || failed_iterations > 0) {
    return 'DEFER';
  }

  // Approve if all completed successfully
  return 'APPROVE';
}

/**
 * Generate rationale text based on metrics and recommendation
 */
function generateRationale(
  metrics: ExecutionMetrics,
  recommendation: Recommendation
): string {
  const { success_rate, failed_iterations, blocking_issues, total_runs } = metrics;
  const successPercent = Math.round(success_rate * 100);

  switch (recommendation) {
    case 'APPROVE':
      return `All ${total_runs ?? 'analyzed'} runs completed successfully with ${successPercent}% success rate. No blocking issues detected.`;

    case 'DEFER':
      return `Mixed results: ${successPercent}% success rate with ${failed_iterations} failed iteration(s). Review recommended before proceeding.`;

    case 'REJECT':
      if (blocking_issues.length > 0) {
        return `Blocking issues detected: ${blocking_issues.join(', ')}. Cannot proceed until resolved.`;
      }
      return `Majority of runs failed (${successPercent}% success rate). Investigation required.`;
  }
}

/**
 * Build an executive summary from deploy reference and metrics
 *
 * @param reference - Deploy reference metadata
 * @param metrics - Execution metrics from analysis
 * @param stepsExecuted - List of analysis steps performed
 * @returns Complete executive summary
 */
export function buildExecutiveSummary(
  reference: DeployReference,
  metrics: ExecutionMetrics,
  stepsExecuted: string[]
): ExecutiveSummary {
  const risk_level = calculateRiskLevel(metrics);
  const recommendation = determineRecommendation(metrics);
  const rationale = generateRationale(metrics, recommendation);

  return {
    deploy_reference: reference,
    metrics,
    steps_executed: stepsExecuted,
    risk_level,
    recommendation,
    rationale,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Elevate risk level for production environments
 *
 * Production environments have higher stakes, so risk levels are elevated:
 * - low -> medium
 * - medium -> high
 * - high -> critical
 * - critical remains critical
 *
 * @param summary - Executive summary to modify in place
 */
export function elevateRiskForProduction(summary: ExecutiveSummary): void {
  if (summary.deploy_reference.environment !== 'production') {
    return;
  }

  const riskElevation: Record<RiskLevel, RiskLevel> = {
    low: 'medium',
    medium: 'high',
    high: 'critical',
    critical: 'critical',
  };

  const originalRisk = summary.risk_level;
  summary.risk_level = riskElevation[originalRisk];

  // Append production warning to rationale if risk was elevated
  if (summary.risk_level !== originalRisk) {
    summary.rationale += ` [Risk elevated from ${originalRisk} to ${summary.risk_level} for production environment]`;
  }
}

// ============================================================================
// Helper Functions for Run Analysis
// ============================================================================

/**
 * Calculate success rate from an array of runs
 */
export function calculateSuccessRate(runs: Run[]): number {
  if (runs.length === 0) {
    return 0;
  }

  const completed = runs.filter((r) => r.status === 'completed').length;
  return completed / runs.length;
}

/**
 * Count failed iterations from runs
 */
export function countFailedIterations(runs: Run[]): number {
  return runs.filter((r) => r.status === 'failed').length;
}

/**
 * Extract blocking issues from runs
 * A blocking issue is a critical failure that prevents continuation
 */
export function extractBlockingIssues(runs: Run[]): string[] {
  const issues: string[] = [];

  for (const run of runs) {
    // Check for failed status with high assertion failures
    if (run.status === 'failed' && run.result_summary) {
      const assertionsFailed = run.result_summary.assertions_failed ?? 0;
      if (typeof assertionsFailed === 'number' && assertionsFailed > 0) {
        issues.push(`Run ${run.run_id}: ${assertionsFailed} assertion(s) failed`);
      }
    }

    // Check for timeout status (potential blocking issue)
    if (run.status === 'timeout') {
      issues.push(`Run ${run.run_id}: Timed out`);
    }
  }

  return issues;
}

/**
 * Check if the target is a production environment
 */
export function isProductionTarget(environment: Environment): boolean {
  return environment === 'production';
}

/**
 * Build metrics from an array of runs
 */
export function buildMetricsFromRuns(runs: Run[]): ExecutionMetrics {
  return {
    success_rate: calculateSuccessRate(runs),
    failed_iterations: countFailedIterations(runs),
    blocking_issues: extractBlockingIssues(runs),
    total_runs: runs.length,
    avg_duration_ms:
      runs.length > 0
        ? runs.reduce((sum, r) => sum + r.duration_ms, 0) / runs.length
        : null,
  };
}
