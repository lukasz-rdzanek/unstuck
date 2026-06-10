#!/usr/bin/env bash
# Shared helper for the PostToolUse hooks: parse the edited file's path from the
# event JSON on stdin and leave it in $FILE. Uses node (a guaranteed dependency
# in this Node/Astro repo) instead of jq, so the hooks need no system binary.
#
# Source this — do NOT execute it. It reads (and consumes) the caller's stdin.
FILE=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input?.file_path||"")}catch{console.log("")}})')
