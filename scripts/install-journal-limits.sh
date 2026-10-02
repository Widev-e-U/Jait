#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
  echo 'Run this script with sudo to install Jait journal limits.' >&2
  exit 1
fi
script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
config_target=/etc/systemd/journald.conf.d/60-jait-disk-limits.conf
install -d -m 0755 /etc/systemd/journald.conf.d
if [[ -f "$config_target" ]] && ! cmp -s "$script_root/ops/journald/60-jait-disk-limits.conf" "$config_target"; then
  cp -p -- "$config_target" "$config_target.backup-$(date -u +%Y%m%dT%H%M%SZ)"
fi
install -m 0644 -- "$script_root/ops/journald/60-jait-disk-limits.conf" "$config_target"
systemctl restart systemd-journald
systemctl is-active systemd-journald
systemd-analyze cat-config systemd/journald.conf
