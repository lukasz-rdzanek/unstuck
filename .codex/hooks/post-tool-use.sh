#!/usr/bin/env bash
# Codex `PostToolUse` hook — the Codex equivalent of the Claude per-edit hooks.
# Codex uses a Claude-style hooks.json ({hooks:{PostToolUse:[{matcher,hooks}]}}),
# but two realities make it behave differently from Claude/Cursor:
#
#   1. No clean edited-file path. Codex 0.130+ routes most file edits through the
#      `Bash` tool (and `apply_patch`), so the stdin payload has no reliable
#      `file_path`. A file-SCOPED lint/test isn't dependable here. Instead we run
#      the whole UNIT suite — it's ~1s (`vitest run --project unit`), so scoping
#      isn't needed. (Lint is skipped: whole-project eslint is ~13s, too slow.)
#   2. PostToolUse fires after EVERY Bash command, not just edits. We parse the
#      documented `tool_name` + `tool_input.command` fields and only run when the
#      tool is `apply_patch` or a write-ish Bash command, so plain `ls`/`git`
#      don't trigger the suite.
#
# On failure we print the output and exit 2 (Codex aligned its hook feedback to
# Claude-style in 2026). No jq — node parses stdin.
set -uo pipefail

DECISION=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const t=j.tool_name||"";const c=(j.tool_input&&j.tool_input.command)||"";const writeish=/(>>?|\btee\b|\bsed\s+-i\b|\bapply_patch\b|\bmv\b|\bcp\b|\bdd\b)/.test(c);console.log(t==="apply_patch"||(t==="Bash"&&writeish)?"RUN":"SKIP")}catch{console.log("SKIP")}})')
[ "$DECISION" = "RUN" ] || exit 0

if ! OUT=$(AI_AGENT=1 npm run --silent test 2>&1); then
  printf 'Unit tests failed after a Codex edit:\n%s\n' "$OUT"
  exit 2
fi
exit 0
