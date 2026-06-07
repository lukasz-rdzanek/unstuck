# Follow-ups from impl-review — testing-hermetic-service-api

Deferred items the review surfaced that are out of this test-only change's scope.

## F4 — Guard backfill's list-RPC iteration against null data (production-code)

- **Where**: `src/pages/api/embeddings/backfill.ts:63` — `for (const row of pending)`.
- **Issue**: if `list_unembedded_messages` ever returned `{ data: null, error: null }`, the handler throws (no `?? []`). The hermetic test suite cannot catch this because the fake always returns arrays.
- **Decision (2026-06-07 review)**: SKIPPED here to keep this change test-only. Record for a future production change.
- **Suggested fix**: `const pending = data ?? [];` (or guard the loop), plus a hermetic test feeding `{ data: null, error: null }` to `list_unembedded_messages` asserting it's treated as empty (200, embedded 0) — not a throw. Confirm the intended oracle (empty vs error) first.
