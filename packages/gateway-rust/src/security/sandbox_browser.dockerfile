FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  openbox \
  x11vnc \
  xvfb \
  websockify \
  novnc \
  socat \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && sed -i 's/#top_bar {/#top_bar { display:none !important;/' /usr/share/novnc/vnc_lite.html

RUN cat <<'EOF' >/usr/local/bin/jait-sandbox-browser.sh
#!/usr/bin/env bash
set -euo pipefail

export DISPLAY=:99

cleanup() {
  jobs -pr | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT INT TERM

Xvfb :99 -screen 0 1280x720x24 &

for _ in $(seq 1 50); do
  [[ -S /tmp/.X11-unix/X99 ]] && break
  sleep 0.1
done

# A window manager is required for CDP fullscreen transitions on Xvfb.
openbox &

chromium --no-sandbox --kiosk --disable-gpu --disable-software-rasterizer --no-first-run --no-default-browser-check --window-size=1280,720 --window-position=0,0 --remote-debugging-port=9222 --app=about:blank &

(
  while true; do
    socat TCP-LISTEN:9223,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:9222
    sleep 1
  done
) &

(
  while true; do
    # x11vnc has been observed to segfault after client disconnects when XDamage
    # is enabled. Disable that path and auto-restart so the live-view endpoint
    # survives transient x11vnc crashes instead of breaking the preview session.
    if x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -forever -shared -noxdamage -rfbport 5900; then
      vnc_status=0
    else
      vnc_status=$?
    fi
    echo "x11vnc exited with status $vnc_status; restarting in 1s" >&2
    sleep 1
  done
) &

exec websockify --web /usr/share/novnc/ 6080 localhost:5900
EOF

RUN chmod +x /usr/local/bin/jait-sandbox-browser.sh

EXPOSE 5900 6080 9223

CMD ["/usr/local/bin/jait-sandbox-browser.sh"]
