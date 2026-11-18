#!/bin/sh
# Optional native generator for a source checkout. The production gateway build
# continues to use its existing Node script until Rust replacement gates pass.
# This dedicated CLI uses only std; compile it without building the gateway.
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
rust_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
project_root=$(CDPATH= cd -- "$rust_root/../.." && pwd)
if [ "${JAIT_GATEWAY_PACKAGE_ROOT+x}" != x ]; then
  JAIT_GATEWAY_PACKAGE_ROOT=$(CDPATH= cd -- "$rust_root/../gateway" && pwd)
  export JAIT_GATEWAY_PACKAGE_ROOT
fi
artifact_root="$project_root/.jait/artifacts/gateway-rust"
umask 077
mkdir -p -- "$artifact_root"
build_dir="$artifact_root/embed-shell-cli-$$"
mkdir -- "$build_dir"
trap 'rm -rf -- "$build_dir"' EXIT
trap 'exit 1' HUP INT TERM
"${RUSTC:-rustc}" --edition=2024 "$rust_root/src/bin/jait-embed-shell-integration.rs" -o "$build_dir/embed-shell-cli"
"$build_dir/embed-shell-cli" "$@"
