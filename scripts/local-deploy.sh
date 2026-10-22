#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "${1:-}" == "--plan" ]]; then
  exec node "$project_root/scripts/local-deploy.mjs" "$@"
fi
exec systemd-run --user --scope --property=MemoryHigh=6G --property=MemoryMax=8G \
  --property=RuntimeMaxSec=7200 node "$project_root/scripts/local-deploy.mjs" "$@"
