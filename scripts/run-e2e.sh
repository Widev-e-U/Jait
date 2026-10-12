#!/usr/bin/env bash
#
# Run the agents Playwright e2e suite from a Jait worktree.
#
# This is the entry point behind `bun run test:e2e`. It exists so a plain
#
#   bun run test:e2e -- team-avatar.spec.ts
#
# works in a fresh worktree without the caller having to know about
# PLAYWRIGHT_BROWSERS_PATH or LD_LIBRARY_PATH. scripts/setup-e2e-env.sh writes
# those; this script sources them when present.
#
# If the worktree has never been bootstrapped, run:
#   bun run setup:e2e
#
# Usage: bun run test:e2e -- [playwright args/spec files]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.cache/e2e-env.sh"
LOCAL_BROWSERS="$REPO_ROOT/.cache/ms-playwright"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

# Fall back to the project-local browser cache even without an env file, so a
# thread that only ran the browser install still works.
if [ -d "$LOCAL_BROWSERS" ]; then
  export PLAYWRIGHT_BROWSERS_PATH="$LOCAL_BROWSERS"
fi

# Fail with the fix rather than Playwright's "Executable doesn't exist" error.
if [ ! -d "$REPO_ROOT/tests/e2e/node_modules" ]; then
  echo "[run-e2e] tests/e2e dependencies are not installed." >&2
  echo "[run-e2e] Run: bun run setup:e2e" >&2
  exit 1
fi

cd "$REPO_ROOT/tests/e2e"
exec npm test -- "$@"
