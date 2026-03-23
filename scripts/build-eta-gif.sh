#!/usr/bin/env bash

# Record and convert the ETA demo to GIF
#
# Prerequisites: asciinema, agg (https://github.com/asciinema/agg)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Recording..."
asciinema rec "$REPO_ROOT/docs/eta-demo.cast" \
  --cols 80 \
  --rows 24 \
  --command "$SCRIPT_DIR/eta-demo-script.sh" \
  --overwrite

echo "Converting to GIF..."
agg "$REPO_ROOT/docs/eta-demo.cast" \
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
