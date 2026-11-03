#!/usr/bin/env bash
# Reclaim jait debris the gateway user is not allowed to delete.
#
# Two sources need root because they are outside the gateway account's authority:
#   1. Scratch in a sticky temp root (/tmp) created by another account, e.g.
#      CI/test runs that execute as `ci-builder`.
#   2. Worktrees holding files written by root-owned containers (__pycache__),
#      which make the whole tree undeletable for the owner.
#
# Usage:
#   bash scripts/jait-debris-cleanup.sh                  # report only, no root
#   bash scripts/jait-debris-cleanup.sh --apply          # prompts for password once
#   bash scripts/jait-debris-cleanup.sh --install-timer  # daily root reap of /tmp
#
# The password is entered through sudo in your own terminal. It is never passed
# as an argument, written to disk, or captured by an agent session.

set -euo pipefail

TMP_ROOT="${TMPDIR:-/tmp}"
SCRATCH_DAYS="${JAIT_JANITOR_TEMP_SCRATCH_DAYS:-3}"
STATE_DIR="${JAIT_STATE_DIR:-$HOME/.jait}"
WORKTREE_ROOT="$STATE_DIR/worktrees"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUN_BIN="${BUN_BIN:-$(command -v bun || true)}"

APPLY=0
INSTALL_TIMER=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --install-timer) INSTALL_TIMER=1 ;;
    -h | --help) sed -n '3,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
mb() { printf '%s MB' "$(( $1 / 1024 / 1024 ))"; }

# Anything that touches foreign-owned entries needs root. Re-exec through sudo so
# the user is prompted exactly once, in their terminal.
if { [ "$APPLY" -eq 1 ] || [ "$INSTALL_TIMER" -eq 1 ]; } && [ "${EUID}" -ne 0 ]; then
  say "Root is required for entries owned by another account; sudo will prompt."
  exec sudo -E -- bash "${BASH_SOURCE[0]}" "$@"
fi

# ── scratch in the temp root ────────────────────────────────────────────
say "Temp root: $TMP_ROOT (reaping jait-* older than ${SCRATCH_DAYS}d)"
mapfile -t SCRATCH < <(
  find "$TMP_ROOT" -mindepth 1 -maxdepth 1 -name 'jait-*' -mtime +"$SCRATCH_DAYS" 2>/dev/null | sort
)
FOREIGN=0
BYTES=0
if [ "${#SCRATCH[@]}" -gt 0 ]; then
  me="$(id -u)"
  for path in "${SCRATCH[@]}"; do
    [ -e "$path" ] || continue
    owner="$(stat -c '%u' -- "$path" 2>/dev/null)" || owner="$me"
    [ "$owner" = "$me" ] || FOREIGN=$((FOREIGN + 1))
    # du exits non-zero on trees we cannot fully read; keep the partial size.
    size="$(du -sb -- "$path" 2>/dev/null | cut -f1 || true)"
    if [ -n "$size" ]; then BYTES=$((BYTES + size)); fi
  done
fi
say "  stale entries: ${#SCRATCH[@]} ($(mb "$BYTES")); owned by other accounts: $FOREIGN"

# ── worktrees holding root-owned files ──────────────────────────────────
# Containers that run as root leave files the owner cannot delete, which makes
# the whole worktree unremovable until ownership is handed back.
FOREIGN_FILES=0
if [ -d "$WORKTREE_ROOT" ]; then
  FOREIGN_FILES=$(find "$WORKTREE_ROOT" ! -user "$(id -un)" 2>/dev/null | wc -l || true)
fi
say "Worktrees: $WORKTREE_ROOT (foreign-owned files: $FOREIGN_FILES)"

if [ "$APPLY" -eq 0 ] && [ "$INSTALL_TIMER" -eq 0 ]; then
  say ""
  say "Report only. Re-run with --apply to delete (one sudo prompt)."
  if [ "${#SCRATCH[@]}" -eq 0 ] && [ "$FOREIGN_FILES" -eq 0 ]; then say "Nothing to do."; fi
  exit 0
fi

# ── apply ───────────────────────────────────────────────────────────────
if [ "$APPLY" -eq 1 ]; then
  if [ "${#SCRATCH[@]}" -gt 0 ]; then
    printf '%s\0' "${SCRATCH[@]}" | xargs -0 -r rm -rf
    say "Removed ${#SCRATCH[@]} stale temp entr(y/ies)."
  fi

  # Hand the worktree tree back to its owner, then let the janitor apply its own
  # policy (thread state, grace periods, branch preservation) as that user. Doing
  # the deletion as root would trip git's dubious-ownership check.
  if [ -n "${SUDO_UID:-}" ] && [ -d "$WORKTREE_ROOT" ]; then
    chown -R "${SUDO_UID}:${SUDO_GID}" "$WORKTREE_ROOT"
    if [ -n "$BUN_BIN" ] && [ -f "$REPO_DIR/scripts/disk-janitor.ts" ]; then
      say ""
      say "Running the janitor as $(id -un "$SUDO_UID"):"
      runuser -u "$(id -un "$SUDO_UID")" -- env HOME="$HOME" \
        "$BUN_BIN" "$REPO_DIR/scripts/disk-janitor.ts" --apply || true
    fi
  fi
fi

# ── optional: self-healing daily reap ───────────────────────────────────
if [ "$INSTALL_TIMER" -eq 1 ]; then
  unit_dir=/etc/systemd/system
  cat >"$unit_dir/jait-tmp-reap.service" <<EOF
[Unit]
Description=Reap stale jait scratch from the shared temp root

[Service]
Type=oneshot
ExecStart=/usr/bin/find $TMP_ROOT -mindepth 1 -maxdepth 1 -name jait-* -mtime +$SCRATCH_DAYS -exec /bin/rm -rf {} +
EOF
  cat >"$unit_dir/jait-tmp-reap.timer" <<EOF
[Unit]
Description=Daily reap of stale jait scratch

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now jait-tmp-reap.timer
  say "Installed jait-tmp-reap.timer (daily; root cron equivalent)."
fi

say ""
df -h "$TMP_ROOT" | tail -1
