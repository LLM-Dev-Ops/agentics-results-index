<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Cloud%20Run-Deployed-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white" alt="Cloud Run" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="MIT License" />
</p>

<h1 align="center">Agentics Results Index</h1>

<p align="center">
  <strong>Contract-aligned query and ingestion service for completed Agentics simulation runs.</strong><br/>
  Read-only by default. Every response conforms to the <code>SimulationExecutionResult</code> contract from <code>agentics-contracts</code>.
</p>

---

## Overview

**agentics-results-index** is a hardened, read-only HTTP service that indexes and serves completed simulation execution results. It provides parameterized query access to run data stored in PostgreSQL, with full contract validation, ADR-004 dual ID resolution, and NULL-safe query execution throughout.

The service enforces read-only access at multiple layers: connection configuration, session-level transactions, and query validation — ensuring it can never mutate the underlying data store.

---

## API Reference

All endpoints are served under the `/api/v1` prefix.

<details>
<summary><strong>GET</strong> <code>/api/v1/health</code> &mdash; Health check</summary>

Returns service health status including database connectivity and event bus state.

**Response `200`**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-16T03:46:45.085Z",
  "checks": { "database": "ok", "eventBus": "ok" },
  "eventSubscriptions": {
    "execution_completed": ["store-run-metadata", "index-artifacts"]
  }
}
```

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/results/latest</code> &mdash; Most recently indexed run</summary>

Returns the single most recent run across all environments. No query parameters required.

**Response `200`** &mdash; Run found

```json
{
  "data": { "...SimulationExecutionResult" },
  "metadata": { "requestId": "uuid" }
}
```

**Response `200`** &mdash; No runs indexed

```json
{
  "found": false,
  "message": "No runs indexed yet"
}
```

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/runs</code> &mdash; List runs with filters</summary>

Paginated list of runs with optional filtering.

| Parameter     | Type     | Default          | Description                                        |
|---------------|----------|------------------|----------------------------------------------------|
| `environment` | `string` | &mdash;          | `production`, `staging`, `development`, or `local`  |
| `status`      | `string` | &mdash;          | Comma-separated: `completed`, `failed`, `cancelled`, `timeout` |
| `scenario`    | `string` | &mdash;          | Scenario ID (supports `*` wildcards)               |
| `since`       | `string` | &mdash;          | ISO 8601 datetime lower bound                      |
| `before`      | `string` | &mdash;          | ISO 8601 datetime upper bound                      |
| `limit`       | `number` | `20`             | Page size (max `100`)                              |
| `offset`      | `number` | `0`              | Pagination offset                                  |
| `order`       | `string` | `-completed_at`  | Sort field; prefix `-` for descending              |

**Response `200`**

```json
{
  "data": [ "...SimulationExecutionResult[]" ],
  "pagination": { "offset": 0, "limit": 20, "total": 42 },
  "metadata": { "queryTimeMs": 12, "requestId": "uuid" }
}
```

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/runs/last</code> &mdash; Most recent run for an environment</summary>

Returns the latest run for a specific environment.

| Parameter     | Type     | Required | Description            |
|---------------|----------|----------|------------------------|
| `environment` | `string` | Yes      | Target environment     |
| `scenario`    | `string` | No       | Filter by scenario ID  |

**Response `200`**

```json
{
  "data": { "...SimulationExecutionResult" },
  "metadata": { "requestId": "uuid" }
}
```

Returns `{ "data": null }` when no matching run exists.

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/runs/:id</code> &mdash; Single run by ID</summary>

Supports ADR-004 dual resolution:

| ID Format   | Lookup Strategy                                          |
|-------------|----------------------------------------------------------|
| `exec-*`    | Canonical lookup by `execution_id` in metadata JSONB     |
| `sim-*`     | Lookup by `simulation_id` with reverse-lookup fallback   |
| UUID        | Legacy lookup by `run_id`                                |

**Response `200`**

```json
{
  "data": { "...SimulationExecutionResult" },
  "metadata": { "requestId": "uuid" }
}
```

**Response `404`** &mdash; Run not found

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/runs/:id/artifacts</code> &mdash; Artifact references for a run</summary>

Returns storage URLs for artifacts associated with a run. Does not fetch artifact content.

**Response `200`**

```json
{
  "data": [
    {
      "artifact_id": "uuid",
      "run_id": "uuid",
      "artifact_type": "log",
      "artifact_name": "execution.log",
      "storage_url": "gs://bucket/path",
      "size_bytes": 1024,
      "created_at": "2026-01-14T00:05:55.608Z"
    }
  ],
  "metadata": { "queryTimeMs": 5, "requestId": "uuid" }
}
```

</details>

<details>
<summary><strong>POST</strong> <code>/api/v1/runs</code> &mdash; Ingest a result packet</summary>

Ingests a contract-compliant `SimulationExecutionResult` into the index. The payload is validated against `agentics-contracts` schemas before storage.

**Request body:** `SimulationExecutionResult` (JSON)

**Response `201`** &mdash; Successfully indexed

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/scenarios</code> &mdash; List scenarios</summary>

Paginated list of scenarios with aggregated run statistics.

**Response `200`**

```json
{
  "data": [
    {
      "scenario_id": "uuid",
      "scenario_name": "checkout-flow",
      "total_runs": 150,
      "successful_runs": 142,
      "failed_runs": 8,
      "last_run_at": "2026-02-16T03:00:00.000Z",
      "avg_duration_ms": 4500.5
    }
  ],
  "pagination": { "offset": 0, "limit": 20, "total": 5 }
}
```

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/scenarios/:id</code> &mdash; Scenario details</summary>

Returns aggregated statistics for a single scenario.

**Response `200`** | **Response `404`**

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/scenarios/:id/runs</code> &mdash; Runs for a scenario</summary>

Same filter parameters as `GET /api/v1/runs`, scoped to a specific scenario.

</details>

<details>
<summary><strong>GET</strong> <code>/api/v1/summary</code> &mdash; Environment summary statistics</summary>

| Parameter     | Type     | Required | Description                         |
|---------------|----------|----------|-------------------------------------|
| `environment` | `string` | Yes      | Target environment                  |
| `period`      | `string` | No       | `24h`, `7d`, or `30d` (default `7d`)|

**Response `200`**

```json
{
  "environment": "production",
  "period": { "since": "...", "until": "..." },
  "total_runs": 320,
  "successful": 310,
  "failed": 10,
  "success_rate": 0.96875,
  "avg_duration_ms": 4200.5,
  "last_run_at": "2026-02-16T03:00:00.000Z"
}
```

</details>

---

## Contract Shape

All single-run responses conform to the `SimulationExecutionResult` schema:

```typescript
interface SimulationExecutionResult {
  run_id: string;
  scenario_id: string;
  execution_id: string;
  simulation_id: string;
  environment: "production" | "staging" | "development" | "local";
  status: "completed" | "failed" | "cancelled" | "timeout";
  execution_metadata: {
    execution_id: string;
    proof_hash: string;
    layers_executed: string[];
    schema_version: string;
    environment: string;
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
  executionProof: {
    proof_hash: string;
    layerRecords: LayerRecord[];
    generated_at: string;
  };
  result_summary: {
    assertions_passed: number;
    assertions_failed: number;
    total_layers: number;
    mandatory_layers_complete: boolean;
  };
  correlation_id: string | null;
}
```

Legacy runs missing canonical metadata fields are automatically transformed with synthetic values at query time.

---

## Project Structure

```
src/
  api/
    routes.ts                 # Route definitions
    handlers/
      runs.ts                 # /runs and /results endpoints
      scenarios.ts            # /scenarios endpoints
      summary.ts              # /summary endpoint
      health.ts               # /health endpoint
      ingest.ts               # POST /runs ingestion
    middleware/
      validation.ts           # Zod schema validation
      error-handler.ts        # Error responses & 405 handler
  data/
    repository.ts             # Query execution & row mapping
    pool.ts                   # Read-only connection pool
    write-pool.ts             # Write pool for ingestion
  query/
    builder.ts                # Parameterized SQL generation
  contracts/
    index.ts                  # Re-exports from agentics-contracts
    transform.ts              # Legacy-to-canonical transformation
    validation.ts             # Contract validation
    observability.ts          # Structured logging
  events/
    index.ts                  # EventBus infrastructure
    register.ts               # Subscriber registration
    subscribers/              # Async event handlers
  types/                      # Domain type definitions
  config.ts                   # Environment configuration
  server.ts                   # Express app setup
  index.ts                    # Entry point
scripts/
  deploy.sh                   # Cloud Run deployment
  schema.sql                  # PostgreSQL schema & views
  init-db.sh                  # Database initialization
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **PostgreSQL** 14+ with the required schema applied
- **Google Cloud SDK** (for deployment only)

### Local Development

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials

# Apply database schema
psql -h localhost -U postgres -d results-index -f scripts/schema.sql

# Start in development mode
npm run dev
```

### Available Scripts

| Command            | Description                          |
|--------------------|--------------------------------------|
| `npm run dev`      | Start with ts-node (hot reload)      |
| `npm run build`    | Compile TypeScript to `dist/`        |
| `npm start`        | Run compiled output                  |
| `npm test`         | Run Jest test suite                  |
| `npm run typecheck`| Type-check without emitting          |
| `npm run lint`     | Lint source with ESLint              |

---

## Configuration

All configuration is loaded from environment variables. No secrets are embedded in source.

<details>
<summary><strong>Environment Variables</strong></summary>

| Variable                  | Default         | Description                              |
|---------------------------|-----------------|------------------------------------------|
| `PORT`                    | `3000`          | HTTP listen port                         |
| `HOST`                    | `0.0.0.0`       | Bind address                             |
| `NODE_ENV`                | `development`   | Runtime environment                      |
| `LOG_LEVEL`               | `info`          | Logging verbosity                        |
| `RESULTS_DB_HOST`         | `localhost`     | PostgreSQL host (alias: `RUVECTOR_DB_HOST`) |
| `RESULTS_DB_PORT`         | `5432`          | PostgreSQL port (alias: `RUVECTOR_DB_PORT`) |
| `RESULTS_DB_NAME`         | `results-index` | Database name (alias: `RUVECTOR_DB_NAME`)   |
| `RESULTS_DB_USER`         | `postgres`      | Database user (alias: `RUVECTOR_DB_USER`)   |
| `RESULTS_DB_PASSWORD`     | &mdash;         | Database password (alias: `RUVECTOR_DB_PASSWORD`) |
| `RESULTS_DB_SSL`          | `false`         | Enable SSL connections                   |
| `INSTANCE_UNIX_SOCKET`    | &mdash;         | Cloud SQL Unix socket path               |
| `DB_POOL_MIN`             | `2`             | Minimum connection pool size             |
| `DB_POOL_MAX`             | `10`            | Maximum connection pool size             |
| `DB_STATEMENT_TIMEOUT_MS` | `30000`         | Per-query timeout                        |
| `QUERY_DEFAULT_PAGE_SIZE` | `20`            | Default pagination limit                 |
| `QUERY_MAX_PAGE_SIZE`     | `100`           | Maximum pagination limit                 |
| `QUERY_TIMEOUT_MS`        | `30000`         | Query timeout                            |

</details>

---

## Deployment

The service is deployed to **Google Cloud Run** in the `agentics-dev` project (`us-central1`).

### Build & Deploy

```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud config set project agentics-dev

# Build container image
gcloud builds submit \
  --tag gcr.io/agentics-dev/agentics-results-index:latest .

# Deploy to Cloud Run
gcloud run deploy agentics-results-index \
  --image gcr.io/agentics-dev/agentics-results-index:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances agentics-dev:us-central1:ruvector-postgres \
  --set-env-vars "NODE_ENV=production,INSTANCE_UNIX_SOCKET=/cloudsql/agentics-dev:us-central1:ruvector-postgres" \
  --update-secrets "RESULTS_DB_HOST=RUVECTOR_DB_HOST:latest,RESULTS_DB_PORT=RUVECTOR_DB_PORT:latest,RESULTS_DB_NAME=RUVECTOR_DB_NAME:latest,RESULTS_DB_USER=RUVECTOR_DB_USER:latest,RESULTS_DB_PASSWORD=RUVECTOR_DB_PASSWORD:latest"
```

Database credentials are injected at runtime from **Google Secret Manager** — no secrets are stored in code, images, or environment variable literals.

### Database Schema

```bash
# Apply schema to Cloud SQL
psql -h 34.171.232.21 -U postgres -d results-index -f scripts/schema.sql
```

The service requires three PostgreSQL views:

| View                    | Purpose                            |
|-------------------------|------------------------------------|
| `v_completed_runs`      | Terminal-state runs with timestamps |
| `v_scenario_history`    | Aggregated scenario statistics     |
| `v_artifact_references` | Artifact metadata by run           |

---

## Security Model

| Layer              | Enforcement                                                      |
|--------------------|------------------------------------------------------------------|
| **Connection**     | `default_transaction_read_only=on` in pool config                |
| **Session**        | `SET TRANSACTION READ ONLY` on every connection                  |
| **Query**          | Only `SELECT` allowed; `INSERT`, `UPDATE`, `DELETE`, DDL blocked |
| **Statement**      | Per-query timeout prevents runaway execution                     |
| **Parameterization** | All queries use positional `$N` parameters — no string interpolation |
| **NULL-safety**    | All JSONB access uses `COALESCE` to prevent crashes              |
| **Secrets**        | Injected via Google Secret Manager `secretKeyRef`, never in source |

---

## License

[MIT](LICENSE)
