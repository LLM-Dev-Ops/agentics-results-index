-- Schema for agentics-results-index
-- This creates the tables and views expected by the service

-- Ensure we're in the correct database
-- Run with: psql -h HOST -U USER -d results-index -f schema.sql

-- ============================================================================
-- Tables
-- ============================================================================

-- Scenarios table
CREATE TABLE IF NOT EXISTS scenarios (
    scenario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id VARCHAR(255),
    metadata JSONB
);

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_id UUID REFERENCES scenarios(scenario_id),
    environment VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    result_summary JSONB,
    correlation_id VARCHAR(255),
    metadata JSONB,
    plan_id UUID,
    org_id VARCHAR(255),
    user_id VARCHAR(255)
);

-- Artifacts table
CREATE TABLE IF NOT EXISTS artifacts (
    artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES runs(run_id) ON DELETE CASCADE,
    artifact_type VARCHAR(100) NOT NULL,
    artifact_name VARCHAR(255) NOT NULL,
    storage_url TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_runs_environment ON runs(environment);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_completed_at ON runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_scenario_id ON runs(scenario_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_name ON scenarios(scenario_name);

-- ============================================================================
-- Views (required by the service)
-- ============================================================================

-- v_completed_runs - view for querying completed runs
DROP VIEW IF EXISTS v_completed_runs CASCADE;
CREATE VIEW v_completed_runs AS
SELECT
    r.run_id,
    r.scenario_id,
    r.environment,
    r.status,
    r.created_at,
    r.started_at,
    r.completed_at,
    r.duration_ms,
    r.result_summary,
    r.correlation_id,
    r.metadata
FROM runs r
WHERE r.status IN ('completed', 'failed', 'cancelled', 'timeout')
  AND r.completed_at IS NOT NULL;

-- v_scenario_history - aggregated scenario statistics
DROP VIEW IF EXISTS v_scenario_history CASCADE;
CREATE VIEW v_scenario_history AS
SELECT
    s.scenario_id,
    s.scenario_name,
    COUNT(r.run_id)::TEXT as total_runs,
    COUNT(CASE WHEN r.status = 'completed' THEN 1 END)::TEXT as successful_runs,
    COUNT(CASE WHEN r.status = 'failed' THEN 1 END)::TEXT as failed_runs,
    MAX(r.completed_at) as last_run_at,
    AVG(r.duration_ms)::TEXT as avg_duration_ms
FROM scenarios s
LEFT JOIN runs r ON s.scenario_id = r.scenario_id
GROUP BY s.scenario_id, s.scenario_name;

-- v_artifact_references - view for querying artifacts by run
DROP VIEW IF EXISTS v_artifact_references CASCADE;
CREATE VIEW v_artifact_references AS
SELECT
    a.artifact_id,
    a.run_id,
    a.artifact_type,
    a.artifact_name,
    a.storage_url,
    a.size_bytes::TEXT as size_bytes,
    a.created_at
FROM artifacts a;

-- ============================================================================
-- Sample data for testing (optional - comment out in production)
-- ============================================================================

-- Insert a test scenario
INSERT INTO scenarios (scenario_id, scenario_name, description, org_id)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'health-check-scenario',
    'Test scenario for health check verification',
    'system'
) ON CONFLICT (scenario_id) DO NOTHING;

-- Insert a test run
INSERT INTO runs (run_id, scenario_id, environment, status, started_at, completed_at, duration_ms, result_summary)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'production',
    'completed',
    NOW() - INTERVAL '1 hour',
    NOW(),
    3600000,
    '{"assertions_passed": 10, "assertions_failed": 0}'::jsonb
) ON CONFLICT (run_id) DO NOTHING;

-- Grant read-only access to views (optional, for production)
-- GRANT SELECT ON v_completed_runs TO readonly_user;
-- GRANT SELECT ON v_scenario_history TO readonly_user;
-- GRANT SELECT ON v_artifact_references TO readonly_user;

-- Verify setup
SELECT 'Schema created successfully' as status;
SELECT 'Tables:' as info, count(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT 'Views:' as info, count(*) as count FROM information_schema.views WHERE table_schema = 'public';
