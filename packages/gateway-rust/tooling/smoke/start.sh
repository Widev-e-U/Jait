#!/usr/bin/env bash
# Starts the Rust gateway on its own (no Node gateway anywhere) beside a local OpenAI-compatible
# mock model, so a browser can walk the real web UI against the Rust binary alone.
#
#   tooling/smoke/start.sh [run-name]
#
# Environment (optional):
#   SMOKE_GATEWAY_BIN  gateway binary           (default: packages/gateway-rust/target/debug/jait-gateway)
#   SMOKE_WEB_DIR      built web UI directory   (default: apps/web/dist when it holds an index.html)
#   SMOKE_BIND_HOST    address to bind          (default: 127.0.0.1). A browser inside a Docker
#                      container cannot reach the host's loopback, so a non-loopback address such
#                      as the docker0 bridge IP sets JAIT_RUST_ALLOW_NON_LOOPBACK=1 for this run.
#                      Use a bridge or other private address, never 0.0.0.0.
#
# Everything lives under .jait/artifacts/browser-smoke/<run-name>/ (default: a timestamp):
#   home/        the gateway's HOME, so nothing of the real ~/.jait is read or written
#   project/     a small git repository the UI can register as a project
#   gateway.sqlite, gateway.out (JSON-line stdout), gateway.err, model.out, model.err,
#   model-requests.jsonl (every request body the gateway sent to the model)
#   smoke.env    GATEWAY_URL, MODEL_BASE and the two PIDs; tooling/smoke/stop.sh reads it
# Both processes run detached (setsid), so closing the terminal that started them leaves them up.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd "$here/../../../.." && pwd)
bin=${SMOKE_GATEWAY_BIN:-$repo/packages/gateway-rust/target/debug/jait-gateway}
web=${SMOKE_WEB_DIR:-$repo/apps/web/dist}
host=${SMOKE_BIND_HOST:-127.0.0.1}
run=${1:-$(date +%Y%m%d-%H%M%S)}
dir=$repo/.jait/artifacts/browser-smoke/$run

[ -x "$bin" ] || { echo "gateway binary not found or not executable: $bin" >&2; exit 1; }
[ -f "$web/index.html" ] || { echo "no built web UI at $web (needs index.html); set SMOKE_WEB_DIR" >&2; exit 1; }
[ ! -e "$dir" ] || { echo "run directory already exists: $dir" >&2; exit 1; }
[ "$host" != "0.0.0.0" ] || { echo "refusing to bind 0.0.0.0 for a smoke run; name one interface" >&2; exit 1; }

# A non-loopback bind is refused by the gateway unless this run opts in explicitly.
bind=(JAIT_RUST_HOST="$host")
case "$host" in
  127.*) ;;
  *) bind+=(JAIT_RUST_ALLOW_NON_LOOPBACK=1) ;;
esac

mkdir -p "$dir/home" "$dir/project/src" "$dir/project/docs"
printf '# Smoke project\n\nA tiny repository for the browser walk.\n' >"$dir/project/README.md"
printf 'hello from src\n' >"$dir/project/src/hello.txt"
printf '## Notes\n\n- first\n- second\n' >"$dir/project/docs/notes.md"
(
  cd "$dir/project"
  git init -q
  git -c user.name=smoke -c user.email=smoke@example.invalid add -A
  git -c user.name=smoke -c user.email=smoke@example.invalid commit -q -m "seed the smoke project"
)

# Runs "$@" detached in its own session. The wrapper records its own PID and then execs, so the
# recorded PID is the command's PID and not a short-lived wrapper's.
launch() { # name, then the command
  local name=$1
  shift
  setsid nohup bash -c 'echo $$ >"$1"; shift; exec "$@"' _ "$dir/$name.pid" "$@" \
    >"$dir/$name.out" 2>"$dir/$name.err" </dev/null &
}

# The mock model first: the gateway is pointed at it later, from the browser.
launch model node "$here/mock-model.mjs" "$dir/model.address" "$dir/model-requests.jsonl"

# The gateway: an empty environment plus only what it needs, so the host's settings cannot leak in.
launch gateway env -i \
  HOME="$dir/home" \
  PATH="$PATH" \
  JAIT_RUST_APPLICATION=1 \
  "${bind[@]}" \
  JAIT_RUST_PORT=0 \
  JAIT_RUST_PROJECT_ROOT="$dir/project" \
  JAIT_RUST_DB="$dir/gateway.sqlite" \
  JAIT_WEB_DIR="$web" \
  JWT_SECRET="browser-smoke-secret-$run" \
  "$bin"

abort() {
  echo "$1" >&2
  for name in model gateway; do
    [ -s "$dir/$name.pid" ] && kill "$(cat "$dir/$name.pid")" 2>/dev/null || true
  done
  exit 1
}

for _ in $(seq 1 300); do
  [ -s "$dir/model.address" ] && break
  sleep 0.1
done
[ -s "$dir/model.address" ] || abort "the mock model never reported its address (see $dir/model.err)"

address=""
for _ in $(seq 1 300); do
  [ -s "$dir/gateway.out" ] && address=$(node -e '
    for (const line of require("node:fs").readFileSync(process.argv[1], "utf8").split("\n")) {
      try { const event = JSON.parse(line); if (event.event === "gateway.ready") { console.log(event.address); break; } } catch {}
    }' "$dir/gateway.out")
  [ -n "$address" ] && break
  sleep 0.1
done
[ -n "$address" ] || abort "the gateway never reported gateway.ready (see $dir/gateway.err)"

cat >"$dir/smoke.env" <<EOF
RUN_DIR=$dir
GATEWAY_URL=http://$address
MODEL_BASE=$(tr -d '\n' <"$dir/model.address")
PROJECT_DIR=$dir/project
GATEWAY_PID=$(cat "$dir/gateway.pid")
MODEL_PID=$(cat "$dir/model.pid")
WEB_DIR=$web
EOF
cat "$dir/smoke.env"
