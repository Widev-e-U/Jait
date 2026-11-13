#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unset JAIT_E2E_STUB_DIR
for arg in "$@"; do
  case "$arg" in --headed|--ui|--debug) export JAIT_E2E_HEADED=1 ;; esac
done
source "$repo_root/scripts/setup-e2e-env.sh"
trap '[[ -z "${JAIT_E2E_STUB_DIR:-}" ]] || rm -rf -- "$JAIT_E2E_STUB_DIR"' EXIT
npm --prefix "$repo_root/tests/e2e" test -- "$@"
