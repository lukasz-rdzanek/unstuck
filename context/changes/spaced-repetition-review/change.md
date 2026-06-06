---
change_id: spaced-repetition-review
title: Spaced-repetition review for lessons (FSRS-6 via ts-fsrs)
status: implementing
created: 2026-06-06
updated: 2026-06-06
archived_at: null
---

## Notes

Add spaced-repetition review to Unstuck so learners retain lesson material over time.

**Deep-research conclusion (2026-06-06):** use the **FSRS-6** algorithm via the **ts-fsrs** library (MIT, zero runtime deps, TypeScript-native, Cloudflare Workers/edge-compatible; pairs with Supabase/Postgres for per-item state). FSRS beat SM-2 on log loss for ~99.6% of users on the largest public benchmark and is documented to need ~20–30% fewer reviews for equal retention. ts-fsrs is the first-party implementation from the open-spaced-repetition org. Runner-up: rs-fsrs via WASM.

Supports scheduling **lesson-derived flashcards and/or whole-lesson re-review** (each scheduled unit carries its own Stability/Difficulty/due state).

**Open questions to resolve in planning:**
1. Verify ts-fsrs runs unmodified on the Cloudflare Workers runtime (no Node built-ins via the bundle; `engines: node>=20` is a build hint, not a runtime dep).
2. Where per-user FSRS parameter optimization runs given Workers CPU limits — likely a scheduled Node/Python job (`fsrs-optimizer`) against Supabase, not edge.
3. How to aggregate a multi-item lesson session into FSRS's single again/hard/good/easy rating (flashcards map 1:1; whole-lesson needs aggregation on our side).
4. Postgres/RLS schema for per-card FSRS state (stability, difficulty, due, reps, lapses, last_review, state) + an efficient due-card index for the daily queue.

**Caveats:** cold-start uses default FSRS params until ~1000+ reviews/user (still > SM-2, just not personalized). ts-fsrs package semver (5.x) ≠ algorithm version (FSRS-6) — confirm at integration. Edge-runtime compatibility is inferred (zero deps + pure-JS bundles), not yet deploy-verified.

Full research report (verified, cited): deep-research run `wccs2i36q` (2026-06-06).

**PAUSED 2026-06-06 (Phase 4 ship not done).** Product decision: "Review" is being re-scoped to mean a content **summary**, with a separate **Tests** (A/B/C/D) feature; the FSRS engine (`srs_review_state` + `ts-fsrs` + `/rate`) will be re-pointed at quiz questions rather than whole lessons. Phases 1–3 are committed (`2c1a7c5`, `c3fa062`, `ff2235f`). The lesson-review UI may be superseded by the learning-loop work — see the new `learning-loop` change.
