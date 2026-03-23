#!/usr/bin/env bash

# Render and convert the ETA demo to GIF
#
# Prerequisites: node, ffmpeg (optional for MP4)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOOLS_DIR="$REPO_ROOT/.tools"
AGG_VERSION="${AGG_VERSION:-v1.7.0}"

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

resolve_agg_asset() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os/$arch" in
    Linux/x86_64) echo "agg-x86_64-unknown-linux-gnu" ;;
    Linux/aarch64|Linux/arm64) echo "agg-aarch64-unknown-linux-gnu" ;;
    Darwin/x86_64) echo "agg-x86_64-apple-darwin" ;;
    Darwin/arm64) echo "agg-aarch64-apple-darwin" ;;
    *)
      echo "Unsupported platform for auto-downloaded agg: $os/$arch" >&2
      exit 1
      ;;
  esac
}

ensure_agg() {
  if command -v agg >/dev/null 2>&1; then
    command -v agg
    return 0
  fi

  require_command curl
  mkdir -p "$TOOLS_DIR"

  local asset url target
  asset="$(resolve_agg_asset)"
  target="$TOOLS_DIR/${asset}-${AGG_VERSION}"

  if [ ! -x "$target" ]; then
    url="https://github.com/asciinema/agg/releases/download/${AGG_VERSION}/${asset}"
    echo "Downloading agg ${AGG_VERSION} (${asset})..." >&2
    curl -fsSL "$url" -o "$target"
    chmod +x "$target"
  fi

  echo "$target"
}

require_command node
AGG_BIN="$(ensure_agg)"

echo "Rendering deterministic cast..."
node "$SCRIPT_DIR/render-eta-demo-cast.mjs" "$REPO_ROOT/docs/eta-demo.cast"

echo "Converting to GIF..."
"$AGG_BIN" "$REPO_ROOT/docs/eta-demo.cast" \
  "$REPO_ROOT/docs/eta-demo.gif" \
  --cols 80 \
  --rows 24 \
  --theme monokai \
  --speed 1.2 \
  --font-size 16

echo "Converting to MP4..."
ffmpeg -y -i "$REPO_ROOT/docs/eta-demo.gif" \
  -pix_fmt yuv420p \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  "$REPO_ROOT/docs/eta-demo.mp4" 2>/dev/null || echo "ffmpeg not found — skip MP4"

echo ""
echo "Done:"
ls -lh "$REPO_ROOT/docs/eta-demo.gif"
echo ""
echo "Preview: open $REPO_ROOT/docs/eta-demo.gif"
