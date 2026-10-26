#!/usr/bin/env bash
# One command for a local demo: Postgres, Redis and object store (Docker), the demo A1 course,
# the API on :3000 and the admin portal on :3001, both in the background.
# Usage: scripts/demo-up.sh [up|down|reset]   `reset` wipes the local demo database first (dev only).
# Needs Docker running, Node 22, pnpm and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS="${TMPDIR:-/tmp}/tomcom-demo"

up_url() { curl -s -o /dev/null "$1"; }
wait_for() { # url, name
  for _ in $(seq 1 60); do up_url "$1" && return 0; sleep 2; done
  echo "$2 did not start in 2 minutes. See $LOGS/*.log" >&2
  exit 1
}

case "${1:-up}" in
  up)
    mkdir -p "$LOGS"
    scripts/dev-services.sh up
    if ! up_url http://localhost:3000/v1/app/config; then
      nohup pnpm --filter @tomcom/api dev > "$LOGS/api.log" 2>&1 &
    fi
    wait_for http://localhost:3000/v1/app/config "The API"
    pnpm --filter @tomcom/api seed:demo
    pnpm --filter @tomcom/seed -s generate --learners 40 | pnpm --filter @tomcom/api -s seed:demo-learners
    if ! up_url http://localhost:3001/en/login; then
      nohup pnpm --filter @tomcom/web dev > "$LOGS/web.log" 2>&1 &
    fi
    wait_for http://localhost:3001/en/login "The admin portal"
    password=$(grep '^DEV_STAFF_PASSWORD=' apps/api/.env.local | cut -d= -f2-)
    cat <<MSG

Demo is running.
  Admin portal : http://localhost:3001/en/login
    phone +915599990002 · code 123456 · password $password
  API          : http://localhost:3000
  Phone app    : cd apps/mobile && flutter run --dart-define=API_BASE_URL=http://localhost:3000
                 (Android emulator: http://10.0.2.2:3000). Learner sign-in: any +9155… number, code 123456.
  Logs         : $LOGS
  Stop         : scripts/demo-up.sh down     Start over: scripts/demo-up.sh reset
MSG
    ;;
  reset)
    # Starts again from an empty database: the demo course, learners and progress are rebuilt.
    scripts/stop-port.sh 3000 3001 || true
    scripts/dev-services.sh reset
    exec "$0" up
    ;;
  down)
    scripts/stop-port.sh 3000 3001 || true
    scripts/dev-services.sh down
    ;;
  *) echo "usage: $0 [up|down|reset]" >&2; exit 2 ;;
esac
