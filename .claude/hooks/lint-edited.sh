#!/usr/bin/env bash
# PostToolUse(Write|Edit) — auto-fix lint on the file the agent just edited.
#
# File-scoped on purpose: `eslint .` over the whole project is ~13s here (type-
# aware rules), far too slow for the agent loop; a single file is ~5s. `--fix`
# silently repairs what it can. A remaining (unfixable) error is surfaced to the
# agent via exit code 2 + the message on stdout, so it can self-correct on the
# next turn (see CLAUDE.md "Exit codes and the feedback loop").
#
# Path comes from the hook's stdin JSON (tool_input.file_path), parsed with node
# — no jq dependency.
set -uo pipefail

FILE=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input?.file_path||"")}catch{console.log("")}})')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts | *.tsx | *.astro) ;;
  *) exit 0 ;;
esac

if ! OUT=$(npx eslint --fix --quiet "$FILE" 2>&1); then
  printf 'eslint found unfixable problems in %s:\n%s\n' "$FILE" "$OUT"
  exit 2
fi
exit 0
