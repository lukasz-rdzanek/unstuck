<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Operator Message Moderation

- **Change**: `operator-message-moderation` (S-03, final MVP slice)
- **Scope**: Full slice (Phase 1 + Phase 2 + epilogue)
- **Date**: 2026-05-30
- **Verdict**: NEEDS ATTENTION (pre-triage) → ALL FIXED + 1 follow-up archive chain (post-triage)
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts (pre-triage)

| Dimension              | Verdict   |
| ---------------------- | --------- |
| Plan Adherence         | PASS      |
| Scope Discipline       | PASS      |
| Safety & Quality       | WARNING   |
| Architecture           | PASS      |
| Pattern Consistency    | PASS      |
| Success Criteria       | PASS      |
| MVP Closure Integrity  | WARNING   |

## Grounding

- Plan drift sub-agent: zero unintentional drift across Phase 1 + Phase 2 + epilogue. One documented adaptation confirmed (Cell 5 uses self-contained fixture UUIDs `ffffffff-…` / `eeeeeeee-…` / `11111111-…` instead of seed UUIDs `d0000000-…` — caught and re-decided during /10x-implement, not silent drift).
- Automated checks: `rls_matrix.sql` probe passes ("all 5 role cells assert green"); lint exit 0; astro check 0 errors; build complete.

## Findings

### F1 — docker exec snippet broken (missing -i flag)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (operator-facing recipe)
- **Location**: `docs/operator/moderation.md:165-171`
- **Detail**: Operating Notes snippet uses `docker exec ... -f /dev/stdin < file` without `-i`; psql hangs waiting on stdin that isn't wired. Canonical form at `rls_matrix.sql:16` uses `docker exec -i ... -1 < file`.
- **Fix**: Replace with canonical form (`-i` enables stdin, `-1` wraps in single transaction matching the file's `begin;…rollback;` framing) + 3-line explanation of both flags.
- **Decision**: FIXED — applied to moderation.md.

### F2 — ILIKE recipe breaks on apostrophes in fragment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (operator-facing recipe)
- **Location**: `docs/operator/moderation.md:38-46`
- **Detail**: Locate-by-content query uses `WHERE m.body ILIKE '%FRAGMENT_HERE%'`. Operator pastes a fragment containing `don't` / `isn't` and the single-quote literal breaks. `seeding.md:53` already uses `$$ … $$` dollar-quoting for the same reason.
- **Fix**: Switch placeholder to `WHERE m.body ILIKE $$%FRAGMENT_HERE%$$` + cross-reference to seeding.md's same convention; note tagged-form (`$body$…$body$`) escape if fragment contains literal `$$`.
- **Decision**: FIXED — applied to moderation.md.

### F4 — Roadmap claims "done" but change.md files say `impl_reviewed` / `implemented`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: MVP Closure Integrity (Pattern Consistency)
- **Location**: `context/foundation/roadmap.md:30-33` + change.md files for F-01/S-01/S-02/S-03
- **Detail**: Roadmap "At a glance" table claims `done` for all four slices. Verified: `done` is reserved by /10x-archive convention for archived slices and triggers an append to roadmap's `## Done` section. All three change.md files (S-01: `impl_reviewed`, S-02 + S-03: `implemented`) are non-archived; `## Done` is empty. Roadmap status is premature unless /10x-archive actually runs.
- **Fix C**: Run `/10x-archive` on F-01 + S-01 + S-02 + S-03 (chain run). Honors `done` semantics: archives slice folders to `context/archive/`, populates roadmap's `## Done` section, and flips each change.md to `status: archived` with `archived_at`. Clean MVP closure.
- **Decision**: FIXED (queued for follow-up) — to be executed as a separate /10x-archive chain immediately after this report lands, since archive is a distinct skill invocation per change.

### F3 — Cell 5 row_count=0 ambiguous (RLS denial vs missing row)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test integrity)
- **Location**: `supabase/tests/rls_matrix.sql:292-303`
- **Detail**: Cell 5's `affected = 0` assertion passes for two distinct reasons — RLS denied the DELETE (intended) OR the row doesn't exist (fixture drift, ID typo, prior cell deleted it). Cells 1-4 don't have this ambiguity because they assert positive counts. A future refactor reordering cells or changing fixture UUIDs would produce a silently-passing assertion that doesn't actually test RLS.
- **Fix**: Add a fixture-drift guard inside the Cell 5 DO block: `select count(*) into fixture_cnt from public.messages where id in (…); if fixture_cnt != 2 then raise exception '[auth-delete-denial] fixture drift …'; end if;` before the DELETE attempts. Converts false-negative class into fast, clear failure. The SELECT runs as the authenticated peer role and additionally confirms read RLS still permits the rows (a useful side-assertion).
- **Decision**: FIXED — applied to rls_matrix.sql.

### F5 — DELETE recipe lacks BEGIN/COMMIT despite "irreversible" framing

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (operator-facing recipe)
- **Location**: `docs/operator/moderation.md:80-93`
- **Detail**: Step 3 has `RETURNING` for visual confirmation but no transaction wrap. A manual that opens with "Deletion is irreversible" should model BEGIN/ROLLBACK discipline so the `RETURNING` echo is an inspection step, not a fait accompli.
- **Fix**: Wrap the recipe in `BEGIN; DELETE … RETURNING …; -- inspect; COMMIT; -- or ROLLBACK;` and update the surrounding prose to call out that the row is only actually gone after COMMIT.
- **Decision**: FIXED — applied to moderation.md.

### F6 — 18 deferred S-01 manual rows not in roadmap ## Parked

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: MVP Closure Integrity
- **Location**: `context/foundation/roadmap.md` `## Parked` + S-01 impl-review
- **Detail**: 18 deferred manual verification rows live in S-01's impl-review.md and are mentioned in S-01's roadmap Status line ("18 manual rows deferred per ship-over-polish — non-blocking"). They are NOT in `## Parked` and have no Linear issue. At MVP-complete moment, deferred verification is at maximum risk of being silently dropped — the failure mode `ship-over-polish` memory explicitly warns about.
- **Fix**: Add one bullet under `## Parked` pointing at `context/changes/lesson-workspace-shell/reviews/impl-review.md` and noting "revisit after first-user observation; decide which still matter before walking mechanically — many may be invalidated or already-confirmed by real usage."
- **Decision**: FIXED — applied to roadmap.md.

## Triage summary

| Status        | Findings                              | Count |
| ------------- | ------------------------------------- | ----- |
| Fixed (now)   | F1, F2, F3, F5, F6                    | 5     |
| Fixed (queued — /10x-archive chain) | F4              | 1     |
| Skipped       | —                                     | 0     |
| Accepted      | —                                     | 0     |
| Dismissed     | —                                     | 0     |

**Verdict after fixes**: APPROVED (post-triage) — all 6 findings resolved or queued. S-03 advances to `status: impl_reviewed`. MVP-complete state becomes consistent end-to-end once the queued /10x-archive chain lands.
