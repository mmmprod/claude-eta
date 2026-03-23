#!/usr/bin/env bash

# Benchmark hook execution time (cold start Node.js + real hook I/O)
# Usage: ./scripts/bench-hooks.sh [iterations]

set -euo pipefail

ITERS=${1:-20}
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_DIR="$REPO_ROOT/dist/hooks"
TMP_ROOT="$(mktemp -d)"
BENCH_CWD="$TMP_ROOT/project"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$BENCH_CWD"

if [ ! -f "$HOOK_DIR/on-tool-use.js" ]; then
  echo "dist/hooks not found. Run npm run build first." >&2
  exit 1
fi

now_ns() {
  date +%s%N 2>/dev/null || python3 - <<'PY'
import time
print(int(time.time() * 1_000_000_000))
PY
}

seed_session() {
  local data_dir="$1"
  local session_id="$2"
  CLAUDE_PLUGIN_DATA="$data_dir" node "$HOOK_DIR/on-session-start.js" > /dev/null 2>&1 <<EOF
{"session_id":"$session_id","cwd":"$BENCH_CWD","source":"bench","model":"claude-sonnet-4-20250514"}
EOF
}

seed_active_turn() {
  local data_dir="$1"
  local session_id="$2"
  CLAUDE_PLUGIN_DATA="$data_dir" node "$HOOK_DIR/on-prompt.js" > /dev/null 2>&1 <<EOF
{"session_id":"$session_id","cwd":"$BENCH_CWD","prompt":"fix the benchmarked bug in auth.ts"}
EOF
}

build_payload() {
  local hook="$1"
  local session_id="$2"

  case "$hook" in
    on-tool-use)
      cat <<EOF
{"session_id":"$session_id","cwd":"$BENCH_CWD","tool_name":"Read","tool_input":{"file_path":"$REPO_ROOT/package.json"},"tool_response":{"ok":true}}
EOF
      ;;
    on-tool-failure)
      cat <<EOF
{"session_id":"$session_id","cwd":"$BENCH_CWD","tool_name":"Bash","error":"permission denied","is_interrupt":false}
EOF
      ;;
    on-prompt)
      cat <<EOF
{"session_id":"$session_id","cwd":"$BENCH_CWD","prompt":"fix the benchmarked bug in auth.ts"}
EOF
      ;;
    on-stop)
      cat <<EOF
{"session_id":"$session_id","cwd":"$BENCH_CWD","last_assistant_message":"Done.","stop_hook_active":false}
EOF
      ;;
    *)
      return 1
      ;;
  esac
}

prepare_hook() {
  local hook="$1"
  local data_dir="$2"
  local session_id="$3"

  case "$hook" in
    on-tool-use|on-tool-failure|on-stop)
      seed_session "$data_dir" "$session_id"
      seed_active_turn "$data_dir" "$session_id"
      ;;
    on-prompt)
      seed_session "$data_dir" "$session_id"
      ;;
  esac
}

bench_hook() {
  local hook="$1"
  local label="$2"
  local total_ns=0

  for i in $(seq 1 "$ITERS"); do
    local data_dir="$TMP_ROOT/${hook}-${i}"
    local session_id="bench-${hook}-${i}"
    mkdir -p "$data_dir"
    prepare_hook "$hook" "$data_dir" "$session_id"
    local payload
    payload="$(build_payload "$hook" "$session_id")"

    local start_ns
    start_ns="$(now_ns)"
    CLAUDE_PLUGIN_DATA="$data_dir" node "$HOOK_DIR/${hook}.js" > /dev/null 2>&1 <<<"$payload" || true
    local end_ns
    end_ns="$(now_ns)"

    total_ns=$((total_ns + end_ns - start_ns))
  done

  local avg_ms=$((total_ns / ITERS / 1000000))
  printf '%s: avg %sms over %s runs\n' "$label" "$avg_ms" "$ITERS"
}

echo "Benchmarking $ITERS iterations..."
echo

bench_hook on-tool-use "PostToolUse"
bench_hook on-tool-failure "PostToolUseFailure"
bench_hook on-prompt "UserPromptSubmit"
bench_hook on-stop "Stop"
