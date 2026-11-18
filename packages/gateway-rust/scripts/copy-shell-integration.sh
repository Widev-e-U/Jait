#!/bin/sh
# Optional native packaging adapter for a trusted, stable source tree.
# The production gateway build continues to use its existing Node script.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
rust_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
if [ "${JAIT_GATEWAY_PACKAGE_ROOT+x}" != x ]; then
  JAIT_GATEWAY_PACKAGE_ROOT=$(CDPATH= cd -- "$rust_root/../gateway" && pwd)
  export JAIT_GATEWAY_PACKAGE_ROOT
fi
exec "${CARGO:-cargo}" run --quiet --locked --manifest-path "$rust_root/Cargo.toml" --bin jait-copy-shell-integration -- "$@"
