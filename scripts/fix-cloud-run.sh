#!/bin/bash
# Quick fix for Cloud Run database connectivity
#
# This script provides the exact gcloud commands needed to fix the service.
# Run these commands from Cloud Shell or any authenticated gcloud environment.
#
# Usage: Copy and paste the commands below, or run this script directly.

echo "=== Fix agentics-results-index Cloud Run Service ==="
echo ""
echo "Run these commands in Google Cloud Shell or an authenticated environment:"
echo ""

cat << 'COMMANDS'
# Step 1: Create the database on Cloud SQL (if not exists)
gcloud sql databases create results-index \
  --instance=ruvector-postgres \
  --project=agentics-dev \
  2>/dev/null || echo "Database already exists"

# Step 2: Connect to Cloud SQL and create schema
# Option A: Use Cloud Shell SQL button in Console
# Option B: Use this command to connect:
gcloud sql connect ruvector-postgres --user=postgres --project=agentics-dev
# Then paste the contents of scripts/schema.sql

# Step 3: Update Cloud Run with environment variables
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

# Step 4: Verify the fix
curl https://agentics-results-index-1062287243982.us-central1.run.app/api/v1/health
# Should return: {"status":"healthy","checks":{"database":"ok"}}
COMMANDS

echo ""
echo "=== Alternative: Build and Deploy from scratch ==="
echo ""

cat << 'DEPLOY'
# If you need to rebuild and deploy:
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
DEPLOY
