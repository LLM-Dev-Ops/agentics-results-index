# SPARC Specification: agentics-results-index

> A read-only query service for inspecting completed Agentics runs without execution coupling.

**Repository**: `agentics-results-index`
**Version**: 1.0.0
**Status**: Specification
**Last Updated**: 2026-01-12

---

## Table of Contents

1. [Specification](#1-specification)
2. [Pseudocode](#2-pseudocode)
3. [Architecture](#3-architecture)
4. [Refinement](#4-refinement)
5. [Completion](#5-completion)

---

## 1. Specification

### 1.1 Problem Statement

The Agentics CLI (`agentics-cli`) and UI (`agentics-platform`) currently lack a safe, deterministic, read-only mechanism to inspect completed runs. Existing inspection patterns require calling execution services such as `agentics-simulation-engine`, which has caused:

- **Schema contract violations**: Execution services expose internal schemas not designed for read-only consumers
- **Coupling errors**: Inspection logic becomes entangled with execution logic
- **Non-deterministic behavior**: Execution services may trigger side effects during inspection
- **Availability dependencies**: Inspection availability tied to execution service health

### 1.2 Purpose

`agentics-results-index` is a **read-only query service** that exposes inspection and summary capabilities over existing Ruvector Postgres data. It represents the **READ side** of the Agentics CQRS (Command Query Responsibility Segregation) split.

### 1.3 Responsibilities

| ID | Responsibility | Description |
|----|----------------|-------------|
| R1 | **Run Inspection** | Provide read-only access to completed run metadata, status, and results |
| R2 | **Scenario Lookup** | Enable queries by scenario identifier with filtering capabilities |
| R3 | **Environment Filtering** | Support queries scoped to specific environments (production, staging, development) |
| R4 | **Status Filtering** | Allow filtering runs by completion status (completed, failed, cancelled) |
| R5 | **Time-based Queries** | Support temporal queries (last N runs, runs within time range, most recent by criteria) |
| R6 | **Summary Aggregation** | Provide pre-computed summaries for dashboard consumption |
| R7 | **Deterministic Responses** | Return identical results for identical queries against unchanged data |
| R8 | **CLI Support** | Serve as the backend for `agentics inspect` commands |
| R9 | **Dashboard Support** | Expose APIs optimized for UI dashboard rendering |
| R10 | **Demo Support** | Enable deterministic, reproducible demo scenarios |

### 1.4 Non-Responsibilities

| ID | Non-Responsibility | Rationale |
|----|-------------------|-----------|
| NR1 | **Execution Engine** | Execution belongs to `agentics-simulation-engine`; this service never initiates runs |
| NR2 | **Telemetry System** | Telemetry ingestion and processing belongs to dedicated observability infrastructure |
| NR3 | **Storage Owner** | All authoritative data resides in Ruvector Postgres; this service owns no schemas |
| NR4 | **Source of Truth** | Ruvector Postgres is the source of truth; this service is a read-only projection |
| NR5 | **Write Operations** | No INSERT, UPDATE, DELETE, or DDL operations permitted |
| NR6 | **Schema Migration** | Schema evolution owned by Ruvector; this service consumes via views |
| NR7 | **Authentication Provider** | Authentication delegated to platform identity services |
| NR8 | **Run Scheduling** | Scheduling belongs to orchestration services |
| NR9 | **Artifact Storage** | Binary artifacts stored in object storage; this service provides references only |
| NR10 | **Real-time Streaming** | No WebSocket or streaming APIs; polling-based queries only |

### 1.5 Supported Inspection Queries

#### 1.5.1 Query Dimensions

| Dimension | Description | Examples |
|-----------|-------------|----------|
| **Environment** | Deployment environment scope | `production`, `staging`, `development`, `local` |
| **Status** | Run completion status | `completed`, `failed`, `cancelled`, `timeout` |
| **Scenario** | Scenario identifier or pattern | `scenario-123`, `load-test-*`, `regression/*` |
| **Time** | Temporal constraints | `last`, `since`, `before`, `between` |

#### 1.5.2 Supported Query Patterns

```
Q1: Get last N runs for environment
Q2: Get runs by scenario with status filter
Q3: Get runs within time range
Q4: Get most recent run matching criteria
Q5: Get run by ID with full metadata
Q6: Get summary statistics for environment
Q7: Get scenario execution history
Q8: Get runs with specific artifact types
Q9: Get correlation groups for a run
Q10: Get environment health summary
```

### 1.6 Forbidden Behaviors

| ID | Forbidden Behavior | Enforcement |
|----|-------------------|-------------|
| FB1 | **Mutating Ruvector Data** | Database connection uses read-only role; no write permissions |
| FB2 | **Triggering Executions** | No dependencies on execution services; no execution APIs exposed |
| FB3 | **Caching Writes** | Cache is read-through only; no cache invalidation writes to source |
| FB4 | **Schema Modifications** | No DDL permissions; views managed externally |
| FB5 | **Cross-Service Mutations** | No outbound calls that trigger state changes |
| FB6 | **Audit Log Writes** | Audit logging via read-only append to separate audit plane |
| FB7 | **Session State** | Stateless request handling; no server-side session storage |
| FB8 | **Background Jobs** | No background workers that modify state |

---

## 2. Pseudocode

### 2.1 Request Flow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  API Layer  │────▶│ Query Layer │────▶│ Data Access │
│ (CLI / UI)  │◀────│  (HTTP)     │◀────│ (Business)  │◀────│ (Ruvector)  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 2.2 Core Request Handler

```pseudocode
FUNCTION handleInspectionRequest(request: InspectionRequest) -> InspectionResponse:
    // Step 1: Validate request structure
    validationResult = validateRequest(request)
    IF validationResult.hasErrors:
        RETURN ErrorResponse(
            status: 400,
            code: "INVALID_REQUEST",
            errors: validationResult.errors
        )

    // Step 2: Authorize read access
    authResult = authorizeReadAccess(request.context, request.scope)
    IF NOT authResult.permitted:
        RETURN ErrorResponse(
            status: 403,
            code: "ACCESS_DENIED",
            reason: authResult.reason
        )

    // Step 3: Build query from request parameters
    query = buildQuery(request)

    // Step 4: Execute read-only query
    TRY:
        results = executeReadOnlyQuery(query)
    CATCH DatabaseError as e:
        RETURN ErrorResponse(
            status: 503,
            code: "DATA_UNAVAILABLE",
            reason: "Upstream data source temporarily unavailable"
        )

    // Step 5: Transform and return response
    response = transformToResponse(results, request.format)
    RETURN SuccessResponse(
        status: 200,
        data: response,
        metadata: {
            queryTime: elapsed(),
            resultCount: results.count,
            hasMore: results.hasNextPage
        }
    )
```

### 2.3 Query Builder

```pseudocode
FUNCTION buildQuery(request: InspectionRequest) -> Query:
    query = Query.new()

    // Apply environment filter
    IF request.environment IS NOT NULL:
        query.where("environment", "=", request.environment)

    // Apply status filter
    IF request.status IS NOT NULL:
        IF request.status IS Array:
            query.where("status", "IN", request.status)
        ELSE:
            query.where("status", "=", request.status)

    // Apply scenario filter
    IF request.scenario IS NOT NULL:
        IF containsWildcard(request.scenario):
            query.where("scenario_id", "LIKE", toPattern(request.scenario))
        ELSE:
            query.where("scenario_id", "=", request.scenario)

    // Apply time filters
    IF request.timeRange IS NOT NULL:
        IF request.timeRange.type == "last":
            query.orderBy("completed_at", "DESC")
            query.limit(request.timeRange.count)
        ELSE IF request.timeRange.type == "since":
            query.where("completed_at", ">=", request.timeRange.since)
        ELSE IF request.timeRange.type == "before":
            query.where("completed_at", "<=", request.timeRange.before)
        ELSE IF request.timeRange.type == "between":
            query.where("completed_at", ">=", request.timeRange.start)
            query.where("completed_at", "<=", request.timeRange.end)

    // Apply ordering
    IF request.orderBy IS NOT NULL:
        query.orderBy(request.orderBy.field, request.orderBy.direction)
    ELSE:
        query.orderBy("completed_at", "DESC")  // Default: most recent first

    // Apply pagination
    IF request.pagination IS NOT NULL:
        query.offset(request.pagination.offset)
        query.limit(min(request.pagination.limit, MAX_PAGE_SIZE))
    ELSE:
        query.limit(DEFAULT_PAGE_SIZE)

    RETURN query
```

### 2.4 Read-Only Query Execution

```pseudocode
FUNCTION executeReadOnlyQuery(query: Query) -> ResultSet:
    // Acquire read-only connection from pool
    connection = connectionPool.acquireReadOnly()

    // Verify connection is read-only (defense in depth)
    ASSERT connection.isReadOnly() == TRUE

    TRY:
        // Set statement timeout for query safety
        connection.setStatementTimeout(QUERY_TIMEOUT_MS)

        // Execute against read replica or read-only views
        sql = query.toSQL()
        params = query.getParameters()

        // Log query for observability (no sensitive data)
        logQuery(sql, params.count, query.estimatedCost)

        // Execute and return results
        results = connection.execute(sql, params)
        RETURN results

    FINALLY:
        // Always release connection back to pool
        connectionPool.release(connection)
```

### 2.5 Get Last Run by Environment

```pseudocode
FUNCTION getLastRun(environment: String, scenario: String?) -> Run?:
    query = Query.new()
        .select([
            "run_id",
            "scenario_id",
            "environment",
            "status",
            "started_at",
            "completed_at",
            "duration_ms",
            "result_summary"
        ])
        .from("v_completed_runs")  // Read-only view
        .where("environment", "=", environment)
        .where("status", "IN", ["completed", "failed"])
        .orderBy("completed_at", "DESC")
        .limit(1)

    IF scenario IS NOT NULL:
        query.where("scenario_id", "=", scenario)

    results = executeReadOnlyQuery(query)

    IF results.isEmpty():
        RETURN NULL

    RETURN mapToRun(results.first())
```

### 2.6 Get Run Summary Statistics

```pseudocode
FUNCTION getEnvironmentSummary(environment: String, since: Timestamp) -> Summary:
    query = Query.new()
        .select([
            "COUNT(*) as total_runs",
            "COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful",
            "COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed",
            "AVG(duration_ms) as avg_duration_ms",
            "MAX(completed_at) as last_run_at"
        ])
        .from("v_completed_runs")
        .where("environment", "=", environment)
        .where("completed_at", ">=", since)

    results = executeReadOnlyQuery(query)
    row = results.first()

    RETURN Summary {
        environment: environment,
        period: { since: since, until: now() },
        totalRuns: row.total_runs,
        successful: row.successful,
        failed: row.failed,
        successRate: row.successful / row.total_runs,
        avgDurationMs: row.avg_duration_ms,
        lastRunAt: row.last_run_at
    }
```

### 2.7 Forbidden Path Detection

```pseudocode
// This pseudocode shows what the service explicitly DOES NOT implement

FUNCTION executeRun(scenarioId: String) -> FORBIDDEN:
    // NOT IMPLEMENTED - Execution belongs to agentics-simulation-engine
    THROW NotImplementedError("This service does not execute runs")

FUNCTION writeResult(runId: String, result: Result) -> FORBIDDEN:
    // NOT IMPLEMENTED - Write operations are forbidden
    THROW NotImplementedError("This service is read-only")

FUNCTION deleteRun(runId: String) -> FORBIDDEN:
    // NOT IMPLEMENTED - Mutations are forbidden
    THROW NotImplementedError("This service does not mutate data")

FUNCTION invalidateCache(pattern: String) -> FORBIDDEN:
    // NOT IMPLEMENTED - No write-back cache operations
    THROW NotImplementedError("Cache invalidation not supported")
```

---

## 3. Architecture

### 3.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Agentics Ecosystem                               │
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────────────┐ │
│  │ agentics-cli │    │  agentics-   │    │  agentics-simulation-      │ │
│  │              │    │  platform    │    │  engine                    │ │
│  │  (Consumer)  │    │  (Consumer)  │    │  (Write Side - NOT called) │ │
│  └──────┬───────┘    └──────┬───────┘    └────────────────────────────┘ │
│         │                   │                                            │
│         │ READ              │ READ                                       │
│         ▼                   ▼                                            │
│  ┌─────────────────────────────────────┐                                │
│  │      agentics-results-index         │                                │
│  │      (Read-Only Query Service)      │◀── This Service                │
│  └──────────────┬──────────────────────┘                                │
│                 │                                                        │
│                 │ READ-ONLY                                              │
│                 ▼                                                        │
│  ┌─────────────────────────────────────┐                                │
│  │        Ruvector Postgres            │                                │
│  │   (Shared Intelligence Data Plane)  │                                │
│  │                                     │                                │
│  │  - runs                             │                                │
│  │  - scenarios                        │                                │
│  │  - execution_metadata               │                                │
│  │  - artifacts                        │                                │
│  │  - correlations                     │                                │
│  └─────────────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Internal Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      agentics-results-index                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        API Layer                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │  │
│  │  │   /runs     │  │  /scenarios │  │  /summary   │               │  │
│  │  │   Endpoints │  │  Endpoints  │  │  Endpoints  │               │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │  │
│  │         │                │                │                       │  │
│  │  ┌──────┴────────────────┴────────────────┴──────┐               │  │
│  │  │            Request Validation                  │               │  │
│  │  │            Rate Limiting                       │               │  │
│  │  │            Response Formatting                 │               │  │
│  │  └───────────────────┬───────────────────────────┘               │  │
│  └──────────────────────┼───────────────────────────────────────────┘  │
│                         │                                                │
│  ┌──────────────────────┼───────────────────────────────────────────┐  │
│  │                      ▼     Query Layer                            │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │                   Query Builder                              │ │  │
│  │  │  - Filter construction                                       │ │  │
│  │  │  - Sort ordering                                             │ │  │
│  │  │  - Pagination handling                                       │ │  │
│  │  └───────────────────┬─────────────────────────────────────────┘ │  │
│  │                      │                                            │  │
│  │  ┌───────────────────┴─────────────────────────────────────────┐ │  │
│  │  │                   Query Executor                             │ │  │
│  │  │  - Read-only enforcement                                     │ │  │
│  │  │  - Timeout management                                        │ │  │
│  │  │  - Result transformation                                     │ │  │
│  │  └───────────────────┬─────────────────────────────────────────┘ │  │
│  └──────────────────────┼───────────────────────────────────────────┘  │
│                         │                                                │
│  ┌──────────────────────┼───────────────────────────────────────────┐  │
│  │                      ▼     Data Access Layer                      │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │              Read-Only Connection Pool                       │ │  │
│  │  │  - Read replica targeting                                    │ │  │
│  │  │  - Connection health monitoring                              │ │  │
│  │  │  - Read-only transaction mode                                │ │  │
│  │  └───────────────────┬─────────────────────────────────────────┘ │  │
│  │                      │                                            │  │
│  │  ┌───────────────────┴─────────────────────────────────────────┐ │  │
│  │  │              View Abstraction                                │ │  │
│  │  │  - v_completed_runs                                          │ │  │
│  │  │  - v_scenario_history                                        │ │  │
│  │  │  - v_environment_summary                                     │ │  │
│  │  │  - v_artifact_references                                     │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 API Layer Components

| Component | Responsibility | Constraints |
|-----------|---------------|-------------|
| **HTTP Server** | Accept incoming HTTP requests | HTTPS only; no WebSocket |
| **Router** | Route requests to handlers | GET methods only |
| **Validator** | Validate request parameters | Reject invalid inputs early |
| **Rate Limiter** | Throttle excessive requests | Per-client limits |
| **Response Formatter** | Format responses (JSON) | Consistent envelope structure |
| **Error Handler** | Translate errors to HTTP | No internal details leaked |

### 3.4 Query Layer Components

| Component | Responsibility | Constraints |
|-----------|---------------|-------------|
| **Query Builder** | Construct SQL from parameters | Parameterized queries only |
| **Filter Parser** | Parse filter expressions | Allowlist of filterable fields |
| **Sort Handler** | Apply ordering logic | Allowlist of sortable fields |
| **Paginator** | Handle offset/limit | Maximum page size enforced |
| **Query Executor** | Execute against database | Read-only connections only |
| **Result Mapper** | Map rows to domain objects | No lazy loading |

### 3.5 Data Access Layer Components

| Component | Responsibility | Constraints |
|-----------|---------------|-------------|
| **Connection Pool** | Manage database connections | Read-only role connections |
| **View Accessor** | Query through views only | No direct table access |
| **Timeout Manager** | Enforce query timeouts | Hard timeout limits |
| **Health Checker** | Monitor data source health | Read-only health probes |

### 3.6 Integration Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    Integration Boundaries                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INBOUND (Consumers → This Service)                             │
│  ═══════════════════════════════════                            │
│                                                                  │
│  ┌─────────────┐         ┌─────────────────────────────────┐   │
│  │ agentics-   │ ──────▶ │ GET /api/v1/runs                │   │
│  │ cli         │         │ GET /api/v1/runs/:id            │   │
│  │             │         │ GET /api/v1/runs/last           │   │
│  └─────────────┘         │ GET /api/v1/scenarios/:id/runs  │   │
│                          │ GET /api/v1/summary             │   │
│  ┌─────────────┐         │                                 │   │
│  │ agentics-   │ ──────▶ │ (All endpoints are GET-only)   │   │
│  │ platform    │         │ (All responses are JSON)       │   │
│  └─────────────┘         └─────────────────────────────────┘   │
│                                                                  │
│  OUTBOUND (This Service → Dependencies)                         │
│  ═══════════════════════════════════════                        │
│                                                                  │
│  ┌─────────────────────────────────┐         ┌─────────────┐   │
│  │ SELECT queries only             │ ──────▶ │ Ruvector    │   │
│  │ Read-only connection            │         │ Postgres    │   │
│  │ View-based access               │         │ (Read       │   │
│  │ No stored procedure calls       │         │  Replica)   │   │
│  └─────────────────────────────────┘         └─────────────┘   │
│                                                                  │
│  FORBIDDEN INTEGRATIONS                                         │
│  ══════════════════════                                         │
│                                                                  │
│  ✗ agentics-simulation-engine (No execution triggers)          │
│  ✗ Message queues (No event publishing)                        │
│  ✗ External APIs (No outbound HTTP calls)                      │
│  ✗ Object storage (Artifact URLs only, no fetching)            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.7 Data Model (View-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│              Ruvector Postgres Views (Consumed)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  v_completed_runs                                                │
│  ══════════════════                                              │
│  │ run_id: UUID (PK)                                            │
│  │ scenario_id: VARCHAR                                         │
│  │ environment: VARCHAR                                         │
│  │ status: ENUM (completed, failed, cancelled, timeout)         │
│  │ started_at: TIMESTAMP                                        │
│  │ completed_at: TIMESTAMP                                      │
│  │ duration_ms: INTEGER                                         │
│  │ result_summary: JSONB                                        │
│  │ correlation_id: UUID                                         │
│  │ metadata: JSONB                                              │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  v_scenario_history                                              │
│  ══════════════════                                              │
│  │ scenario_id: VARCHAR (PK)                                    │
│  │ scenario_name: VARCHAR                                       │
│  │ total_runs: INTEGER                                          │
│  │ successful_runs: INTEGER                                     │
│  │ failed_runs: INTEGER                                         │
│  │ last_run_at: TIMESTAMP                                       │
│  │ avg_duration_ms: DECIMAL                                     │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  v_environment_summary                                           │
│  ══════════════════════                                          │
│  │ environment: VARCHAR (PK)                                    │
│  │ total_runs_24h: INTEGER                                      │
│  │ success_rate_24h: DECIMAL                                    │
│  │ total_runs_7d: INTEGER                                       │
│  │ success_rate_7d: DECIMAL                                     │
│  │ last_run_at: TIMESTAMP                                       │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  v_artifact_references                                           │
│  ══════════════════════                                          │
│  │ artifact_id: UUID (PK)                                       │
│  │ run_id: UUID (FK)                                            │
│  │ artifact_type: VARCHAR                                       │
│  │ artifact_name: VARCHAR                                       │
│  │ storage_url: VARCHAR                                         │
│  │ size_bytes: BIGINT                                           │
│  │ created_at: TIMESTAMP                                        │
│  └──────────────────────────────────────────────────────────────│
│                                                                  │
│  Note: These views are OWNED by Ruvector, not this service.     │
│  This service has SELECT-only permissions on these views.        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Refinement

### 4.1 Error Handling Strategy

#### 4.1.1 Error Categories

| Category | HTTP Status | Code | User Message | Action |
|----------|-------------|------|--------------|--------|
| **Validation Error** | 400 | `INVALID_REQUEST` | Details of invalid parameters | Return immediately |
| **Not Found** | 404 | `NOT_FOUND` | Resource identifier not found | Return empty result |
| **Access Denied** | 403 | `ACCESS_DENIED` | Permission denied for scope | Log and return |
| **Rate Limited** | 429 | `RATE_LIMITED` | Too many requests | Return retry-after |
| **Data Unavailable** | 503 | `DATA_UNAVAILABLE` | Upstream temporarily unavailable | Retry with backoff |
| **Query Timeout** | 504 | `QUERY_TIMEOUT` | Query exceeded time limit | Suggest narrower scope |
| **Internal Error** | 500 | `INTERNAL_ERROR` | Unexpected error occurred | Log details internally |

#### 4.1.2 Error Response Format

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human-readable error description",
    "details": [
      {
        "field": "environment",
        "issue": "Invalid environment value",
        "allowed": ["production", "staging", "development"]
      }
    ],
    "requestId": "req-abc123",
    "timestamp": "2026-01-12T10:30:00Z"
  }
}
```

#### 4.1.3 Error Handling Rules

1. **Never expose internal details**: Stack traces, SQL queries, and internal paths must not appear in responses
2. **Always include request ID**: Every error response includes a request ID for correlation
3. **Fail fast on validation**: Return 400 before executing any queries
4. **Graceful degradation**: If summaries are unavailable, individual queries may still succeed
5. **Consistent envelope**: All errors use the same JSON structure

### 4.2 Performance Considerations

#### 4.2.1 Query Performance

| Optimization | Implementation | Target |
|--------------|----------------|--------|
| **Index utilization** | Queries designed to use existing Ruvector indexes | All queries use indexes |
| **Result limiting** | Maximum page size enforced | Max 100 results per page |
| **Query timeout** | Hard timeout on all queries | 30 second maximum |
| **Connection pooling** | Pooled read-only connections | Pool size: 10-50 |
| **View-based access** | Pre-computed views for common queries | Sub-second response |

#### 4.2.2 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Read-Through Cache                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Cache Layer: In-memory (local process)                         │
│  Cache Type: Read-through only (NO write-back)                  │
│  TTL: 60 seconds (short, as data changes)                       │
│  Invalidation: Time-based only (no event-driven invalidation)   │
│                                                                  │
│  Cached Queries:                                                 │
│  ├── Environment summaries (high hit rate)                      │
│  ├── Scenario metadata (rarely changes)                         │
│  └── Recent run lists (per environment)                         │
│                                                                  │
│  NOT Cached:                                                     │
│  ├── Individual run details (low hit rate)                      │
│  ├── Time-range queries (too variable)                          │
│  └── Full-text searches (unbounded keyspace)                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.2.3 Performance Targets

| Metric | Target | P99 Target |
|--------|--------|------------|
| List queries (paginated) | < 200ms | < 500ms |
| Single run lookup | < 100ms | < 300ms |
| Summary aggregations | < 300ms | < 1000ms |
| Cache hit latency | < 10ms | < 50ms |

### 4.3 Read-Only Enforcement

#### 4.3.1 Multi-Layer Enforcement

```
┌─────────────────────────────────────────────────────────────────┐
│                 Read-Only Enforcement Layers                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Database Role                                          │
│  ═════════════════════                                           │
│  • Database user has SELECT-only permissions                    │
│  • No INSERT, UPDATE, DELETE, DDL permissions                   │
│  • Enforced at PostgreSQL role level                            │
│                                                                  │
│  Layer 2: Connection Configuration                               │
│  ═══════════════════════════════                                │
│  • Connection string specifies read-only mode                   │
│  • SET TRANSACTION READ ONLY on connection acquisition          │
│  • Connection pool validates read-only state                    │
│                                                                  │
│  Layer 3: Query Validation                                       │
│  ═════════════════════════                                       │
│  • Query builder only generates SELECT statements               │
│  • SQL parser rejects non-SELECT queries                        │
│  • No raw SQL execution permitted                               │
│                                                                  │
│  Layer 4: API Design                                             │
│  ════════════════════                                            │
│  • HTTP handlers only accept GET methods                        │
│  • No POST, PUT, PATCH, DELETE endpoints exist                  │
│  • Request bodies ignored (GET has no body)                     │
│                                                                  │
│  Layer 5: Code Review                                            │
│  ═════════════════════                                           │
│  • Linting rules flag write operations                          │
│  • PR reviews verify read-only compliance                       │
│  • Integration tests verify no mutations                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.3.2 Read-Only Verification Tests

```pseudocode
TEST "Database connection is read-only":
    connection = connectionPool.acquire()

    // Verify transaction mode
    ASSERT connection.getTransactionMode() == READ_ONLY

    // Attempt write should fail
    TRY:
        connection.execute("INSERT INTO runs VALUES (...)")
        FAIL("Write operation should have been rejected")
    CATCH PermissionDenied:
        PASS("Write correctly rejected")

TEST "API rejects non-GET methods":
    FOR method IN [POST, PUT, PATCH, DELETE]:
        response = httpClient.request(method, "/api/v1/runs")
        ASSERT response.status == 405
        ASSERT response.headers["Allow"] == "GET"

TEST "Query builder only produces SELECT":
    builder = QueryBuilder.new()
    FOR operation IN allSupportedOperations():
        sql = builder.build(operation)
        ASSERT sql.startsWith("SELECT")
        ASSERT NOT sql.contains("INSERT")
        ASSERT NOT sql.contains("UPDATE")
        ASSERT NOT sql.contains("DELETE")
```

### 4.4 Schema Evolution Strategy

#### 4.4.1 View-Based Abstraction

```
┌─────────────────────────────────────────────────────────────────┐
│               Schema Evolution via Views                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Principle: This service NEVER directly accesses tables.        │
│  All access is through versioned views owned by Ruvector.       │
│                                                                  │
│  ┌──────────────────────┐     ┌──────────────────────┐         │
│  │ Ruvector Tables      │     │ Ruvector Views       │         │
│  │ (Source of Truth)    │────▶│ (Stable Interface)   │         │
│  │                      │     │                      │         │
│  │ runs                 │     │ v_completed_runs     │         │
│  │ scenarios            │     │ v_scenario_history   │         │
│  │ execution_metadata   │     │ v_environment_summary│         │
│  │ artifacts            │     │ v_artifact_references│         │
│  │ correlations         │     │                      │         │
│  └──────────────────────┘     └──────────┬───────────┘         │
│                                          │                      │
│                                          │ SELECT-only          │
│                                          ▼                      │
│                               ┌──────────────────────┐         │
│                               │ agentics-results-    │         │
│                               │ index                │         │
│                               │ (This Service)       │         │
│                               └──────────────────────┘         │
│                                                                  │
│  Benefits:                                                       │
│  • Table schema changes don't break this service               │
│  • Views can be versioned (v1_completed_runs, v2_completed_runs)│
│  • Column additions are transparent                             │
│  • Column removals handled via view updates                     │
│  • This service has zero schema migration responsibility        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.4.2 Handling Schema Changes

| Change Type | Ruvector Action | This Service Action |
|-------------|-----------------|---------------------|
| Column added | Add to view if needed | No change (new columns ignored unless used) |
| Column removed | Update view to exclude | No change if using view |
| Column renamed | View aliases old name | No change if view maintains interface |
| Table split | Views abstract join | No change |
| New table | Create new view | Add new endpoint if relevant |
| Type change | View casts to expected type | May need query update |

#### 4.4.3 Version Compatibility

```pseudocode
// Service queries against view version it understands
CONST SUPPORTED_VIEW_VERSIONS = {
    "v_completed_runs": ["v1", "v2"],
    "v_scenario_history": ["v1"],
    "v_environment_summary": ["v1"],
    "v_artifact_references": ["v1"]
}

FUNCTION checkViewCompatibility():
    FOR viewName, supportedVersions IN SUPPORTED_VIEW_VERSIONS:
        availableVersion = getViewVersion(viewName)
        IF availableVersion NOT IN supportedVersions:
            LOG.warn("View version mismatch", {
                view: viewName,
                available: availableVersion,
                supported: supportedVersions
            })
            // Degrade gracefully - disable endpoints using this view
            disableEndpointsUsing(viewName)
```

---

## 5. Completion

### 5.1 Minimal Viable API Surface

#### 5.1.1 Endpoints

| Method | Path | Description | Priority |
|--------|------|-------------|----------|
| GET | `/api/v1/runs` | List runs with filters | P0 (MVP) |
| GET | `/api/v1/runs/:id` | Get run by ID | P0 (MVP) |
| GET | `/api/v1/runs/last` | Get most recent run | P0 (MVP) |
| GET | `/api/v1/scenarios/:id/runs` | Get runs for scenario | P0 (MVP) |
| GET | `/api/v1/summary` | Get environment summary | P0 (MVP) |
| GET | `/api/v1/health` | Health check endpoint | P0 (MVP) |
| GET | `/api/v1/scenarios` | List scenarios | P1 |
| GET | `/api/v1/runs/:id/artifacts` | Get artifact references | P1 |
| GET | `/api/v1/correlations/:id` | Get correlation group | P2 |

#### 5.1.2 MVP Query Parameters

| Endpoint | Parameter | Type | Description |
|----------|-----------|------|-------------|
| `/runs` | `environment` | string | Filter by environment |
| `/runs` | `status` | string[] | Filter by status(es) |
| `/runs` | `scenario` | string | Filter by scenario (supports wildcards) |
| `/runs` | `since` | ISO8601 | Runs completed after timestamp |
| `/runs` | `before` | ISO8601 | Runs completed before timestamp |
| `/runs` | `limit` | integer | Max results (default: 20, max: 100) |
| `/runs` | `offset` | integer | Pagination offset |
| `/runs` | `order` | string | Sort order (default: `-completed_at`) |
| `/runs/last` | `environment` | string | Required: environment to query |
| `/runs/last` | `scenario` | string | Optional: specific scenario |
| `/summary` | `environment` | string | Required: environment to summarize |
| `/summary` | `period` | string | Time period (`24h`, `7d`, `30d`) |

### 5.2 Success Criteria

#### 5.2.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| SC1 | `agentics inspect --last production` returns correct run | Integration test |
| SC2 | UI dashboard loads summary in < 1 second | Performance test |
| SC3 | Queries return deterministic results | Repeated query test |
| SC4 | No mutations occur to Ruvector data | Audit log verification |
| SC5 | Service operates without `agentics-simulation-engine` | Isolation test |
| SC6 | All endpoints return valid JSON responses | Schema validation |
| SC7 | Errors include request IDs for debugging | Error response test |
| SC8 | Pagination works correctly for large result sets | Boundary test |

#### 5.2.2 Non-Functional Criteria

| ID | Criterion | Target | Verification |
|----|-----------|--------|--------------|
| NF1 | Availability | 99.9% uptime | Monitoring |
| NF2 | Latency (P50) | < 100ms | APM metrics |
| NF3 | Latency (P99) | < 500ms | APM metrics |
| NF4 | Throughput | 1000 req/sec | Load test |
| NF5 | Error rate | < 0.1% | Monitoring |
| NF6 | Memory footprint | < 512MB | Resource monitoring |
| NF7 | Startup time | < 10 seconds | Deployment verification |

### 5.3 Usage Examples

#### 5.3.1 Valid Usage Examples

**Example 1: CLI inspects last production run**
```bash
# User command
agentics inspect --last production

# Service receives
GET /api/v1/runs/last?environment=production

# Service returns
{
  "data": {
    "run_id": "run-abc123",
    "scenario_id": "scenario-xyz",
    "environment": "production",
    "status": "completed",
    "completed_at": "2026-01-12T10:00:00Z",
    "duration_ms": 45000,
    "result_summary": { "assertions_passed": 100, "assertions_failed": 0 }
  }
}
```

**Example 2: UI loads dashboard summary**
```bash
# Dashboard request
GET /api/v1/summary?environment=production&period=24h

# Service returns
{
  "data": {
    "environment": "production",
    "period": { "since": "2026-01-11T10:30:00Z", "until": "2026-01-12T10:30:00Z" },
    "total_runs": 48,
    "successful": 46,
    "failed": 2,
    "success_rate": 0.958,
    "avg_duration_ms": 42500,
    "last_run_at": "2026-01-12T10:00:00Z"
  }
}
```

**Example 3: Query runs by scenario with status filter**
```bash
# Request
GET /api/v1/scenarios/load-test-checkout/runs?status=failed&limit=10

# Service returns
{
  "data": [
    { "run_id": "run-001", "status": "failed", "completed_at": "..." },
    { "run_id": "run-002", "status": "failed", "completed_at": "..." }
  ],
  "pagination": { "offset": 0, "limit": 10, "total": 2 }
}
```

**Example 4: Time-range query**
```bash
# Request
GET /api/v1/runs?environment=staging&since=2026-01-10T00:00:00Z&before=2026-01-12T00:00:00Z

# Service returns
{
  "data": [ /* runs within time range */ ],
  "pagination": { "offset": 0, "limit": 20, "total": 156 }
}
```

#### 5.3.2 Invalid Usage Examples

**Invalid Example 1: Attempt to trigger execution**
```bash
# Invalid request - POST method not allowed
POST /api/v1/runs
{ "scenario_id": "scenario-xyz", "environment": "production" }

# Service returns
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "This service is read-only. Use agentics-simulation-engine for execution.",
    "requestId": "req-123"
  }
}
# HTTP Status: 405 Method Not Allowed
```

**Invalid Example 2: Attempt to delete a run**
```bash
# Invalid request - DELETE method not allowed
DELETE /api/v1/runs/run-abc123

# Service returns
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "This service is read-only. Deletion is not supported.",
    "requestId": "req-456"
  }
}
# HTTP Status: 405 Method Not Allowed
```

**Invalid Example 3: Attempt to update run status**
```bash
# Invalid request - PATCH method not allowed
PATCH /api/v1/runs/run-abc123
{ "status": "cancelled" }

# Service returns
{
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "This service is read-only. Mutations are not supported.",
    "requestId": "req-789"
  }
}
# HTTP Status: 405 Method Not Allowed
```

**Invalid Example 4: Query for in-progress runs**
```bash
# Invalid request - this service only exposes completed runs
GET /api/v1/runs?status=running

# Service returns
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Status 'running' is not supported. This service only indexes completed runs.",
    "details": [
      { "field": "status", "allowed": ["completed", "failed", "cancelled", "timeout"] }
    ],
    "requestId": "req-012"
  }
}
# HTTP Status: 400 Bad Request
```

**Invalid Example 5: Request to write cache**
```bash
# Invalid request - no cache control endpoints
POST /api/v1/cache/invalidate
{ "pattern": "production:*" }

# Service returns
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found",
    "requestId": "req-345"
  }
}
# HTTP Status: 404 Not Found
```

### 5.4 Deployment Verification Checklist

```
Pre-Deployment:
[ ] Database role has SELECT-only permissions verified
[ ] Connection string uses read replica endpoint
[ ] Views exist and are accessible
[ ] Health endpoint returns 200
[ ] All integration tests pass

Post-Deployment:
[ ] Health check endpoint accessible
[ ] Sample query returns expected results
[ ] No write operations in database audit logs
[ ] Latency within targets (P50 < 100ms, P99 < 500ms)
[ ] Error rate < 0.1%
[ ] CLI `agentics inspect --last production` works
[ ] UI dashboard loads successfully
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **CQRS** | Command Query Responsibility Segregation - pattern separating read and write operations |
| **Ruvector** | Shared PostgreSQL data plane in the Agentics ecosystem |
| **Run** | A single execution of a scenario |
| **Scenario** | A defined test or simulation configuration |
| **View** | PostgreSQL view providing stable read interface over tables |
| **Read Replica** | Database replica optimized for read operations |

## Appendix B: Related Documents

| Document | Location | Description |
|----------|----------|-------------|
| Ruvector Schema | `ruvector-postgres/schemas/` | Authoritative table schemas |
| CLI Specification | `agentics-cli/docs/` | CLI command specifications |
| Platform API | `agentics-platform/api/` | Platform API documentation |
| Simulation Engine | `agentics-simulation-engine/` | Execution service (write side) |

---

*End of SPARC Specification*
