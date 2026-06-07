<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Answer-Matching (ai-answer-matching)

- **Plan**: context/changes/ai-answer-matching/plan.md
- **Scope**: Phases 1–4 (1–3 complete; Phase 4 deploy 4.1–4.3 done, 4.4/4.5 operator-pending)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 3 observations

Automated re-run at review: `npx astro check` → 0 errors / 0 warnings; `npm run lint` → 0 errors (34 pre-existing warnings); `npm run build` → Complete.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

🔒 **Access/answer-key invariant: PRESERVED** — `match_lesson_answers` gates on `has_course_access`; `set_message_embedding` is null-only + column-scoped (message immutability intact); the card renders `body` as escaped JSX text (no XSS) with a link built from a strict `^/courses/([^/]+)/lessons/` regex (no open-redirect); the 768-dim embedding never reaches the client bundle (explicit `select`, `LessonChatMessage` omits it).

Plan-adherence note: the Phase-1 sub-contract's literal SQL said a hard seed tier (`order by is_seeded desc, …`), but the implementation used the **soft additive +0.05 boost** stated in the Overview/decisions. The two parts of the plan disagreed; the implementation correctly followed the stated decision. Documented, not drift.

## Findings

### F1 — Embedding definer fns granted to `authenticated` without a per-call access gate

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Architecture
- **Location**: supabase/migrations/20260607130000_message_embeddings.sql:135-139
- **Detail**: `list_unembedded_messages` (SECURITY DEFINER, returns message `body`, no `has_course_access` gate) and `set_message_embedding` are granted to `authenticated`; only `match_lesson_answers` gates on access. Not exploitable today — all courses are `is_free`, so bodies are already readable via `messages_select_gated`, and embeddings are derived/null-only/non-overwriting. Becomes a real disclosure (unembedded bodies of a gated course → non-enrolled learners) + low-grade embedding-poison write the day a paid/gated course exists. Relates to the answer-key lesson (definer fns must gate access).
- **Decision**: ACCEPTED-AS-RISK — recorded in `context/foundation/roadmap.md` `## Blocked` alongside the existing gated-course deferral ("Gate the ai-answer-matching embedding definer fns for paid/gated courses"). No code change; zero impact under today's all-free-courses state. Un-park when a paid/gated course lands.

### F2 — HNSW index not used for the seed-boosted ORDER BY

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (performance)
- **Location**: supabase/migrations/20260607130000_message_embeddings.sql:82-89
- **Detail**: Ordering by the `(similarity + 0.05·seeded)` expression can't use the HNSW index → seq-scan + sort over the course's embedded messages. Inherent to the soft-boost decision; negligible at MVP corpus size.
- **Decision**: FIXED — added an inline comment documenting the deliberate boost-vs-index trade-off + a revisit note (two-pass ANN-then-rerank) for large corpora.

### F3 — match-answer endpoint didn't wrap the RPC calls in try/catch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Reliability
- **Location**: src/pages/api/lessons/[lessonId]/match-answer.ts
- **Detail**: `embedText` was caught, but a thrown `getCourseIdForLesson`/`matchAnswer` would 500 rather than `{match:null}`. Chat was never broken (client checks `res.ok` and silently shows no card), but the endpoint-level best-effort contract was incomplete.
- **Decision**: FIXED — wrapped course-resolve + embed + match in a single try/catch returning `{ ok: true, match: null }` on any throw.

### F4 — jsonResponse signature differed from the sibling endpoint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/embeddings/backfill.ts, src/pages/api/lessons/[lessonId]/match-answer.ts
- **Detail**: New routes used `jsonResponse(body, status)`; sibling `tests/[testId]/submit.ts` uses `(body, { status })`.
- **Decision**: FIXED — both new routes now use the object form + `JsonResponseInit` interface, matching the sibling.

## Triage summary

- **Fixed**: F2 (index comment), F3 (try/catch wrap), F4 (jsonResponse alignment)
- **Accepted-as-risk**: F1 (recorded in roadmap `## Blocked`; un-park with the first paid/gated course)

Rejected agent suggestion: re-adding `!data` / `?? []` null-guards on RPC results — the `@typescript-eslint/no-unnecessary-condition` rule rejects them and supabase-js returns `[]` (not null) on a successful empty result, so runtime is already safe.

Pending (operator-only, not code): 4.4 prod backfill drain + 4.5 prod card smoke.
