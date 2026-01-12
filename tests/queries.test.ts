/**
 * Example query tests for agentics-results-index
 *
 * These tests demonstrate correct behavior for the primary inspection use cases:
 * - Last production run
 * - Latest completed run
 * - Runs for a given scenario
 *
 * These tests require a running Ruvector Postgres instance with test data.
 * For CI, mock the database layer or use a test container.
 */

import {
  buildLastRunQuery,
  buildRunsListQuery,
  buildRunsByScenarioQuery,
  buildEnvironmentSummaryQuery,
  buildRunsCountQuery,
  VIEWS,
} from '../src/query/builder';
import {
  runsQuerySchema,
  lastRunQuerySchema,
  summaryQuerySchema,
} from '../src/api/middleware/validation';
import { VALID_STATUSES, VALID_ENVIRONMENTS, VALID_PERIODS } from '../src/types';

describe('Query Builder', () => {
  describe('buildLastRunQuery', () => {
    it('should build query for last production run', () => {
      const { sql, params } = buildLastRunQuery('production');

      expect(sql).toContain('SELECT');
      expect(sql).toContain(VIEWS.COMPLETED_RUNS);
      expect(sql).toContain('environment = $1');
      expect(sql).toContain('ORDER BY completed_at DESC');
      expect(sql).toContain('LIMIT 1');
      expect(params).toEqual(['production']);
    });

    it('should build query for last run with scenario filter', () => {
      const { sql, params } = buildLastRunQuery('production', 'load-test-checkout');

      expect(sql).toContain('environment = $1');
      expect(sql).toContain('scenario_id = $2');
      expect(params).toEqual(['production', 'load-test-checkout']);
    });

    it('should only generate SELECT statements', () => {
      const { sql } = buildLastRunQuery('production');

      expect(sql.trim().toUpperCase()).toMatch(/^SELECT/);
      expect(sql.toUpperCase()).not.toContain('INSERT');
      expect(sql.toUpperCase()).not.toContain('UPDATE');
      expect(sql.toUpperCase()).not.toContain('DELETE');
    });
  });

  describe('buildRunsListQuery', () => {
    it('should build query for latest completed runs', () => {
      const { sql, params } = buildRunsListQuery(
        { status: ['completed'] },
        { limit: 10, offset: 0, orderBy: 'completed_at', orderDirection: 'DESC' }
      );

      expect(sql).toContain('SELECT');
      expect(sql).toContain('status IN ($1)');
      expect(sql).toContain('ORDER BY completed_at DESC');
      expect(sql).toContain('LIMIT 10');
      expect(params).toEqual(['completed']);
    });

    it('should build query with environment and time filters', () => {
      const since = new Date('2026-01-10T00:00:00Z');
      const before = new Date('2026-01-12T00:00:00Z');

      const { sql, params } = buildRunsListQuery(
        { environment: 'staging', since, before },
        { limit: 20, offset: 0 }
      );

      expect(sql).toContain('environment = $1');
      expect(sql).toContain('completed_at >= $2');
      expect(sql).toContain('completed_at <= $3');
      expect(params[0]).toBe('staging');
      expect(params[1]).toBe(since.toISOString());
      expect(params[2]).toBe(before.toISOString());
    });

    it('should build query with multiple status filters', () => {
      const { sql, params } = buildRunsListQuery(
        { status: ['completed', 'failed'] },
        { limit: 20, offset: 0 }
      );

      expect(sql).toContain('status IN ($1, $2)');
      expect(params).toContain('completed');
      expect(params).toContain('failed');
    });

    it('should handle scenario wildcard patterns', () => {
      const { sql, params } = buildRunsListQuery(
        { scenario: 'load-test-*' },
        { limit: 20, offset: 0 }
      );

      expect(sql).toContain('scenario_id LIKE $1');
      expect(params).toEqual(['load-test-%']);
    });

    it('should apply pagination correctly', () => {
      const { sql } = buildRunsListQuery(
        {},
        { limit: 50, offset: 100, orderBy: 'completed_at', orderDirection: 'DESC' }
      );

      expect(sql).toContain('LIMIT 50');
      expect(sql).toContain('OFFSET 100');
    });
  });

  describe('buildRunsByScenarioQuery', () => {
    it('should build query for runs by scenario', () => {
      const { sql, params } = buildRunsByScenarioQuery(
        'regression-suite-main',
        { status: ['failed'] },
        { limit: 10, offset: 0, orderBy: 'completed_at', orderDirection: 'DESC' }
      );

      expect(sql).toContain('scenario_id = ');
      expect(sql).toContain('status IN');
      expect(params).toContain('regression-suite-main');
      expect(params).toContain('failed');
    });
  });

  describe('buildEnvironmentSummaryQuery', () => {
    it('should build summary aggregation query', () => {
      const since = new Date('2026-01-11T00:00:00Z');
      const { sql, params } = buildEnvironmentSummaryQuery('production', since);

      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('AVG(duration_ms)');
      expect(sql).toContain('MAX(completed_at)');
      expect(sql).toContain('environment = $1');
      expect(sql).toContain('completed_at >= $2');
      expect(params[0]).toBe('production');
    });
  });

  describe('Read-only enforcement', () => {
    it('should reject invalid status values', () => {
      expect(() =>
        buildRunsListQuery(
          // @ts-expect-error - testing invalid status
          { status: ['running'] },
          { limit: 10, offset: 0 }
        )
      ).toThrow('Invalid status: running');
    });

    it('should reject invalid sort fields', () => {
      expect(() =>
        buildRunsListQuery(
          {},
          // @ts-expect-error - testing invalid sort field
          { limit: 10, offset: 0, orderBy: 'malicious_field' }
        )
      ).toThrow('Invalid sort field: malicious_field');
    });
  });
});

describe('Validation Schemas', () => {
  describe('runsQuerySchema', () => {
    it('should accept valid query parameters', () => {
      const result = runsQuerySchema.safeParse({
        environment: 'production',
        status: 'completed',
        limit: '10',
        offset: '0',
      });

      expect(result.success).toBe(true);
    });

    it('should transform comma-separated statuses into array', () => {
      const result = runsQuerySchema.safeParse({
        status: 'completed,failed',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toEqual(['completed', 'failed']);
      }
    });

    it('should reject invalid environment', () => {
      const result = runsQuerySchema.safeParse({
        environment: 'invalid-env',
      });

      expect(result.success).toBe(false);
    });

    it('should parse order direction correctly', () => {
      const descResult = runsQuerySchema.safeParse({ order: '-completed_at' });
      const ascResult = runsQuerySchema.safeParse({ order: 'completed_at' });

      expect(descResult.success).toBe(true);
      expect(ascResult.success).toBe(true);

      if (descResult.success && ascResult.success) {
        expect(descResult.data.order).toEqual({ field: 'completed_at', direction: 'DESC' });
        expect(ascResult.data.order).toEqual({ field: 'completed_at', direction: 'ASC' });
      }
    });
  });

  describe('lastRunQuerySchema', () => {
    it('should require environment parameter', () => {
      const result = lastRunQuerySchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('should accept valid environment', () => {
      const result = lastRunQuerySchema.safeParse({
        environment: 'production',
      });

      expect(result.success).toBe(true);
    });

    it('should accept optional scenario', () => {
      const result = lastRunQuerySchema.safeParse({
        environment: 'production',
        scenario: 'load-test-checkout',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scenario).toBe('load-test-checkout');
      }
    });
  });

  describe('summaryQuerySchema', () => {
    it('should require environment', () => {
      const result = summaryQuerySchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('should default period to 24h', () => {
      const result = summaryQuerySchema.safeParse({
        environment: 'production',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toBe('24h');
      }
    });

    it('should accept valid period values', () => {
      for (const period of VALID_PERIODS) {
        const result = summaryQuerySchema.safeParse({
          environment: 'production',
          period,
        });
        expect(result.success).toBe(true);
      }
    });
  });
});

describe('Type Constraints', () => {
  it('should have valid status values defined', () => {
    expect(VALID_STATUSES).toContain('completed');
    expect(VALID_STATUSES).toContain('failed');
    expect(VALID_STATUSES).toContain('cancelled');
    expect(VALID_STATUSES).toContain('timeout');
    // 'running' should NOT be in the list - this service only indexes completed runs
    expect(VALID_STATUSES).not.toContain('running');
  });

  it('should have valid environment values defined', () => {
    expect(VALID_ENVIRONMENTS).toContain('production');
    expect(VALID_ENVIRONMENTS).toContain('staging');
    expect(VALID_ENVIRONMENTS).toContain('development');
    expect(VALID_ENVIRONMENTS).toContain('local');
  });

  it('should have valid period values defined', () => {
    expect(VALID_PERIODS).toContain('24h');
    expect(VALID_PERIODS).toContain('7d');
    expect(VALID_PERIODS).toContain('30d');
  });
});

describe('Example CLI Queries', () => {
  /**
   * These examples mirror the SPARC specification usage examples.
   * They test query building for the primary CLI use cases.
   */

  describe('agentics inspect --last production', () => {
    it('should generate correct query', () => {
      // Simulates: GET /api/v1/runs/last?environment=production
      const { sql, params } = buildLastRunQuery('production');

      expect(sql).toContain('SELECT');
      expect(sql).toContain('run_id');
      expect(sql).toContain('scenario_id');
      expect(sql).toContain('status');
      expect(sql).toContain('completed_at');
      expect(sql).toContain('result_summary');
      expect(sql).toContain(`FROM ${VIEWS.COMPLETED_RUNS}`);
      expect(sql).toContain('environment = $1');
      expect(sql).toContain('ORDER BY completed_at DESC');
      expect(sql).toContain('LIMIT 1');
      expect(params).toEqual(['production']);
    });
  });

  describe('Latest completed runs query', () => {
    it('should generate correct query for dashboard', () => {
      // Simulates fetching recent completed runs for UI
      const { sql, params } = buildRunsListQuery(
        { status: ['completed'] },
        { limit: 10, offset: 0, orderBy: 'completed_at', orderDirection: 'DESC' }
      );

      expect(sql).toContain('status IN ($1)');
      expect(sql).toContain('ORDER BY completed_at DESC');
      expect(sql).toContain('LIMIT 10');
      expect(params).toEqual(['completed']);
    });
  });

  describe('Runs for a given scenario', () => {
    it('should generate correct query', () => {
      // Simulates: GET /api/v1/scenarios/load-test-checkout/runs?status=failed
      const { sql, params } = buildRunsByScenarioQuery(
        'load-test-checkout',
        { status: ['failed'] },
        { limit: 10, offset: 0, orderBy: 'completed_at', orderDirection: 'DESC' }
      );

      expect(sql).toContain('scenario_id = ');
      expect(sql).toContain('status IN');
      expect(params).toContain('load-test-checkout');
      expect(params).toContain('failed');
    });
  });
});
