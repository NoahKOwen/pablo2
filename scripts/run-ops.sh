#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <ops-sql-file>"
  exit 2
fi

FILE="$1"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set. Set it to your Postgres connection string and retry."
  exit 3
fi

if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE"
  exit 4
fi

echo "Running ops SQL: $FILE"
psql "$DATABASE_URL" -f "$FILE"

echo "Done."
