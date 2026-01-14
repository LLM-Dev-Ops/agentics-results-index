# Deployment Guide: agentics-results-index

## Quick Fix for Database Connectivity

The service is currently returning `{"status":"degraded","checks":{"database":"error"}}` because:
1. The database `results-index` may not exist on Cloud SQL
2. The required schema (tables/views) may not be created
3. Cloud Run may not have the correct environment variables

## Step 1: Create Database and Schema

### Option A: Using Cloud Shell (Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Open Cloud Shell (top right icon)
3. Connect to Cloud SQL:
   ```bash
   gcloud sql connect ruvector-postgres --user=postgres --project=agentics-dev
   ```
4. When prompted, enter password: `7yekrYmmMj74Te26!`
5. Create the database:
   ```sql
   CREATE DATABASE "results-index";
   \c results-index
   ```
6. Copy and paste the contents of `scripts/schema.sql`

### Option B: Using Cloud SQL Studio

1. Go to [Cloud SQL in Console](https://console.cloud.google.com/sql/instances/ruvector-postgres/overview?project=agentics-dev)
2. Click "Cloud SQL Studio" in the left sidebar
3. Select database: `postgres`, user: `postgres`
4. First create the database:
   ```sql
   CREATE DATABASE "results-index";
   ```
5. Reconnect and select `results-index` database
6. Run the SQL from `scripts/schema.sql`

## Step 2: Update Cloud Run Environment Variables

Run this command in Cloud Shell:

```bash
gcloud run services update agentics-results-index \
  --platform managed \
  --region us-central1 \
  --project agentics-dev \
  --add-cloudsql-instances agentics-dev:us-central1:ruvector-postgres \
  --set-env-vars "\
RESULTS_DB_HOST=34.171.232.21,\
RESULTS_DB_PORT=5432,\
RESULTS_DB_NAME=results-index,\
RESULTS_DB_USER=postgres,\
RESULTS_DB_PASSWORD=7yekrYmmMj74Te26!,\
INSTANCE_UNIX_SOCKET=/cloudsql/agentics-dev:us-central1:ruvector-postgres,\
PORT=8080,\
NODE_ENV=production"
```

## Step 3: Verify the Fix

```bash
curl https://agentics-results-index-1062287243982.us-central1.run.app/api/v1/health
```

Expected response:
```json
{"status":"healthy","timestamp":"...","checks":{"database":"ok"}}
```

## Full Redeploy (if needed)

If the service needs to be rebuilt and redeployed:

```bash
# Clone the repo
git clone <repo-url>
cd agentics-results-index

# Build and deploy
gcloud builds submit \
  --tag gcr.io/agentics-dev/agentics-results-index \
  --project agentics-dev

gcloud run deploy agentics-results-index \
  --image gcr.io/agentics-dev/agentics-results-index \
  --platform managed \
  --region us-central1 \
  --project agentics-dev \
  --allow-unauthenticated \
  --add-cloudsql-instances agentics-dev:us-central1:ruvector-postgres \
  --set-env-vars "\
RESULTS_DB_HOST=34.171.232.21,\
RESULTS_DB_PORT=5432,\
RESULTS_DB_NAME=results-index,\
RESULTS_DB_USER=postgres,\
RESULTS_DB_PASSWORD=7yekrYmmMj74Te26!,\
INSTANCE_UNIX_SOCKET=/cloudsql/agentics-dev:us-central1:ruvector-postgres,\
PORT=8080,\
NODE_ENV=production"
```

## Environment Variables Reference

| Variable | Value | Description |
|----------|-------|-------------|
| `RESULTS_DB_HOST` | `34.171.232.21` | Cloud SQL public IP |
| `RESULTS_DB_PORT` | `5432` | PostgreSQL port |
| `RESULTS_DB_NAME` | `results-index` | Database name |
| `RESULTS_DB_USER` | `postgres` | Database user |
| `RESULTS_DB_PASSWORD` | `7yekrYmmMj74Te26!` | Database password |
| `INSTANCE_UNIX_SOCKET` | `/cloudsql/agentics-dev:us-central1:ruvector-postgres` | Cloud SQL socket path |
| `PORT` | `8080` | Service port |
| `NODE_ENV` | `production` | Environment |

## Database Schema

The service expects these views:
- `v_completed_runs` - Completed run data
- `v_scenario_history` - Scenario statistics
- `v_artifact_references` - Artifact metadata

See `scripts/schema.sql` for the complete schema including tables and views.

## Troubleshooting

### "database error" in health check
1. Verify the database exists: `\l` in psql should show `results-index`
2. Verify the views exist: `\dv` should show the 3 views
3. Check Cloud Run logs for connection errors

### "Connection refused" errors
1. Ensure Cloud SQL has a public IP or the Unix socket is configured
2. Verify the Cloud Run service has `--add-cloudsql-instances` configured
3. Check that the `INSTANCE_UNIX_SOCKET` environment variable is set

### "Permission denied" errors
1. Ensure the `postgres` user has access to the `results-index` database
2. The service uses read-only connections, so only SELECT permissions are needed on views
