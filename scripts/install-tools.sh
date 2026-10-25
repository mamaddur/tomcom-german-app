#!/usr/bin/env bash
# Installs pinned security scanners into tools/bin (git-ignored), verified against the
# publishers' checksum files. Semgrep goes into tools/.venv.
set -euo pipefail
cd "$(dirname "$0")/.."
GITLEAKS_VERSION=8.28.0
OSV_VERSION=2.2.2
SEMGREP_VERSION=1.182.1
BIN=tools/bin
mkdir -p "$BIN"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

if ! "$BIN/gitleaks" version 2>/dev/null | grep -q "$GITLEAKS_VERSION"; then
  base=https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION
  file=gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz
  curl -sSfL -o "$tmp/$file" "$base/$file"
  curl -sSfL -o "$tmp/sums" "$base/gitleaks_${GITLEAKS_VERSION}_checksums.txt"
  (cd "$tmp" && grep " $file\$" sums | sha256sum -c --quiet)
  tar -xzf "$tmp/$file" -C "$tmp" gitleaks && mv "$tmp/gitleaks" "$BIN/gitleaks"
fi

if ! "$BIN/osv-scanner" --version 2>/dev/null | grep -q "$OSV_VERSION"; then
  base=https://github.com/google/osv-scanner/releases/download/v$OSV_VERSION
  file=osv-scanner_linux_amd64
  curl -sSfL -o "$tmp/$file" "$base/$file"
  curl -sSfL -o "$tmp/sums" "$base/osv-scanner_SHA256SUMS"
  (cd "$tmp" && grep " $file\$" sums | sha256sum -c --quiet)
  install -m 0755 "$tmp/$file" "$BIN/osv-scanner"
fi

if ! tools/.venv/bin/semgrep --version 2>/dev/null | grep -q "$SEMGREP_VERSION"; then
  python3 -m venv tools/.venv
  tools/.venv/bin/pip install -q "semgrep==$SEMGREP_VERSION"
fi

echo "gitleaks $("$BIN/gitleaks" version) · $("$BIN/osv-scanner" --version | head -1) · semgrep $(tools/.venv/bin/semgrep --version)"
