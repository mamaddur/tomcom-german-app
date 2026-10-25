#!/usr/bin/env bash
# Start/stop local Postgres (pgvector) and Redis, then apply migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-up}" in
  up)
    docker compose up -d --wait
    for db in tomcom_dev tomcom_test; do
      DATABASE_URL="postgresql://tomcom:tomcom@localhost:5432/$db" \
        pnpm --filter @tomcom/api exec prisma migrate deploy >/dev/null
    done
    echo "Services up: postgres :5432, redis :6379"
    ;;
  down) docker compose down ;;
  reset) docker compose down -v ;;
  *) echo "usage: $0 [up|down|reset]" >&2; exit 2 ;;
esac
