#!/bin/bash
# Update Cloud Run service environment variables for database connection
#
# This script updates the existing Cloud Run service with database credentials.
# Use this if the service is already deployed but needs database configuration.
#
# Usage: ./scripts/update-env.sh

set -e

# Configuration - derived from the service URL
# agentics-results-index-1062287243982.us-central1.run.app
PROJECT_NUMBER="1062287243982"
REGION="us-central1"
SERVICE_NAME="agentics-results-index"

# Try to get project ID from project number
PROJECT_ID="${GCP_PROJECT:-agentics-dev}"

# Database config
RESULTS_DB_HOST="${RESULTS_DB_HOST:-34.171.232.21}"
RESULTS_DB_PORT="${RESULTS_DB_PORT:-5432}"
RESULTS_DB_NAME="${RESULTS_DB_NAME:-results-index}"
RESULTS_DB_USER="${RESULTS_DB_USER:-postgres}"
RESULTS_DB_PASSWORD="${RESULTS_DB_PASSWORD:-7yekrYmmMj74Te26!}"

# Cloud SQL instance
CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-agentics-dev:us-central1:ruvector-postgres}"

echo "=== Updating Cloud Run Environment Variables ==="
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo "Database: $RESULTS_DB_NAME"
echo ""

# Update the service with environment variables and Cloud SQL connection
gcloud run services update "$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --add-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --set-env-vars "\
RESULTS_DB_HOST=$RESULTS_DB_HOST,\
RESULTS_DB_PORT=$RESULTS_DB_PORT,\
RESULTS_DB_NAME=$RESULTS_DB_NAME,\
RESULTS_DB_USER=$RESULTS_DB_USER,\
RESULTS_DB_PASSWORD=$RESULTS_DB_PASSWORD,\
INSTANCE_UNIX_SOCKET=/cloudsql/$CLOUDSQL_INSTANCE,\
PORT=8080,\
NODE_ENV=production"

echo ""
echo "=== Environment variables updated ==="
echo ""
echo "Test with:"
echo "  curl https://agentics-results-index-1062287243982.us-central1.run.app/api/v1/health"
