#!/bin/bash
# Live node-connection parity runner (runs INSIDE the tauri-cicd container).
# Usage: run-conn-test.sh tauri|electron
set -u
APP="${1:-tauri}"
HARNESS_DIR=/jait/apps/desktop-tauri/src-tauri/tests/harness
OUT="$HARNESS_DIR/out"
mkdir -p "$OUT"
: > "$OUT/$APP-report.json"

env REPORT_PATH="$OUT/$APP-report.json" PORT_APP=3999 node "$HARNESS_DIR/conn-server.mjs" >"$OUT/$APP-harness.log" 2>&1 &
SRV=$!
env PORT=8000 WS_PORT=18789 HOST=127.0.0.1 node /jait/packages/gateway/dist/index.js >"$OUT/$APP-gateway.log" 2>&1 &
GW=$!
sleep 2

URL="http://127.0.0.1:3999/node-conn.html"
export JAIT_WEB_DEV_URL="$URL"
export JAIT_GATEWAY_URL="http://127.0.0.1:8000"
Xvfb :99 -screen 0 1600x1000x24 >"$OUT/$APP-xvfb.log" 2>&1 &
XV=$!
sleep 1
export DISPLAY=:99
export GDK_BACKEND=x11
if [ "$APP" = "tauri" ]; then
  WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_FORCE_SANDBOX=0 \
    /jait/apps/desktop-tauri/src-tauri/target/debug/jait-desktop-app >"$OUT/$APP-app.log" 2>&1 &
else
  cd /jait/apps/desktop
  node_modules/.bin/electron --no-sandbox dist/electron-main.js >"$OUT/$APP-app.log" 2>&1 &
fi
APP_PID=$!

for i in $(seq 1 60); do
  [ -s "$OUT/$APP-report.json" ] && break
  sleep 1
done
sleep 1
kill $APP_PID $XV $SRV $GW 2>/dev/null || true
pkill -f jait-desktop-app 2>/dev/null || true
pkill -f "electron-main.js" 2>/dev/null || true
pkill -f "conn-server.mjs" 2>/dev/null || true
pkill -f "Xvfb :99" 2>/dev/null || true
wait 2>/dev/null || true
echo "--- $APP report ---"
cat "$OUT/$APP-report.json"
echo "--- app log tail ---"
tail -5 "$OUT/$APP-app.log"