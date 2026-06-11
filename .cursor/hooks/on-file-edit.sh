#!/usr/bin/env bash
# Cursor `afterFileEdit` hook — the Cursor equivalent of the Claude Code per-edit
# hooks (.claude/settings.json). Same intent, two tool-specific differences:
#
#   1. Payload shape: Cursor sends `{ "file_path": "<abs>", "edits": [...] }` on
#      stdin — `file_path` is TOP-LEVEL, not Claude's `tool_input.file_path`.
#   2. Signal: `afterFileEdit` is FIRE-AND-FORGET. Cursor ignores the exit code
#      and cannot inject feedback into the agent (only the `before*` hooks can).
#      So the value here is the `eslint --fix` SIDE EFFECT (auto-repair, which
#      persists) plus logging to stderr (Cursor shows hook stderr in its logs).
#
# Lint/test logic mirrors the Claude hooks: file-scoped eslint, and unit tests
# pinned to `--project unit` (never the integration Docker stack). No jq — node
# parses stdin.
set -uo pipefail

FILE=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).file_path||"")}catch{console.log("")}})')
[ -z "$FILE" ] && exit 0

# Auto-fix lint (side effect persists even though Cursor ignores our exit code).
case "$FILE" in
  *.ts | *.tsx | *.astro) npx eslint --fix --quiet "$FILE" >/dev/null 2>&1 || true ;;
esac

# Scoped unit tests on risk-area files (test-plan.md R1–R7); log failures to
# stderr since we can't feed them back to the agent.
case "$FILE" in
  *src/lib/*.ts | *src/lib/*.tsx | *src/pages/api/*.ts | *src/pages/api/*.tsx | *src/middleware.ts)
    if ! AI_AGENT=1 npx vitest related "$FILE" --run --project unit --passWithNoTests >/dev/null 2>&1; then
      echo "[cursor-hook] related unit tests FAILED for $FILE — run: npx vitest related \"$FILE\" --run --project unit" >&2
    fi
    ;;
esac
exit 0
