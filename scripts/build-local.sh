#!/usr/bin/env bash
set -euo pipefail

# Production bundling exceeds Jait's default terminal memory budget. Give only
# this build a transient scope; it disappears on exit without changing defaults.
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
exec systemd-run --user --scope \
  --property=MemoryHigh=6G --property=MemoryMax=8G \
  timeout --signal=TERM --kill-after=10s 10m \
  env NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=6144" \
  bun run build
