#!/usr/bin/env bash
# Local equivalent of CI. Every check must pass before a change is offered for review.
#   scripts/verify.sh          all checks (needs scripts/dev-services.sh up for integration tests)
#   scripts/verify.sh --fast   skip integration tests, Flutter and Semgrep
set -euo pipefail
cd "$(dirname "$0")/.."
FAST=${1:-}
export NEXT_TELEMETRY_DISABLED=1
step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }

step "Install tools";             scripts/install-tools.sh >/dev/null
step "Format";                    pnpm -s format:check
step "OpenAPI spec up to date";   pnpm -s --filter @tomcom/api openapi >/dev/null
                                  git diff --exit-code -- apps/api/openapi.json
step "Lint";                      pnpm -s lint
step "Types";                     pnpm -s typecheck
step "Unit tests";                pnpm -s test
step "Build";                     pnpm -s build

if [ "$FAST" != "--fast" ]; then
  step "API integration tests";   pnpm -s --filter @tomcom/api test:int
  if command -v flutter >/dev/null || [ -x /opt/flutter/bin/flutter ]; then
    export PATH="/opt/flutter/bin:$PATH"
    step "Flutter analyze + test"
    (cd apps/mobile && flutter pub get >/dev/null && flutter gen-l10n && dart format --set-exit-if-changed lib test >/dev/null && flutter analyze && flutter test)
  else
    echo "Flutter SDK not found — skipping mobile checks" >&2; exit 1
  fi
  step "SAST (Semgrep)"
  sg() { tools/.venv/bin/semgrep scan --metrics=off --quiet --error "$@" apps packages tools/seed; }
  sg --config .semgrep/project.yml
  # Registry rulesets need semgrep.dev; CI always runs them.
  if curl -sf -o /dev/null --max-time 5 https://semgrep.dev/c/p/typescript; then
    sg --config p/typescript --config p/secrets
  else
    echo "⚠ semgrep.dev unreachable from this machine — registry rulesets run in CI only" >&2
  fi
fi

step "Secret scan (gitleaks)"    # history, staged and unstaged changes; new files are caught by the pre-commit hook
for mode in "" "--pre-commit --staged" "--pre-commit"; do
  # shellcheck disable=SC2086
  tools/bin/gitleaks git $mode --redact --no-banner --log-level warn -c .gitleaks.toml .
done
step "Dependency scan";           pnpm audit --audit-level low
# OSV also covers the Dart lockfile. Its API can be unreachable from sandboxes; CI always runs it.
if ! out=$(tools/bin/osv-scanner scan source --lockfile pnpm-lock.yaml --lockfile apps/mobile/pubspec.lock 2>&1); then
  if grep -q "querybatch" <<<"$out"; then
    echo "⚠ OSV API unreachable from this machine — Dart dependencies are checked in CI only" >&2
  else
    echo "$out"; exit 1
  fi
fi

printf '\n\033[32m✔ All checks passed\033[0m\n'
