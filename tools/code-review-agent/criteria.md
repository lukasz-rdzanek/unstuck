# Code Review Criteria — Unstuck (M5L3, Task 1)

The Definition of Done the agent scores every PR against. Six criteria, each on a
1–10 scale with explicit anchors so the verdict is not subjective. These are the
_internal_ requirements that existed long before the agent — AI helped surface the
stack-typical ones, but the load-bearing rules are ours (see `AGENTS.md` +
`context/foundation/lessons.md`, injected at runtime by `common/repo-rules.ts`).

The agent emits one 1–10 score per criterion, an overall `score`, and a binding
`verdict` (`pass`/`fail`). A single critical tripwire (RLS, IDOR, secret leak) is
grounds for `fail` regardless of the other scores.

| #   | Criterion                      | 1 (worst)                                                                                                                                         | 10 (best)                                                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | **Implementation correctness** | Logic is wrong or silently breaks existing behavior.                                                                                              | Correct on the happy path, edge cases, and error handling.                                                  |
| 2   | **Idiomaticity / conventions** | Breaks repo conventions (e.g. a `"use client"` directive in this Astro repo; manual class concat instead of `cn()`; missing `prerender = false`). | Fully matches AGENTS.md/CLAUDE.md conventions and the surrounding code's idiom.                             |
| 3   | **Complexity**                 | Unjustified complexity; hard to maintain.                                                                                                         | Simplest solution adequate to the problem.                                                                  |
| 4   | **Test coverage vs risk**      | A risky change (logic, RLS, security path) ships with no tests.                                                                                   | Coverage proportional to risk; the riskiest paths are exercised.                                            |
| 5   | **Documentation**              | Non-obvious behavior or a schema/contract change lands with no docs/comments.                                                                     | Changes are documented where it matters (context docs, comments on non-obvious code, migration notes).      |
| 6   | **Security**                   | Serious vulnerability: new table without RLS, secret leak, missing access gate, IDOR (trusting client-supplied identity).                         | No vulnerabilities; RLS + per-op policies on new tables; identity from the session; access correctly gated. |

## Stack-specific tripwires (auto `fail` candidates)

Drawn from `AGENTS.md` and `context/foundation/lessons.md`:

- New Supabase table **without `ENABLE ROW LEVEL SECURITY`** + per-operation policies.
- A Next.js directive (`"use client"` / `"use server"`) — this is **Astro**.
- An API route missing `export const prerender = false`.
- Weakening **answer-key protection** (enable-not-force RLS + definer-owned functions).
- Turning `SRS_CARD_COLUMNS` from a string literal into a `.join()` (breaks Supabase
  `.select()` row-type inference — caught by `astro check`, not `astro build`).
- Request input not validated with zod.

## How to evolve this

This file is the regression target. When the agent misses a real defect (a bug
reached `master` it passed) or over-flags (a human had to overrule it), update a
criterion's anchor here and add a fixture to `evals/` so promptfoo re-checks it.
