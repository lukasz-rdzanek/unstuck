---
name: code-review
description: >-
  Review a diff or PR the Unstuck way — score six criteria (1–10), honor the repo's
  load-bearing tripwires (RLS, no Next.js directives, prerender=false, cn(), zod,
  answer-key protection), and return a binding pass/fail verdict. Use when asked to
  review code, a diff, or a pull request, or before merging a risky change.
---

# Code Review (Unstuck team standard)

The portable form of the FS-2 "PR Risk Triage" reviewer. Works in any tool that
reads `SKILL.md` (Claude Code, Cursor, Codex). For the runnable agent + CI pipeline
behind this skill, see `tools/code-review-agent/` in the unstuck repo.

## How to review

1. Read the diff (and the PR title/body if present).
2. Score each criterion 1–10 against the anchors below.
3. Check the tripwires — any hit is a candidate for an automatic `fail`.
4. Return a short Markdown summary + a binding `pass`/`fail` verdict. When you can,
   emit structured JSON: `{implementationCorrectness, idiomaticity, complexity,
testRiskCoverage, documentation, securitySafety, score, verdict, summary}`.

## Criteria (1 = worst, 10 = best)

| #   | Criterion                  | 1                                    | 10                                              |
| --- | -------------------------- | ------------------------------------ | ----------------------------------------------- |
| 1   | Implementation correctness | wrong / silently breaks behavior     | correct incl. edge cases + error handling       |
| 2   | Idiomaticity / conventions | breaks repo conventions              | matches AGENTS.md/CLAUDE.md + surrounding idiom |
| 3   | Complexity                 | unjustified complexity               | simplest solution adequate to the problem       |
| 4   | Test coverage vs risk      | risky change, no tests               | coverage proportional to risk                   |
| 5   | Documentation              | non-obvious change, no docs          | documented where it matters                     |
| 6   | Security                   | RLS/secret/access/IDOR vulnerability | no vulnerabilities; access correctly gated      |

## Tripwires (auto-`fail` candidates)

- New Supabase table **without `ENABLE ROW LEVEL SECURITY`** + per-operation policies.
- A Next.js directive (`"use client"` / `"use server"`) — this is **Astro**, not Next.
- An API route missing `export const prerender = false`.
- Request input not validated with **zod**.
- **IDOR**: user identity taken from the request body instead of the session.
- Manual Tailwind class concatenation instead of `cn()` from `@/lib/utils`.
- Weakening answer-key protection (enable-not-force RLS + definer-owned functions).
- Turning `SRS_CARD_COLUMNS` into a `.join()` (breaks Supabase `.select()` row-type
  inference — caught by `astro check`, not `astro build`).

## Notes

A single critical tripwire (RLS, IDOR, secret leak) warrants `fail` regardless of the
other scores. Point at the file + line + the specific rule, not generic advice.
