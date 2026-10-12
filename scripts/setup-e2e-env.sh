#!/usr/bin/env bash
#
# Bootstrap the Playwright *runtime* for the agents e2e suite inside a Jait
# worktree. This complements `bun run setup:e2e` (which installs JS
# dependencies); it handles the two pieces that are host-environment specific
# and therefore cannot be baked into the repo.
#
#   1. Playwright Chromium is not part of a fresh worktree. It is installed
#      into a project-local cache (PLAYWRIGHT_BROWSERS_PATH) rather than
#      $HOME, because a Jait thread sandbox's HOME is not guaranteed to
#      survive while the project directory is.
#
#   2. Chromium's system shared libraries may be absent. On a Jait thread
#      sandbox (uid 1000, no sudo) Playwright's own `install --with-deps`
#      can never work: it shells out to `su root -c "apt-get install ..."`.
#      This script instead extracts the required Debian/Ubuntu packages into
#      a project-local prefix and records LD_LIBRARY_PATH for it. On a host
#      that already has the libraries (e.g. the self-hosted CI runner) the
#      check passes immediately and nothing is downloaded.
#
#   3. Chromium needs a fontconfig configuration to lay out text. A Jait thread
#      sandbox has no /etc/fonts, and fontconfig is silent about it:
#      document.fonts.check() still answers true, yet every text range measures
#      0x0, so every text-based locator or visibility assertion fails no matter
#      what the product code does. The prefix extracted in step 2 normally
#      contains fonts, but nothing points fontconfig at them; this script
#      generates such a configuration and proves the result by measuring text
#      in the browser.
#
# Output: .cache/e2e-env.sh, sourced by scripts/run-e2e.sh.
# Idempotent -- re-running is cheap.
#
# Usage: bash scripts/setup-e2e-env.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="$REPO_ROOT/.cache"
# Honour an explicit cache when one is provided (CI points this at a runner temp
# directory); otherwise keep everything project-local.
BROWSERS_DIR="${PLAYWRIGHT_BROWSERS_PATH:-$CACHE_DIR/ms-playwright}"
SYSROOT="$CACHE_DIR/syslibs"
APT_LISTS="$CACHE_DIR/apt/lists"
APT_CACHE="$CACHE_DIR/apt/cache"
DEBS_DIR="$CACHE_DIR/apt/debs"
ENV_FILE="$CACHE_DIR/e2e-env.sh"
E2E_DIR="$REPO_ROOT/tests/e2e"

log() { printf '[setup-e2e-env] %s\n' "$*"; }
warn() { printf '[setup-e2e-env] WARNING: %s\n' "$*" >&2; }

mkdir -p "$CACHE_DIR" "$APT_LISTS/partial" "$APT_CACHE/archives/partial" "$DEBS_DIR"

# ---------------------------------------------------------------------------
# 1. Playwright Chromium into a project-local cache.
# ---------------------------------------------------------------------------
PLAYWRIGHT_CLI=""
for candidate in \
  "$E2E_DIR/node_modules/.bin/playwright" \
  "$REPO_ROOT/packages/gateway/node_modules/.bin/playwright"
do
  if [ -x "$candidate" ]; then PLAYWRIGHT_CLI="$candidate"; break; fi
done

if [ -z "$PLAYWRIGHT_CLI" ]; then
  warn "playwright CLI not found; run 'npm --prefix tests/e2e ci' first. Skipping browser install."
else
  export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR"

  # Never hardcode a browser revision: the revision Playwright launches depends
  # on the installed @playwright/test version (1.58.2 -> chromium 1208,
  # 1.64.0 -> 1248). Read Playwright's own manifest so a stale cache is detected
  # as missing instead of assumed present -- that assumption is exactly what
  # produced "Executable doesn't exist at .../chromium_headless_shell-1248".
  PW_REVISIONS="$(
    MANIFEST="$E2E_DIR/node_modules/playwright-core/browsers.json" node --input-type=module -e '
      import { existsSync, readFileSync } from "node:fs"
      const manifest = process.env.MANIFEST
      if (!manifest || !existsSync(manifest)) process.exit(0)
      const { browsers = [] } = JSON.parse(readFileSync(manifest, "utf8"))
      process.stdout.write(
        browsers
          .filter((entry) => entry.name === "chromium" || entry.name === "chromium-headless-shell")
          .map((entry) => `${entry.name}@${entry.revision}`)
          .join(" "),
      )
    ' 2>/dev/null || true
  )"

  missing_revisions() {
    local entry name revision dir_name
    for entry in $PW_REVISIONS; do
      name="${entry%%@*}"
      revision="${entry##*@}"
      dir_name="$(printf '%s' "$name" | tr '-' '_')-$revision"
      [ -d "$BROWSERS_DIR/$dir_name" ] || printf '%s ' "$entry"
    done
  }

  MISSING_REVISIONS="$(missing_revisions)"

  if [ -z "$PW_REVISIONS" ]; then
    warn "could not read Playwright's browser manifest; installing chromium unconditionally."
    "$PLAYWRIGHT_CLI" install chromium
  elif [ -z "${MISSING_REVISIONS// /}" ]; then
    log "browsers already present in $BROWSERS_DIR: $(printf '%s' "$PW_REVISIONS" | tr ' ' ',')"
  else
    log "installing missing browser revisions: $MISSING_REVISIONS"
    # No --with-deps: see header. System libraries are handled below.
    "$PLAYWRIGHT_CLI" install chromium
    REMAINING_REVISIONS="$(missing_revisions)"
    if [ -n "${REMAINING_REVISIONS// /}" ]; then
      warn "still missing after install: $REMAINING_REVISIONS"
      warn "The e2e run will fail with \"Executable doesn't exist\". Re-run the install with network access."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 2. Chromium system libraries, extracted rootlessly when they are missing.
# ---------------------------------------------------------------------------
CHROME_BIN="$(find "$BROWSERS_DIR" -name chrome-headless-shell -type f -print -quit 2>/dev/null || true)"
if [ -z "$CHROME_BIN" ]; then
  CHROME_BIN="$(find "$BROWSERS_DIR" -name chrome -type f -print -quit 2>/dev/null || true)"
fi

missing_libs() {
  # Direct ELF dependencies of the browser binary that the loader cannot find.
  [ -n "${1:-}" ] || return 0
  ldd "$1" 2>/dev/null | awk '/not found/ {print $1}' | sort -u
}

LIB_DIRS=""

if [ -z "$CHROME_BIN" ]; then
  warn "no Chromium binary under $BROWSERS_DIR; skipping system library setup."
elif [ -z "$(missing_libs "$CHROME_BIN")" ]; then
  log "chromium system libraries already satisfied by this host"
  # Still honour a previously extracted prefix if one exists.
  if [ -d "$SYSROOT" ]; then
    LIB_DIRS="$(find "$SYSROOT" -name '*.so*' -exec dirname {} + 2>/dev/null | sort -u | paste -sd: || true)"
  fi
else
  log "chromium is missing system libraries; resolving them rootlessly"

  OS_ID=""; OS_VERSION=""
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-}"; OS_VERSION="${VERSION_ID:-}"
  fi

  case "$OS_ID:$OS_VERSION" in
    debian:12) PW_SUITE="debian12" ;;
    debian:13) PW_SUITE="debian13" ;;
    debian:11) PW_SUITE="debian11" ;;
    ubuntu:22.04) PW_SUITE="ubuntu22.04" ;;
    ubuntu:24.04) PW_SUITE="ubuntu24.04" ;;
    *) PW_SUITE="" ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) PW_ARCH="x64" ;;
    aarch64|arm64) PW_ARCH="arm64" ;;
    *) PW_ARCH="" ;;
  esac

  for tool in apt-get dpkg-deb curl; do
    command -v "$tool" >/dev/null 2>&1 || {
      warn "$tool is unavailable; cannot bootstrap Chromium libraries."
      warn "Install Chromium's system dependencies with root, or run: playwright install --with-deps chromium"
      exit 0
    }
  done

  if [ -z "$PW_SUITE" ] || [ -z "$PW_ARCH" ]; then
    warn "unsupported platform '$OS_ID $OS_VERSION $(uname -m)'; cannot map Playwright's package list."
    warn "Run with root: npx playwright install --with-deps chromium"
    exit 0
  fi

  # Playwright ships the authoritative per-platform package map. Read it
  # instead of hardcoding a list that would drift with Playwright updates.
  NATIVE_DEPS="$E2E_DIR/node_modules/playwright-core/lib/server/registry/nativeDeps.js"
  PW_PACKAGES=""
  if [ -r "$NATIVE_DEPS" ]; then
    PW_PACKAGES="$(PW_SUITE="$PW_SUITE" PW_ARCH="$PW_ARCH" NATIVE_DEPS="$NATIVE_DEPS" node --input-type=module -e '
      const mod = await import(process.env.NATIVE_DEPS)
      const table = mod.deps || mod.nativeDeps || mod.default?.deps || mod.default?.nativeDeps
      const key = `${process.env.PW_SUITE}-${process.env.PW_ARCH}`
      const entry = table?.[key]
      if (!entry) process.exit(0)
      // xvfb is a display server for headed runs and is never needed headless.
      const tools = (entry.tools || []).filter((name) => name !== "xvfb")
      process.stdout.write([...new Set([...(entry.chromium || []), ...tools])].join(" "))
    ' 2>/dev/null || true)"
  fi

  if [ -z "$PW_PACKAGES" ]; then
    warn "could not read Playwright's package list for $PW_SUITE-$PW_ARCH."
    warn "Run with root: npx playwright install --with-deps chromium"
    exit 0
  fi

  # Matches Playwright's own nativeDeps key: two spaces separate lib vs tool
  # packages, but a flat package set is fine for dependency resolution.
  log "packages: $PW_PACKAGES"

  apt_rootless() {
    apt-get \
      -o Dir::State::Lists="$APT_LISTS" \
      -o Dir::Cache="$APT_CACHE" \
      -o Dir::Cache::archives="$APT_CACHE/archives" \
      -o Dir::State::status=/var/lib/dpkg/status \
      -o Debug::NoLocking=1 \
      -o Acquire::Languages=none \
      -o APT::Sandbox::User=root \
      "$@"
  }

  log "fetching package indexes into $APT_LISTS"
  apt_rootless update -qq 2>&1 | sed 's/^/[setup-e2e-env]   /' || true

  # Resolve the full dependency closure. A simulation is enough to learn which
  # packages would be installed, and it needs no root.
  CLOSURE="$(apt_rootless -s install --no-install-recommends -y $PW_PACKAGES 2>/dev/null \
    | awk '/^Inst / { print $2 }' | sort -u | tr '\n' ' ' || true)"

  if [ -z "$CLOSURE" ]; then
    warn "apt could not resolve the package closure (missing indexes likely)."
    warn "Run with root: npx playwright install --with-deps chromium"
    exit 0
  fi

  log "closure: $CLOSURE"
  mkdir -p "$SYSROOT"

  for pkg in $CLOSURE; do
    deb="$DEBS_DIR/$pkg.deb"
    if [ ! -s "$deb" ]; then
      uri="$(apt_rootless download --print-uris "$pkg" 2>/dev/null | grep -o "http[^']*" | head -1 || true)"
      if [ -z "$uri" ]; then
        warn "no download URI for $pkg; skipping"
        continue
      fi
      curl -fsSL --retry 3 -o "$deb" "$uri" || { warn "download failed for $pkg"; rm -f "$deb"; continue; }
    fi
    dpkg-deb -x "$deb" "$SYSROOT" || warn "extract failed for $pkg"
  done

  LIB_DIRS="$(find "$SYSROOT" -name '*.so*' -exec dirname {} + 2>/dev/null | sort -u | paste -sd: || true)"
  log "extracted libraries into $SYSROOT"
fi

# ---------------------------------------------------------------------------
# 3. Fonts: point fontconfig at the fonts this machine actually has.
# ---------------------------------------------------------------------------
FONTCONFIG_OUT=""
FONT_DIRS=""
PROBE_FAILED=""

for font_dir in \
  "$SYSROOT/usr/share/fonts" \
  "$SYSROOT/usr/local/share/fonts" \
  /usr/share/fonts \
  /usr/local/share/fonts
do
  if [ -d "$font_dir" ] && [ -n "$(find "$font_dir" -type f \
    \( -name '*.ttf' -o -name '*.ttc' -o -name '*.otf' -o -name '*.pcf.gz' -o -name '*.pfb' \) \
    -print -quit 2>/dev/null)" ]; then
    FONT_DIRS="${FONT_DIRS}${FONT_DIRS:+:}$font_dir"
  fi
done

if [ -z "$FONT_DIRS" ]; then
  warn "no font files found (checked the extracted prefix and /usr/share/fonts)."
  warn "Chromium will measure every text range as 0x0 and the e2e suite will fail on"
  warn "text assertions. Install fonts with root, e.g. 'apt-get install fonts-liberation'."
  PROBE_FAILED=1
else
  FONTCONFIG_OUT="$CACHE_DIR/fonts.conf"
  mkdir -p "$CACHE_DIR/fontconfig"
  # The system fonts.conf that may live in the extracted prefix is not usable
  # here: it references /usr/share/fonts by absolute path, which does not exist
  # inside the sandbox. List the real directory names instead.
  {
    echo '<?xml version="1.0"?>'
    echo '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">'
    echo '<fontconfig>'
    # The trailing newline matters: `read` reports failure at EOF without a
    # delimiter, which silently skips the only line and yields a config with no
    # font directories at all.
    printf '%s\n' "$FONT_DIRS" | tr ':' '\n' | while IFS= read -r font_dir; do
      printf '  <dir>%s</dir>\n' "$font_dir"
    done
    printf '  <cachedir>%s/fontconfig</cachedir>\n' "$CACHE_DIR"
    for conf_d in "$SYSROOT/etc/fonts/conf.d" /etc/fonts/conf.d; do
      if [ -d "$conf_d" ]; then
        printf '  <include ignore_missing="yes">%s</include>\n' "$conf_d"
      fi
    done
    echo '</fontconfig>'
  } > "$FONTCONFIG_OUT"
  log "wrote $FONTCONFIG_OUT for fonts: $(printf '%s' "$FONT_DIRS" | tr ':' ' ')"
fi

# ---------------------------------------------------------------------------
# 4. Record the environment so `bun run test:e2e` reproduces it.
# ---------------------------------------------------------------------------
{
  echo "# Generated by scripts/setup-e2e-env.sh -- sourced by scripts/run-e2e.sh"
  echo "export PLAYWRIGHT_BROWSERS_PATH=\"$BROWSERS_DIR\""
  if [ -n "$LIB_DIRS" ]; then
    printf 'export LD_LIBRARY_PATH="%s%s"\n' "$LIB_DIRS" "${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
  if [ -n "$FONTCONFIG_OUT" ]; then
    printf 'export FONTCONFIG_FILE="%s"\n' "$FONTCONFIG_OUT"
  fi
} > "$ENV_FILE"
log "wrote $ENV_FILE"

# ---------------------------------------------------------------------------
# 5. Verify the result. A browser run is the only honest check here: a font
#    list can look right while Chromium still lays text out at zero size.
# ---------------------------------------------------------------------------
if [ -n "$CHROME_BIN" ]; then
  export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR"
  if [ -n "$LIB_DIRS" ]; then
    export LD_LIBRARY_PATH="$LIB_DIRS${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
  REMAINING="$(missing_libs "$CHROME_BIN" | tr '\n' ' ')"
  if [ -n "${REMAINING// /}" ]; then
    warn "chromium still has unresolved libraries: $REMAINING"
    warn "The e2e webServer will start, but browsers may fail to launch."
  else
    log "verified: chromium has no unresolved shared libraries"
  fi

  if [ -n "$FONTCONFIG_OUT" ]; then
    export FONTCONFIG_FILE="$FONTCONFIG_OUT"
    FONT_CHECK_HTML="$CACHE_DIR/font-check.html"
    cat > "$FONT_CHECK_HTML" <<'HTML'
<!doctype html><meta charset="utf-8">
<span id="probe" style="font:16px sans-serif">Researcher</span>
<script>
  var r = document.getElementById('probe').getBoundingClientRect();
  document.documentElement.setAttribute('data-text-width', Math.round(r.width));
</script>
HTML
    TEXT_WIDTH="$("$CHROME_BIN" --no-sandbox --disable-gpu --dump-dom "file://$FONT_CHECK_HTML" 2>/dev/null \
      | grep -o 'data-text-width="[0-9]*"' | head -1 | grep -o '[0-9]*' || true)"
    if [ -z "${TEXT_WIDTH:-}" ]; then
      warn "could not measure text in Chromium; skipping the font layout check."
    elif [ "$TEXT_WIDTH" -eq 0 ]; then
      warn "chromium lays 16px text out at zero width (0px), so text assertions will fail."
      warn "Check that FONTCONFIG_FILE=$FONTCONFIG_FILE lists directories that contain font files."
      PROBE_FAILED=1
    else
      log "verified: chromium lays 16px text out at ${TEXT_WIDTH}px using $FONTCONFIG_FILE"
    fi
  fi
fi

if [ -n "$PROBE_FAILED" ]; then
  warn "e2e environment is not usable: fix the font configuration above and re-run."
  exit 1
fi

log "done"
