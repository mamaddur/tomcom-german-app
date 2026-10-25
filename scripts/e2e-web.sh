#!/usr/bin/env bash
# Builds and starts the API (:3000) and web (:3001) against the dev services, runs the browser
# tests, then stops both. Needs scripts/dev-services.sh up (which also seeds synthetic staff).
set -euo pipefail
cd "$(dirname "$0")/.."
export NEXT_TELEMETRY_DISABLED=1
set -a; . apps/api/.env.local; set +a
export E2E_STAFF_PASSWORD="$DEV_STAFF_PASSWORD"

pnpm --filter @tomcom/seed -s generate --learners 0 | pnpm --filter @tomcom/api -s seed:dev >/dev/null
pnpm -s --filter @tomcom/api build
pnpm -s --filter @tomcom/web build
(cd apps/api && PORT=3000 node dist/main.js > /tmp/e2e-api.log 2>&1 &)
(cd apps/web && API_BASE_URL=http://localhost:3000 node_modules/.bin/next start -p 3001 > /tmp/e2e-web.log 2>&1 &)
trap 'scripts/stop-port.sh 3000 3001 >/dev/null' EXIT
for _ in $(seq 1 60); do
  curl -sf localhost:3000/v1/health/ready >/dev/null && curl -sf -o /dev/null localhost:3001/te/login && break
  sleep 1
done
# Clear OTP cooldowns from earlier local runs (dev Redis only; CI starts empty).
if docker compose ps -q redis >/dev/null 2>&1; then
  docker compose exec -T redis redis-cli -n 0 --scan --pattern 'otp-cooldown:*' |
    xargs -r docker compose exec -T redis redis-cli -n 0 del >/dev/null || true
fi
pnpm -s --filter @tomcom/web test:e2e
