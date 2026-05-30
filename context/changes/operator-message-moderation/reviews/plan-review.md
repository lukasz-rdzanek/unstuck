<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Operator Message Moderation (S-03)

- **Plan**: `context/changes/operator-message-moderation/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-30
- **Verdict (initial)**: REVISE (1 critical, 1 warning, 1 observation)
- **Verdict (after triage)**: SOUND (F1 + F2 + F3 all fixed)
- **Findings**: 1 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict (initial) | After Triage |
|-----------|-------------------|--------------|
| End-State Alignment | PASS | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING | PASS (F2 fixed) |
| Plan Completeness | FAIL | PASS (F1 + F3 fixed) |
| Success Criteria | PASS | PASS |

## Grounding

5/5 paths ✓ (rls_matrix.sql, seeding.md, roadmap.md, prd.md,
F-01 RLS migration), 2/2 target paths free ✓ (moderation.md,
moderation-log.md), brief↔plan ✓, `lessons.md` absent (skip),
`contract-surfaces.md` absent (skip), Progress↔Phase 11/11 rows
mapped ✓.

One sub-agent verified the three riskiest technical claims:
1. **rls_matrix.sql probe pattern**: PARTIAL — plan used the wrong GUC
   form. F-01 uses JSON-blob `request.jwt.claims to '{"sub":"...","role":"..."}'`,
   not the sub-key form `request.jwt.claim.sub`. Also needs `reset role;`
   before role switch.
2. **Realtime DELETE delivery**: CORRECT — F-01 migration line 188 uses
   unrestricted `alter publication supabase_realtime add table public.messages`
   (no event filter), DELETE propagates to subscribers.
3. **Seed UUIDs**: CORRECT — all three UUIDs (peer user, peer message,
   operator message) exist in seed.sql with the expected `is_seeded`
   values.

## Findings

### F1 — Probe GUC name is wrong; assertion silently passes without testing RLS

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 (rls_matrix.sql probe contract) + Current State Analysis "Key Discoveries" (RLS probe pattern bullet)
- **Detail**: Plan prescribed `SET LOCAL request.jwt.claim.sub = '<uuid>';`
  (singular `claim`, sub-key form). F-01's actual rls_matrix.sql at lines
  126 + 216 uses the JSON-blob form `set local request.jwt.claims to
  '{"sub":"<uuid>","role":"authenticated"}';` (plural). With the plan's
  form, `auth.uid()` evaluates to NULL inside the probe — the DELETE
  runs under no-user context, RLS denies for the wrong reason, row_count
  = 0, assertion silently passes for a fake reason. The whole probe
  becomes a no-op disguised as a regression check, which would never
  catch a future schema change that accidentally adds a peer-DELETE
  policy.
- **Fix**: Replace the GUC reference in both the Phase 1 §1 contract AND
  the Current State Analysis "Key Discoveries" bullet with the canonical
  F-01 form: `set local request.jwt.claims to '{"sub":"<uuid>",
  "role":"authenticated"}';`. Also add `reset role;` before each
  role-switch block to mirror F-01's idiom (lines 124, 214, 242, 270).
- **Decision**: FIXED via single-option fix. Both occurrences corrected;
  added inline SQL snippet showing the canonical pattern with explicit
  warning about the GUC trap; F3 (the missing `reset role;` style note)
  absorbed into the same edit.

### F2 — Browser adversarial test (Manual 1.7) has no executable mechanism

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots / Plan Completeness
- **Location**: Phase 1 Manual Verification (1.7 in Progress) + Open Risks
- **Detail**: Manual row 1.7 instructed `await (window as any).__chatSupabase
  ?.from('messages').delete().eq('id', ...)` in DevTools. Plan's own
  Open Risks block then admitted: "current S-02 build does not expose
  a debug handle on `window` — fallback is to run the assertion in `psql`
  under `SET LOCAL ROLE authenticated` instead, which is what the SQL
  probe already does automatically." Two contradictions: (a) the row
  prescribed an unexecutable action; (b) the fallback admission implied
  the test was redundant with the SQL probe (1.1).
- **Fix A ⭐ Recommended (chosen)**: Drop Manual 1.7 entirely. Rely on
  the SQL probe (Automated 1.1) as the regression-proof assertion. Add
  a one-line note in moderation.md's Operating Notes pointing out the
  SQL probe IS the regression test, and that operators can re-run it
  outside `db reset` via `docker exec ... psql -f
  supabase/tests/rls_matrix.sql`.
- **Fix B**: Add a dev-mode `window.__chatSupabase` debug handle to S-02
  ChatPanel (gated by `import.meta.env.DEV`). Rejected: cross-slice
  footprint on S-02 mid-S-03; adds a conditional to maintain; the SQL
  probe already covers the same assertion path.
- **Decision**: FIXED via Fix A. Manual 1.7 row removed from Phase 1
  Manual Verification block AND from Progress (rows renumbered: old 1.8
  is now 1.7). Operating notes in moderation.md contract updated to
  document the SQL-probe-as-regression-test pattern. Open Risks bullet
  rewritten to reflect the new approach.

### F3 — Probe should `reset role;` before each role-switch (style match)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness (style consistency)
- **Location**: Phase 1 §1 contract
- **Detail**: F-01's rls_matrix.sql uses `reset role;` before each role
  switch (lines 124, 214, 242, 270) so a probe failure mid-file doesn't
  leak role state into subsequent probes. The plan described only the
  "after" reset, not the "before".
- **Fix**: Folded into F1's edit — the canonical SQL snippet now leads
  with `reset role;` before `set local request.jwt.claims ...` + `set
  local role authenticated;`.
- **Decision**: FIXED as side-effect of F1 fix. No separate edit needed.
