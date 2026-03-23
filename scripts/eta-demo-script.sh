#!/usr/bin/env bash

# Simulated ETA demo for README GIF.
# Run inside asciinema: asciinema rec docs/eta-demo.cast -c ./scripts/eta-demo-script.sh

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

# Simulate typing effect
type_slow() {
  local text="$1"
  local delay="${2:-0.04}"
  for ((i=0; i<${#text}; i++)); do
    printf '%s' "${text:$i:1}"
    sleep "$delay"
  done
}

clear

# Frame 1: Claude Code prompt
echo ""
printf "${BOLD}claude-eta demo${RESET} — real project, real data\n"
echo "─────────────────────────────────────────────────"
echo ""
sleep 1

# Frame 2: User types prompt
printf "${GREEN}❯${RESET} "
type_slow "add pagination to the /api/tasks endpoint"
sleep 0.5
echo ""
echo ""
sleep 0.3

# Frame 3: claude-eta injects context (simulated additionalContext)
printf "${DIM}[claude-eta] injecting velocity context...${RESET}\n"
sleep 0.4
printf "${CYAN}⏱ Estimated: 4m–12m${RESET} ${DIM}(75%%, based on 14 similar feature tasks)${RESET}\n"
echo ""
sleep 1.5

# Frame 4: Claude works
printf "${DIM}  Reading src/api/tasks.ts...${RESET}\n"
sleep 0.3
printf "${DIM}  Reading src/types/pagination.ts...${RESET}\n"
sleep 0.3
printf "${DIM}  Editing src/api/tasks.ts (+28 lines)...${RESET}\n"
sleep 0.4
printf "${DIM}  Editing src/api/tasks.test.ts (+45 lines)...${RESET}\n"
sleep 0.4
printf "${DIM}  Running npm test...${RESET}\n"
sleep 0.8
printf "${GREEN}  ✓ 12 tests passed${RESET}\n"
echo ""
sleep 0.5

# Frame 5: Task complete — claude-eta records
printf "${CYAN}[claude-eta]${RESET} Task completed: feature, ${BOLD}6m 14s${RESET}, 8 tool calls, 4 files\n"
printf "${DIM}             Within predicted interval [4m–12m] ✓${RESET}\n"
echo ""
sleep 1.5

# Frame 6: /eta stats
printf "${GREEN}❯${RESET} "
type_slow "/eta stats"
echo ""
echo ""
sleep 0.5

printf "${BOLD}Stats by Task Type (47 total)${RESET}\n\n"
printf "  Type       Count   Median   Range\n"
printf "  ─────────  ─────   ──────   ──────────\n"
printf "  feature       14   ${BOLD}8m${RESET}       4m–12m\n"
printf "  bugfix        15   ${BOLD}4m${RESET}       1m–9m\n"
printf "  refactor       8   ${BOLD}11m${RESET}      5m–22m\n"
printf "  config         6   ${BOLD}2m${RESET}       30s–5m\n"
printf "  docs           4   ${BOLD}3m${RESET}       1m–8m\n"
echo ""
sleep 2

# Frame 7: Tagline
echo "─────────────────────────────────────────────────"
printf "${BOLD}Claude guesses. claude-eta measures.${RESET}\n"
echo ""
sleep 2
