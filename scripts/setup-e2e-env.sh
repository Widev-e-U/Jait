#!/usr/bin/env bash
# Prepare the Playwright runtime for the version installed in tests/e2e.
# Source this file from the E2E runner so the provider stubs affect only tests.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
playwright="$repo_root/tests/e2e/node_modules/.bin/playwright"
if [[ ! -x "$playwright" ]]; then
  echo 'Install E2E dependencies first: npm --prefix tests/e2e ci' >&2
  return 1 2>/dev/null || exit 1
fi
# Let Playwright check its own installed revision; do not share a cache with
# other Playwright versions that may garbage-collect it.
export PLAYWRIGHT_SKIP_BROWSER_GC=1
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$repo_root/.jait/artifacts/e2e-browsers}"
if [[ "${PLAYWRIGHT_ALL_BROWSERS:-}" == 1 ]]; then
  "$playwright" install chromium firefox webkit
elif [[ "${JAIT_E2E_HEADED:-}" == 1 ]]; then
  "$playwright" install chromium
else
  "$playwright" install --only-shell chromium
fi
if [[ "${JAIT_E2E_NO_STUB_PROVIDER_CLI:-}" != 1 ]]; then
  mkdir -p "$repo_root/.jait/artifacts"
  stub_dir="$(mktemp -d "$repo_root/.jait/artifacts/e2e-provider-stubs.XXXXXXXX")"
  export JAIT_E2E_STUB_DIR="$stub_dir"
  for provider in pi muse; do
    if ! command -v "$provider" >/dev/null 2>&1; then
      cat > "$stub_dir/$provider" <<'STUB'
#!/usr/bin/env bash
if [[ "${1:-}" == '--version' ]]; then
  echo 'e2e-stub 1.0.0'
  exit 0
fi
echo 'E2E provider stub supports only --version' >&2
exit 1
STUB
      chmod +x "$stub_dir/$provider"
    fi
  done
  export PATH="$stub_dir:$PATH"
fi
