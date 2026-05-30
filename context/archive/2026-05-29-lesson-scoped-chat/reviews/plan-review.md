<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Lesson-scoped Chat (S-02)

- **Plan**: `context/changes/lesson-scoped-chat/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-29
- **Verdict (initial)**: REJECTED (3 critical FAIL on Plan Completeness / Blind Spots)
- **Verdict (after triage)**: APPROVED (5 fixes applied, 1 observation auto-addressed)
- **Findings**: 3 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict (initial) | After Triage |
|-----------|-------------------|--------------|
| End-State Alignment | WARNING | PASS (F1 + F3 fixed) |
| Lean Execution | PASS | PASS |
| Architectural Fitness | WARNING | PASS (F3 fixed) |
| Blind Spots | FAIL | PASS (F1 + F3 fixed) |
| Plan Completeness | FAIL | PASS (F2 + F4 + F5 + F6 fixed) |
| Success Criteria | PASS | PASS |

## Grounding

7/7 host paths ✓ (existing files plan references), 5/5 target paths free ✓ (new files
plan creates), `@supabase/supabase-js@^2.99.1` + `@supabase/ssr@^0.10.3` in deps,
Astro `^6.3.1`, current env schema confirmed (both vars `context: "server", access: "secret"`),
`messages_insert_peer_own_non_seed` policy confirms RLS sets `author_id = auth.uid()`
server-side, `lessons.md` absent (skip), `contract-surfaces.md` absent (skip),
brief↔plan ✓.

One sub-agent verified three highest-risk technical claims against vendor docs
(Astro envField, Supabase Realtime auth, channel subscribe API).

## Findings

### F1 — Initial load returns OLDEST peer messages, not most recent

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness (Blind Spots overlap)
- **Location**: Phase 1 §3 `listLessonMessages` contract
- **Detail**: Plan ordered `is_seeded DESC, created_at ASC` with `LIMIT 50` — for a
  lesson with 4 seeds and 100 peers, this returns 4 seeds + the 46 OLDEST peer messages.
  Backwards from chat UX standard (newest at bottom, scroll up for history). "Load
  older" cursor would also have nothing left to fetch.
- **Fix A ⭐ Recommended (chosen)**: Two-query strategy — `listInitialMessages` fetches
  all seeds (no limit) + last `peerLimit` peers DESC, reversed client-side to ASC.
  Adds `listOlderPeers(supabase, lessonId, before, opts?)` for the "Load older" cursor.
  Embed-with-alias updated to canonical prefix-alias syntax (`author:profiles!messages_author_id_fkey(...)`).
- **Fix B**: Single query DESC + client split. Rejected: edge case at seeds+peers>50
  cuts off recent peers; complicates "load older" at seed boundary.
- **Decision**: FIXED via Fix A. Phase 1 §3 contract rewritten; F6 (embed syntax) also
  resolved in this edit.

### F2 — `context: "server-and-client"` is INVALID Astro 6 envField syntax

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 `astro.config.mjs` contract
- **Detail**: Astro 6 has only two `context` values — `"server"` and `"client"`.
  `"server-and-client"` is a fiction; build fails at config validation. Intent (var
  available both server-side and client-side) is achieved by `context: "client", access:
  "public"` — which makes the var accessible from BOTH `astro:env/client` AND
  `astro:env/server`.
- **Fix**: Contract rewritten to canonical `context: "client", access: "public"` syntax
  with explicit note that existing `astro:env/server` imports in `src/lib/supabase.ts`
  continue to work after the change — no SSR-side import migration required.
- **Decision**: FIXED via single-option fix.

### F3 — Plan's browser Supabase client won't authenticate Realtime against RLS

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness + Architectural Fitness + Blind Spots
- **Location**: Phase 1 §2 `src/lib/supabase-browser.ts` contract
- **Detail**: Plan prescribed building the browser client from bare
  `@supabase/supabase-js`, claiming the cookie session would be enough. Supabase Realtime
  authorizes postgres_changes against the WebSocket's JWT — a bare client opens the
  socket as anon role, and our `to authenticated using (...)` SELECT policy delivers
  ZERO events. REST INSERTs still succeed (cookies on fetch), so Phase 1 LOOKS like it
  works while Phase 2 silently fails.
- **Fix A ⭐ Recommended (chosen)**: Use `@supabase/ssr`'s `createBrowserClient` (already
  in deps). Cookie session is bridged automatically; `.realtime` channel carries the JWT
  into the WebSocket handshake. Standard SSR+Realtime pattern, vendor-documented.
- **Fix B**: Pass `access_token` from SSR as island prop, call `realtime.setAuth(token)`
  before subscribe. Rejected: token in DOM props bigger XSS surface; manual rotation
  refresh required.
- **Decision**: FIXED via Fix A. Phase 1 §2 contract rewritten; explicit warning about
  the bare-client trap embedded in the contract for future contributors.

### F4 — Reconnect detection via channel state alone is fragile

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §1 hook reconnect contract
- **Detail**: Plan used `channel.subscribe(status => ...)` transition from
  `CLOSED → SUBSCRIBED` as reconnect trigger. Status enum + filter syntax are correct,
  but whether the subscribe callback re-fires on auto-rejoin is not a documented stable
  contract — GitHub issues (#1473, Discussion #19263) flag as flaky.
- **Fix**: Hook the socket-level events directly:
  `supabase.realtime.onOpen()` for reliable reconnect trigger, `onClose()` for stale
  state marker, `onError()` for logging. Keep `.subscribe((status, err) => ...)` only
  for surfacing per-channel state to the UI; added the `err` second parameter the plan
  omitted. Cleanup wires include `realtime.off()` for all three handlers plus channel
  removal.
- **Decision**: FIXED via single-option fix.

### F5 — Progress row 5.8 has no matching Phase 5 Success Criteria bullet

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness (Progress↔Phase consistency)
- **Location**: Phase 5 Success Criteria vs Progress
- **Detail**: Progress had `5.8 AGENTS.md has the client-env exposure paragraph` but
  Phase 5's Manual Verification block listed only 4 items. AGENTS.md update appeared
  in §3 Changes Required but not in success criteria — `/10x-implement`'s Progress
  parser would see an orphan row.
- **Fix**: Added matching Manual Verification bullet to Phase 5 Success Criteria block:
  `AGENTS.md carries the one-paragraph note on client-env exposure`.
- **Decision**: FIXED via single-option fix.

### F6 — PostgREST embed syntax in `listLessonMessages` contract

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §3 contract
- **Detail**: Plan wrote `profiles!messages_author_id_fkey(id, display_name) as author`
  using SQL `as` for alias. The Supabase JS PostgREST embed-with-alias syntax is
  prefix-style: `author:profiles!messages_author_id_fkey(id, display_name)`.
- **Fix**: Auto-resolved as side-effect of F1 Fix A rewrite — the new contract uses
  canonical prefix-alias in both `listInitialMessages` (line 296) and `insertMessage`
  (line 303). Grep verified zero remaining `as author` occurrences in the plan.
- **Decision**: ACCEPTED-AS-RESOLVED — no separate edit needed.
