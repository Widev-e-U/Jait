#!/usr/bin/env bash
# Stops the gateway and the mock model that tooling/smoke/start.sh started for one run.
#
#   tooling/smoke/stop.sh <run-name>
#
# Only the two PIDs recorded in that run's smoke.env are signalled, and each only while its
# command line still names the binary or script that start.sh launched, so a recycled PID can
# never take down an unrelated process (in particular, never the real gateway).
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
run=${1:?usage: stop.sh <run-name>}
env_file=$repo/.jait/artifacts/browser-smoke/$run/smoke.env
[ -f "$env_file" ] || { echo "no such run: $run" >&2; exit 1; }
# shellcheck disable=SC1090
. "$env_file"

stop() { # pid, expected substring of the command line
  local pid=$1 needle=$2 command
  command=$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)
  if [ -z "$command" ]; then
    echo "pid $pid already gone"
  elif [[ "$command" == *"$needle"* ]]; then
    kill "$pid" && echo "stopped pid $pid ($needle)"
  else
    echo "pid $pid is no longer $needle; left alone" >&2
  fi
}
stop "$GATEWAY_PID" "jait-gateway"
stop "$MODEL_PID" "mock-model.mjs"
