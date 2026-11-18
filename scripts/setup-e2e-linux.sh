# Sourced by setup-e2e-env.sh after Playwright installs Chromium.
prepare_e2e_linux() {
  local runtime="$repo_root/.jait/artifacts/e2e-linux"
  local browser_dir browser missing dry_run package_list archive lib_dirs
  local -a packages downloads
  browser_dir="$("$playwright" install --dry-run chromium | sed -nE 's/^ *Install location: *(.*chromium_headless_shell-[0-9]+)$/\1/p')"
  browser="$(find "$browser_dir" -type f -name chrome-headless-shell -print -quit)"
  if [[ -z "$browser" ]]; then
    printf 'Could not find the Chromium headless shell installed by Playwright.\n' >&2
    return 1
  fi
  if [[ -d "$runtime/sysroot" ]]; then
    lib_dirs="$(find "$runtime/sysroot" -type f -name '*.so*' -printf '%h\n' | sort -u | paste -sd:)"
    [[ -z "$lib_dirs" ]] || export LD_LIBRARY_PATH="$lib_dirs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    [[ ! -f "$runtime/fonts.conf" ]] || export FONTCONFIG_FILE="${FONTCONFIG_FILE:-$runtime/fonts.conf}"
  fi
  missing="$(ldd "$browser" | grep 'not found' || true)"
  [[ -n "$missing" ]] || return 0

  if ! command -v apt-get >/dev/null || ! command -v dpkg-deb >/dev/null; then
    printf 'Install Chromium system dependencies for this distribution:\n%s\n' "$missing" >&2
    return 1
  fi
  dry_run="$("$playwright" install-deps --dry-run chromium)"
  package_list="$(sed -nE 's/.*apt-get install -y --no-install-recommends ([a-zA-Z0-9+. -]+).*/\1/p' <<< "$dry_run")"
  if [[ -z "$package_list" ]]; then
    printf 'Could not determine Chromium dependencies from Playwright.\n' >&2
    return 1
  fi
  read -r -a packages <<< "$package_list"
  mkdir -p "$runtime"/{lists/partial,cache/archives/partial,debs,sysroot}
  local -a apt=(apt-get -o "Dir::State::Lists=$runtime/lists" -o "Dir::Cache=$runtime/cache"
    -o Debug::NoLocking=1 -o "APT::Sandbox::User=$(id -un)" -o Acquire::Retries=1 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15)
  "${apt[@]}" update -qq
  package_list="$("${apt[@]}" -s install --no-install-recommends "${packages[@]}" | awk '$1 == "Inst" && $3 !~ /^\[/ { print $2 }' | paste -sd ' ')"
  if [[ -z "$package_list" ]]; then
    printf 'APT found no packages for missing Chromium libraries:\n%s\n' "$missing" >&2
    return 1
  fi
  read -r -a downloads <<< "$package_list"
  (
    cd "$runtime/debs"
    "${apt[@]}" download "${downloads[@]}"
    for archive in *.deb; do
      dpkg-deb -x "$archive" "$runtime/sysroot"
    done
  )
  lib_dirs="$(find "$runtime/sysroot" -type f -name '*.so*' -printf '%h\n' | sort -u | paste -sd:)"
  [[ -z "$lib_dirs" ]] || export LD_LIBRARY_PATH="$lib_dirs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  if [[ -d "$runtime/sysroot/usr/share/fonts" && -z "${FONTCONFIG_FILE:-}" ]]; then
    local escaped_runtime
    escaped_runtime="$(printf '%s' "$runtime" | sed 's/\&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')"
    printf '<fontconfig><dir>/usr/share/fonts</dir><dir>%s/sysroot/usr/share/fonts</dir><cachedir>%s/font-cache</cachedir></fontconfig>\n' \
      "$escaped_runtime" "$escaped_runtime" > "$runtime/fonts.conf"
    export FONTCONFIG_FILE="$runtime/fonts.conf"
  fi
  missing="$(ldd "$browser" | grep 'not found' || true)"
  if [[ -n "$missing" ]]; then
    printf 'Chromium still has missing libraries after rootless setup:\n%s\n' "$missing" >&2
    return 1
  fi
}
