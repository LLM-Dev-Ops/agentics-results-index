#!/bin/bash
# Initialize the results-index database on Cloud SQL
# Usage: ./scripts/init-db.sh

set -e

# Database connection details
DB_HOST="${RESULTS_DB_HOST:-34.171.232.21}"
DB_PORT="${RESULTS_DB_PORT:-5432}"
DB_NAME="${RESULTS_DB_NAME:-results-index}"
DB_USER="${RESULTS_DB_USER:-postgres}"
DB_PASSWORD="${RESULTS_DB_PASSWORD:-7yekrYmmMj74Te26!}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Initializing results-index database ==="
echo "Host: $DB_HOST"
echo "Port: $DB_PORT"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "psql not found. Installing postgresql-client..."
    apt-get update && apt-get install -y postgresql-client
fi

# Create the database if it doesn't exist
echo "Creating database '$DB_NAME' if not exists..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\";" 2>/dev/null || echo "Database already exists or creation skipped"

# Run the schema
echo "Running schema..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/schema.sql"

echo ""
echo "=== Database initialization complete ==="
echo ""
echo "Test the connection with:"
echo "  PGPASSWORD='$DB_PASSWORD' psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c 'SELECT 1 as health_check;'"
