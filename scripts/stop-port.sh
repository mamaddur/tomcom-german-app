#!/usr/bin/env bash
# Stops the process listening on a TCP port (dev servers started in the background).
# Usage: scripts/stop-port.sh 3001 [3000 ...]
# Works on macOS (lsof) and Linux (/proc). Prints nothing if nothing is listening.
set -euo pipefail

stop() { # pid, port
  kill "$1" 2>/dev/null && echo "stopped pid $1 on :$2" || true
}

for port in "$@"; do
  if command -v lsof >/dev/null 2>&1; then
    for pid in $(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true); do stop "$pid" "$port"; done
  elif [ -r /proc/net/tcp ]; then
    hex=$(printf '%04X' "$port")
    inodes=$(awk -v h=":$hex" '$2 ~ h"$" && $4 == "0A" {print $10}' /proc/net/tcp $( [ -r /proc/net/tcp6 ] && echo /proc/net/tcp6 ) | sort -u)
    for inode in $inodes; do
      for fd in /proc/[0-9]*/fd/*; do
        if [ "$(readlink "$fd" 2>/dev/null)" = "socket:[$inode]" ]; then
          pid=${fd#/proc/}; pid=${pid%%/*}
          stop "$pid" "$port"
        fi
      done
    done
  fi
done
