#!/bin/bash
# Deploy agentics-results-index to Cloud Run with Cloud SQL connection
#
# Prerequisites:
# 1. gcloud CLI installed and authenticated
# 2. Cloud SQL instance must be running
# 3. Database and schema must be created (run init-db.sh first)
#
# Usage: ./scripts/deploy.sh

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT:-agentics-dev}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="agentics-results-index"

# Database config
RESULTS_DB_HOST="${RESULTS_DB_HOST:-34.171.232.21}"
RESULTS_DB_PORT="${RESULTS_DB_PORT:-5432}"
RESULTS_DB_NAME="${RESULTS_DB_NAME:-results-index}"
RESULTS_DB_USER="${RESULTS_DB_USER:-postgres}"
RESULTS_DB_PASSWORD="${RESULTS_DB_PASSWORD:-7yekrYmmMj74Te26!}"

# Cloud SQL instance connection name (for Unix socket)
CLOUDSQL_INSTANCE="${CLOUDSQL_INSTANCE:-agentics-dev:us-central1:ruvector-postgres}"

echo "=== Deploying $SERVICE_NAME to Cloud Run ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Database: $RESULTS_DB_NAME @ $RESULTS_DB_HOST"
echo ""

# Build the container
echo "Building container..."
gcloud builds submit \
  --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  .

# Deploy to Cloud Run with Cloud SQL connection
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --add-cloudsql-instances "$CLOUDSQL_INSTANCE" \
  --set-env-vars "RESULTS_DB_HOST=$RESULTS_DB_HOST,RESULTS_DB_PORT=$RESULTS_DB_PORT,RESULTS_DB_NAME=$RESULTS_DB_NAME,RESULTS_DB_USER=$RESULTS_DB_USER,RESULTS_DB_PASSWORD=$RESULTS_DB_PASSWORD,PORT=8080,NODE_ENV=production,INSTANCE_UNIX_SOCKET=/cloudsql/$CLOUDSQL_INSTANCE"

echo ""
echo "=== Deployment complete ==="
echo ""

# Get the service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format 'value(status.url)')

echo "Service URL: $SERVICE_URL"
echo ""
echo "Test with: curl $SERVICE_URL/api/v1/health"
