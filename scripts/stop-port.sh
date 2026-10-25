#!/usr/bin/env bash
# Stops the process listening on a TCP port (dev servers started in the background).
# Usage: scripts/stop-port.sh 3001 [3000 ...]
set -euo pipefail
for port in "$@"; do
  hex=$(printf '%04X' "$port")
  inodes=$(awk -v h=":$hex" '$2 ~ h"$" && $4 == "0A" {print $10}' $(ls /proc/net/tcp /proc/net/tcp6 2>/dev/null) | sort -u)
  for inode in $inodes; do
    for fd in /proc/[0-9]*/fd/*; do
      if [ "$(readlink "$fd" 2>/dev/null)" = "socket:[$inode]" ]; then
        pid=${fd#/proc/}; pid=${pid%%/*}
        kill "$pid" 2>/dev/null && echo "stopped pid $pid on :$port"
      fi
    done
  done
done
