# AI Answer-Matching — Plan Brief

> Full plan: `context/changes/ai-answer-matching/plan.md`

## What & Why

When a learner posts a question in a lesson's chat, automatically surface the single most relevant prior answer from the whole course's past discussions — a dismissible "You might find this helpful" card beneath their message. It's the v2 evolution of the v1 curated-seeding rule: curated seeds stay the quality anchor, but the growing peer-knowledge base becomes semantically searchable so a learner gets unblocked instantly instead of waiting for a peer.

## Starting Point

Lesson chat works today: immutable, append-only `messages` (operator-seeded vs peer), browser-direct inserts + Supabase Realtime, gated by `has_course_access`. There is **no rating data** of any kind, and **no API routes** for chat. Astro 6 on Cloudflare Workers; bindings via `import { env } from "cloudflare:workers"`.

## Desired End State

Posting a question shows (within ~1–2s) one subtle, dismissible card with the best matching prior answer, a "from <lesson>" label when cross-lesson, and a seeded badge for curated hits. Below the relevance threshold → nothing appears. Matches always respect course access. Verified locally, then live in prod with an embedding backfill.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| "Best" definition | Semantic relevance + seed-boost | No rating data exists; curated seeds are the quality signal. | Plan |
| Embedding generator | Cloudflare Workers AI (`bge-base-en-v1.5`, 768d) | Same runtime we deploy to; one binding, no external key/cost. | Plan |
| Corpus scope | Whole course | Bigger, more useful pool; related Qs span sibling lessons. | Plan |
| Trigger point | After posting (passive) | Simplest; no debounce/typing infra; still unblocks fast. | Plan |
| Embed pipeline | Async backfill, lazy embed | Leaves the working insert/Realtime path untouched. | Plan |
| UI surface | Dismissible suggestion card | Clearly an AI suggestion; fits the message-list flow. | Plan |
| No-match behavior | Silent (show nothing) | Avoids false-positive noise; builds trust. | Plan |
| Suggestions count | Top 1 | Decisive, lowest cognitive load. | Plan |
| Candidate filter | Light heuristic | Exclude self / just-posted / <40-char; cheap noise cut. | Plan |
| Ship target | Local-first, prod after verify | Mirrors learning-loop; de-risks new extension/binding. | Plan |

## Scope

**In scope:** pgvector + 768d embedding column + HNSW index; `match_lesson_answers` definer RPC (reuses `has_course_access`); narrow `set_message_embedding` definer writer; Workers AI embed helper; operator-gated backfill endpoint; live match endpoint; dismissible suggestion card in the chat island; prod deploy + backfill.

**Out of scope:** rating/upvote system; any change to the insert/Realtime/optimistic path; as-you-type matching; cross-course/global matching; multiple suggestions; queue/cron (pgmq/pg_net/pg_cron) infra; LLM rerank/moderation.

## Architecture / Approach

Each message carries a 768d embedding. A posted question is embedded on the fly (Workers AI) and ranked against the course's embedded messages by cosine distance inside a `SECURITY DEFINER` RPC (PostgREST can't run vector operators) — excluding self/just-posted/short messages, boosting seeded rows, returning top-1 above threshold or nothing. Stored embeddings are produced by an operator-triggered, idempotent backfill endpoint that writes via a column-scoped, null-only definer fn (the table is immutable to `authenticated` and `service_role` is intentionally absent). UI adds one card after a post; the proven chat flow is untouched.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vector schema + match RPC | pgvector, embedding column+index, two definer fns | Index/threshold tuning; immutability-safe writer |
| 2. Embedding pipeline | `ai` binding, embed helper, operator backfill endpoint | Workers AI needs Cloudflare creds in local dev |
| 3. Match endpoint + card | live match API + dismissible suggestion card | Not disturbing the optimistic/Realtime chat path |
| 4. Ship to prod | migrations, deploy, prod backfill, smoke | pgvector + Workers AI enabled on prod project |

**Prerequisites:** Cloudflare account with Workers AI enabled; `wrangler login` (or `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`) for local embedding; operator UUID set as `OPERATOR_USER_ID`.
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Workers AI calls are not emulated locally — Phases 2–3 manual verification needs real Cloudflare credentials.
- Relevance threshold (~0.72) is a starting guess; needs tuning against real chat data during Phase 3.
- Match quality is only as good as the corpus — sparse early data means frequent silence (accepted, by the "silent below threshold" decision).
- Letting `authenticated` execute the embedding-writer/reader fns is acceptable because they only touch derived embeddings / RLS-accessible bodies, and backfill is operator-gated at the API layer.

## Success Criteria (Summary)

- Posting a near-duplicate question surfaces exactly one relevant, correctly-labeled, dismissible card; novel questions stay silent.
- A learner never sees a match from a course they can't access.
- The existing chat (optimistic post, Realtime, load-older, reconnect) is completely unaffected.
