#!/usr/bin/env bash
# Start/stop local Postgres (pgvector) and Redis, then apply migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-up}" in
  up)
    if [ ! -f apps/api/.env.local ]; then
      # Fresh random dev keys; never committed (.gitignore).
      sed -e "s|^PII_ENCRYPTION_KEY=.*|PII_ENCRYPTION_KEY=$(openssl rand -base64 32)|" \
          -e "s|^PII_HMAC_KEY=.*|PII_HMAC_KEY=$(openssl rand -base64 32)|" \
          -e "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -base64 32)|" \
          apps/api/.env.example > apps/api/.env.local
      echo "Created apps/api/.env.local with random dev keys"
    fi
    # The template ships an empty DEV_STAFF_PASSWORD= line, so test for a non-empty value.
    if ! grep -qE '^DEV_STAFF_PASSWORD=.+' apps/api/.env.local; then
      sed -i.bak '/^DEV_STAFF_PASSWORD=/d' apps/api/.env.local && rm -f apps/api/.env.local.bak
      echo "DEV_STAFF_PASSWORD=$(openssl rand -base64 18)" >> apps/api/.env.local
    fi
    docker compose up -d --wait
    for db in tomcom_dev tomcom_test; do
      DATABASE_URL="postgresql://tomcom:tomcom@localhost:5432/$db" \
        pnpm --filter @tomcom/api exec prisma migrate deploy >/dev/null
    done
    pnpm --filter @tomcom/seed -s generate --learners 0 | pnpm --filter @tomcom/api -s seed:dev
    echo "Services up: postgres :5432, redis :6379"
    ;;
  down) docker compose down ;;
  reset) docker compose down -v ;;
  *) echo "usage: $0 [up|down|reset]" >&2; exit 2 ;;
esac
