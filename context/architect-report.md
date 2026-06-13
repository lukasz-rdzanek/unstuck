# 10xArchitect Report — Module 4 (Unstuck)

Two-page synthesis of the four module-4 artifacts. Built only from those
artifacts; structural claims trace to them, not to memory.

## 1. Project covered

All four artifacts were produced on **one repository — Unstuck** (a single-repo
MVP, so no cross-repo split to report):

- **Stack:** Astro 6 SSR, React 19 islands, Tailwind 4, Supabase (auth + Postgres + RLS + RPC + Realtime), deployed to Cloudflare Workers. TypeScript 5.9, Vitest + Playwright.
- **Scale:** ~91 source files, 198 commits over ~17 days; beta-complete, in the testing/hardening phase. Single human author + AI co-authors.
- **Artifacts:** L2 map, L3 feature research, L4 refactor plan, L5 domain notes — all on this repo.

## 2. Project map (L2 — `context/map/repo-map.md`)

- **Load-bearing hub:** `src/lib/supabase.ts` — afferent 22 (11 API routes + 5 SSR pages + middleware import the value; 5 services type-only via DI). Biggest blast radius; rendered in `supabase-blast-radius.svg`.
- **Clean structure:** zero import cycles; services take the Supabase client by dependency injection; layers point strictly downward (pages/islands → services → data).
- **The real risk is invisible to the import graph:** RLS policies, Realtime subscriptions, and RPCs are runtime couplings no static graph shows — that's where "surprise" lives.
- **Process vs product:** `context/**` and `.claude/**` dominate churn but are the dev-process record, not product hotspots. Product core = the course→lesson learning flow + API surface + chat + auth.
- **Bus factor 1** — knowledge concentrated in one author; the rich `context/` archive is the contributor map.

## 3. Feature analysis (L3 — `context/changes/practice-srs-grading-analysis/research.md`)

- **Flow studied & why:** the **practice answer → grade → SRS reschedule** path — risk zone #5 of the map (core business logic over RPCs, correctness-sensitive).
- **Feature overview:** `POST /api/practice/[questionId]/grade` is _two_ DB round-trips — a `grade_question` SECURITY DEFINER RPC computes correctness with the answer key kept server-side, then the handler reads the FSRS card, advances it via `src/lib/srs.ts` (correct→Good, wrong→Again), and upserts `srs_question_state`. It is **fail-loud** (a failed reschedule returns 500, fixed in M3L5) — deliberately unlike `tests/submit`, which is best-effort.
- **Technical debt (≥1 ast-grep-verified):**
  - `CARD_COLUMNS` card-column string duplicated across 3 routes — **ast-grep confirmed ×3** (grade.ts:8, rate.ts:24, submit.ts:6; submit carries a load-bearing extra `question_id`). No compiler link → a column rename drifts silently.
  - `grade_question` return consumed via an `as` cast over an opaque `Json` (Supabase codegen artifact) — silent runtime failure if the SQL shape drifts.
  - `srs.ts` is a shared FSRS hub feeding 3 routes / 2 tables, but git co-change _under-reports_ it (a reviewer trusting history misses the blast radius).

## 4. Refactor plan (L4 — `context/changes/refactor-opportunities/plan.md`, reviewed SOUND)

- **Chosen:** consolidate `CARD_COLUMNS` into one **type-derived single source** in `srs.ts` (compiler-bound to `keyof SrsCardFields`), + a shared lenient-UUID zod refinement (C3). History flipped the ranking: C1 is accidental drift (fixable); C2 (the RPC `as` cast) turned out to be a _forced, repo-wide Supabase-codegen convention_ → deferred.
- **Explicitly NOT doing:** C2 (RPC return validation — separate repo-wide change), C4 (`jsonResponse` helper), no FSRS/DB/RLS/RPC change.
- **Phases (each a reversible commit; verification auto + manual):**
  1. Characterize the current 9-column contract with a test — _auto:_ test+lint.
  2. Introduce `SRS_CARD_COLUMNS` (compiler-bound, unconsumed) — _auto:_ build/typecheck proves the `satisfies` binding.
  3. Swap the 3 routes to the shared source — _auto:_ tests + `grep` clean; _manual:_ smoke the 3 routes.
  4. Shared `uuidString` refinement — _auto:_ tests + grep clean; _manual:_ 400 unchanged.

## 5. Domain (L5 — `context/domain/*.md`)

- **Ubiquitous language & model-vs-code:** the FSRS scheduling card is the "3xAccount" of this repo — one concept appearing as `SrsCardFields`, two tables (`srs_review_state`/`srs_question_state`), "review" vs "practice" routes, and the byte-copied `CARD_COLUMNS`. **#1 divergence:** the lesson-**review** feature is _declared but ignored_ — the schema's `review_enabled`, the `/api/reviews/[lessonId]/rate` endpoint, and `srs_review_state` exist and are tested, but `complete.ts` never enrols a lesson and **no UI calls the endpoint** — an orphaned, unreachable feature the code misrepresents.
- **Invariant #1 + aggregate:** _"an SRS card's schedule advances only through a graded review, atomically or fail-loud."_ Today the load→`applyRating`→upsert is re-implemented inline in 3 routes with a **non-atomic read-modify-write under caller RLS** (a lost-update race invisible to tests). Proposed guardian: an `SrsCard` aggregate whose only mutator is `applyReview`, backed by an `advance_srs_card` SECURITY DEFINER RPC for atomicity + a named `SrsRescheduleError`.
- **Anti-Corruption Layer:** `ts-fsrs` **passes** the success criterion today — `grep ts-fsrs src/` hits only `src/lib/srs.ts`; the `Card` type never leaks into schema/API/UI. Next-worst leak: `@supabase/*` spans 5 layers and 2 services bypass the wrapper (`messages.ts:14`, `answer-match.ts:14`), with a Realtime enum reaching the client bundle.

## 6. Decisions that are mine (for the human to own / confirm)

- **Stay on rung 1 of the context ladder (L1).** AI could have scaffolded per-module structure; I judged the MVP doesn't warrant it and recorded the escalation signals instead.
- **Deep-Focus target (L3).** AI surfaced several risk zones; I chose practice/SRS grading because it is core business logic with the runtime coupling a map can't explain — the highest-learning target.
- **Right-sizing the refactor (L4).** AI's ranking initially favored the flashy RPC-typing fix; I accepted the history evidence that it's a forced convention and chose the cheaper, genuinely-accidental `CARD_COLUMNS` consolidation + UUID dedup, deferring C2/C4. Guard-first, reversible.
- **What to defer vs close now.** I implemented the L4 plan to close the one ready, reviewed, reversible change, but deliberately left the **DDD plans (aggregate refactor, @supabase ACL)** and the **orphaned-review decision (wire vs cut)** as the post-MVP cycle's backlog — they are larger, domain-level calls a human should make, not bundle into a cleanup.
- **The orphaned review feature is the most important finding** and is mine to act on: decide whether the lesson-review loop ships (wire enrolment + a due-review UI) or is cut — the code currently lies about it either way.

---

**Backlog handed forward (value × risk):** wire-or-cut lesson review → SRS aggregate + atomic `advance_srs_card` (close the race) → `@supabase` ACL → C2 RPC-return validation → C4 `jsonResponse` helper. Sources: `context/domain/0{1,2,3,4}*.md`, `context/changes/refactor-opportunities/research.md`.
