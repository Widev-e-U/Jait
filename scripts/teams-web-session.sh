#!/usr/bin/env bash
set -euo pipefail

teams_page_only() {
  python3 -c '
import json, sys
from urllib.parse import urlsplit
try:
    pages = [urlsplit(target["url"]) for target in json.load(sys.stdin) if target["type"] == "page"]
except (ValueError, KeyError):
    sys.exit(1)
sys.exit(not (len(pages) == 1 and pages[0].scheme == "https"
    and pages[0].netloc in {"teams.microsoft.com", "teams.cloud.microsoft"}
    and (pages[0].path == "/v2" or pages[0].path.startswith("/v2/"))))'
}

move_pointer() {
  # In the virtual desktop, XTEST input reaches Chromium and resets X11 idle time.
  python3 -c '
import ctypes as c
x11 = c.CDLL("libX11.so.6")
xtest = c.CDLL("libXtst.so.6")
x11.XOpenDisplay.argtypes = [c.c_char_p]
x11.XOpenDisplay.restype = c.c_void_p
x11.XCloseDisplay.argtypes = [c.c_void_p]
xtest.XTestFakeRelativeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_ulong]
display = x11.XOpenDisplay(None)
if not display:
    raise SystemExit("Cannot connect to the Teams virtual display")
try:
    for dx in (1, -1):
        if not xtest.XTestFakeRelativeMotionEvent(display, dx, 0, 0):
            raise SystemExit("The Teams virtual display rejected XTEST input")
finally:
    x11.XCloseDisplay(display)'
}

case ${1:-} in
  check-tab) teams_page_only; exit ;;
  check-motion) move_pointer; exit ;;
esac

if [[ ${1:-} == run-desktop ]]; then
  export DISPLAY=:99 HOME=/session XDG_RUNTIME_DIR=/session/runtime
  umask 077
  mkdir -p "$XDG_RUNTIME_DIR"
  rm -f /session/login.sock
  if [[ ! -s /session/vnc-password ]]; then
    python3 -c 'import secrets; print(secrets.token_urlsafe(6))' > /session/vnc-password
  fi

  Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp -ac &
  display_pid=$!
  for ((attempt=0; attempt<50; attempt++)); do
    [[ -S /tmp/.X11-unix/X99 ]] && break
    sleep 0.1
  done
  [[ -S /tmp/.X11-unix/X99 ]]
  xfwm4 --compositor=off &
  chromium --no-sandbox --user-data-dir=/session/profile --no-first-run \
    --disable-session-crashed-bubble --start-maximized --remote-debugging-port=9222 \
    --app=https://teams.microsoft.com/v2/ &
  browser_pid=$!
  x11vnc -display "$DISPLAY" -localhost -forever -shared -passwdfile /session/vnc-password -noxdamage >/dev/null 2>&1 &
  vnc_pid=$!
  websockify --web /usr/share/novnc 127.0.0.1:6080 127.0.0.1:5900 >/dev/null 2>&1 &
  web_pid=$!
  socat UNIX-LISTEN:/session/login.sock,fork,mode=0600 TCP:127.0.0.1:6080 &
  login_pid=$!
  trap 'exit 0' TERM INT
  trap 'kill "$browser_pid" "$login_pid" "$vnc_pid" "$web_pid" 2>/dev/null || true; wait "$browser_pid" 2>/dev/null || true; kill "$display_pid" 2>/dev/null || true; rm -f /session/login.sock' EXIT


  previous_state=
  while kill -0 "$browser_pid" "$display_pid" "$vnc_pid" "$web_pid" "$login_pid" 2>/dev/null; do
    state='Waiting for a single Teams Web app tab'
    if curl --noproxy '*' --connect-timeout 1 --max-time 3 -fsS http://127.0.0.1:9222/json/list 2>/dev/null |
      teams_page_only && move_pointer; then
      state='Teams Web tab detected; pointer activity running'
    fi
    if [[ $state != "$previous_state" ]]; then
      printf '%s\n' "$state"
      previous_state=$state
    fi
    sleep 25 &
    wait $!
  done
  exit 1
fi

project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
session_dir="$project_root/.jait/artifacts/teams-web-session"
container=jait-teams-web-$(id -u)
image=jait/sandbox-linux-desktop:latest

case ${1:-} in
  start)
    if [[ -L $session_dir ]]; then
      printf 'The Teams session directory must not be a symlink.\n' >&2
      exit 1
    fi
    install -d -m 700 -- "$session_dir"
    if docker container inspect --format '{{.Name}}' "$container" >/dev/null 2>&1; then
      docker start "$container" >/dev/null
    else
      docker run --detach --pull never --init --name "$container" --restart unless-stopped \
        --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
        --shm-size 512m \
        --mount "type=bind,src=$session_dir,dst=/session" \
        --mount "type=bind,src=$project_root/scripts/teams-web-session.sh,dst=/teams-web-session.sh,readonly" \
        --entrypoint /bin/bash "$image" /teams-web-session.sh run-desktop >/dev/null
    fi
    printf 'Teams browser started. Run %s login for private sign-in instructions.\n' "$0"
    ;;
  login)
    printf 'From a computer with SSH access to this host, run:\n'
    printf '  ssh -N -o ExitOnForwardFailure=yes -L %q %q\n' "127.0.0.1:6087:$session_dir/login.sock" "$(id -un)@$(hostname)"
    printf 'Get the private desktop password in a second terminal (enter it only in noVNC):\n'
    printf '  ssh %q cat %q\n' "$(id -un)@$(hostname)" "$session_dir/vnc-password"
    printf 'Open http://127.0.0.1:6087/vnc.html?autoconnect=1 and sign in to Teams there.\n'
    ;;
  status)
    docker inspect --format '{{.State.Status}} (restarts: {{.RestartCount}})' "$container"
    docker logs "$container" 2>&1 | awk '/^(Waiting for a single Teams Web app tab|Teams Web tab detected; pointer activity running)$/ {state=$0} END {if (state) print state}'
    ;;
  stop)
    docker stop "$container" >/dev/null
    ;;
  *)
    printf 'Usage: %s {start|login|status|stop}\n' "$0" >&2
    exit 2
    ;;
esac
