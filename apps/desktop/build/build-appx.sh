#!/usr/bin/env bash
# Build the Jait explorer-command DLL and prepare the appx-dist directory.
#
# Prerequisites (Linux cross-compile):
#   sudo apt install -y g++-mingw-w64-x86-64 imagemagick
#
# On Windows (native build):
#   Requires Visual Studio Build Tools (cl.exe) on PATH
#
# Usage:  ./build-appx.sh [--version 0.1.42]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR"
OUT_DIR="$DESKTOP_DIR/build/appx-dist"
VERSION="${1:-0.0.0.0}"

# Strip the leading --version flag if present
if [ "$VERSION" = "--version" ]; then
  VERSION="${2:-0.0.0.0}"
fi

echo "=== Building Jait AppX assets (version $VERSION) ==="

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# ── 1. Cross-compile the DLL ────────────────────────────────────────

DLL_SRC="$BUILD_DIR/explorer-command/explorer-command.cpp"
DLL_DEF="$BUILD_DIR/explorer-command/explorer-command.def"
DLL_OUT="$OUT_DIR/jait_explorer_command_x64.dll"

if command -v x86_64-w64-mingw32-g++ &>/dev/null; then
  echo "Cross-compiling DLL with MinGW..."
  x86_64-w64-mingw32-g++ \
    -shared -O2 -DUNICODE -D_UNICODE -DWIN32 -D_WINDOWS \
    -static-libgcc -static-libstdc++ \
    "$DLL_SRC" "$DLL_DEF" \
    -lole32 -lshlwapi -lshell32 -luuid \
    -o "$DLL_OUT"
  echo "DLL built: $DLL_OUT"
elif command -v cl.exe &>/dev/null; then
  echo "Compiling DLL with MSVC..."
  pushd "$BUILD_DIR/explorer-command"
  cl.exe /nologo /LD /EHsc /O2 /DUNICODE /D_UNICODE /DWIN32 /D_WINDOWS \
    explorer-command.cpp explorer-command.def \
    ole32.lib shell32.lib shlwapi.lib advapi32.lib \
    /Fe:"$DLL_OUT" /link /DEF:explorer-command.def
  popd
  echo "DLL built: $DLL_OUT"
else
  echo "WARNING: No C++ cross-compiler found (x86_64-w64-mingw32-g++ or cl.exe)."
  echo "Skipping DLL build. Windows 11 modern context menu will not be available."
fi

# ── 2. Generate icon PNGs for AppxManifest ───────────────────────────

ICON_SRC="$DESKTOP_DIR/assets/icon-1024.png"

if command -v convert &>/dev/null; then
  echo "Generating AppX icons..."
  convert "$ICON_SRC" -resize 44x44 "$OUT_DIR/icon-44.png"
  convert "$ICON_SRC" -resize 150x150 "$OUT_DIR/icon-150.png"
elif command -v magick &>/dev/null; then
  echo "Generating AppX icons..."
  magick "$ICON_SRC" -resize 44x44 "$OUT_DIR/icon-44.png"
  magick "$ICON_SRC" -resize 150x150 "$OUT_DIR/icon-150.png"
else
  echo "WARNING: ImageMagick not found. Copying source icon as placeholder."
  cp "$ICON_SRC" "$OUT_DIR/icon-44.png"
  cp "$ICON_SRC" "$OUT_DIR/icon-150.png"
fi

# ── 3. Generate AppxManifest.xml with version ────────────────────────

# Ensure version has 4 parts (x.y.z.0)
IFS='.' read -ra VER_PARTS <<< "$VERSION"
APPX_VERSION="${VER_PARTS[0]:-0}.${VER_PARTS[1]:-0}.${VER_PARTS[2]:-0}.0"

sed "s/@@VERSION@@/$APPX_VERSION/g" "$BUILD_DIR/appx/AppxManifest.xml" > "$OUT_DIR/AppxManifest.xml"

echo "=== AppX assets ready in $OUT_DIR ==="
ls -la "$OUT_DIR"
