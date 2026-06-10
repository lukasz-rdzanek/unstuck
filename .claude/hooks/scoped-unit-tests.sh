#!/usr/bin/env bash
# PostToolUse(Write|Edit) — run the unit/hermetic tests RELATED to an edited
# risk-area file (test-plan.md R1–R7 homes: services, API routes, security/
# domain libs, middleware). Vitest's static import graph picks only the affected
# tests, so this is ~1s, ideal for the agent loop.
#
# Two hard rules:
#   * `--project unit` — NEVER the integration project (that boots the Supabase
#     Docker stack; catastrophic per-edit). Integration stays a CI/dispatch gate.
#   * AI_AGENT=1 — Vitest 4.1+ compact reporter: only failures, less token noise.
#
# A failing related test exits 2 with the output on stdout so the agent reacts
# next turn. Files outside the risk areas, or with no related tests, are a fast
# no-op (exit 0). $FILE comes from the shared, jq-free stdin parser.
set -uo pipefail

source "$(dirname "$0")/_filepath.sh"
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

# Risk-area gate (test-plan.md §2). Everything else: no per-edit tests.
case "$FILE" in
  *src/lib/* | *src/pages/api/* | *src/middleware.ts) ;;
  *) exit 0 ;;
esac

if ! OUT=$(AI_AGENT=1 npx vitest related "$FILE" --run --project unit --passWithNoTests 2>&1); then
  printf 'Related unit tests failed for %s:\n%s\n' "$FILE" "$OUT"
  exit 2
fi
exit 0
