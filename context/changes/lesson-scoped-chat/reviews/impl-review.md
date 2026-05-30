<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Lesson-scoped Chat (S-02)

- **Plan**: `context/changes/lesson-scoped-chat/plan.md`
- **Scope**: Phases 1–5 (full slice, post-epilogue)
- **Date**: 2026-05-30
- **Verdict (initial)**: NEEDS ATTENTION (no criticals; 4 warnings, 2 observations)
- **Verdict (after triage)**: APPROVED (F1–F4 fixed, F5+F6 skipped as accepted)
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict (initial) | After Triage |
|-----------|-------------------|--------------|
| Plan Adherence | PASS | PASS |
| Scope Discipline | PASS | PASS |
| Safety & Quality | WARNING | PASS (F1, F2, F3 fixed) |
| Architecture | WARNING | PASS (F4 fixed via AGENTS.md update) |
| Pattern Consistency | WARNING (overlap w/ Architecture) | PASS |
| Success Criteria | PASS | PASS (lint 0, astro 0, build ok, db reset ok) |

## Grounding

Two sub-agents executed in parallel:
- **Plan drift agent**: 13 planned file changes verified MATCH; zero undocumented
  drift; all 5 known mid-implementation adaptations confirmed at expected locations
  (Phase 1 astro:env/client SSR migration; Phase 2 window.online/offline reconnect
  vs the non-existent supabase.realtime.onOpen/onClose; Phase 3 explicit authorId
  param; Phase 3 char-counter row reflow + .chat-scroll utility; Phase 4
  queueMicrotask defer).
- **Safety/quality/pattern agent**: 10 findings raw, 4 deemed real (1, 2, 3, 5
  from agent → F1, F2, F3, F4 in this report). 4 dismissed as non-issues during
  triage drafting (agent finding-4 UTC sort works for ISO-8601 invariant;
  finding-6 type location borderline; finding-9 misread — F-01 already added
  `char_length(body) between 1 and 4000` CHECK; finding-10 NaN fallback low-impact).
  2 observations elevated as F5+F6.

Automated success criteria all green: `npm run lint` (warnings only),
`npx astro check` 0 errors, `npm run build` complete, `npx supabase db reset`
confirms 4 seeded + 1 peer post-Phase-5.

## Findings

### F1 — Pending optimistic-post timeout leak on lessonId change

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/chat/useChatMessages.ts (cleanup effect was at line 271-277)
- **Detail**: `pendingTimeoutsRef` cleanup was a separate useEffect with `[]` deps
  — fired only on component unmount, not on `lessonId` change. Timers scheduled in
  the previous lesson would fire after navigation to a new lesson; their `tempId`
  wouldn't match any pending bubble in the new state (setMessages no-ops) but the
  closure remained in flight. Plus the ref was declared AFTER its first read in
  submitInsert (closure timing made it safe but violated declare-before-use).
- **Fix**: Moved `pendingTimeoutsRef` declaration to the ref cluster at the top of
  the hook (above submitInsert). Removed the separate `[]`-deps cleanup useEffect.
  Added `for (const id of pendingTimeoutsRef.current) window.clearTimeout(id);
  pendingTimeoutsRef.current.clear();` to the subscription effect's cleanup
  (runs on both lessonId change AND unmount).
- **Decision**: FIXED via single-option fix.

### F2 — Strict-mode-unsafe Supabase client initialization

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/chat/useChatMessages.ts:68
- **Detail**: `useRef(createClientBrowser())` invoked the factory in the render
  phase. React 19 Strict Mode in dev double-mounts components on first render,
  so the factory ran twice and created two RealtimeClient instances — only the
  first reached the useEffect cleanup chain; the second leaked. Production isn't
  Strict-Mode-wrapped so impact was dev-time only.
- **Fix**: Lazy ref init — `useRef<...>(null)` + inside the subscription
  useEffect `supabaseRef.current ??= createClientBrowser();`. Factory now runs
  exactly once per lifetime instance even under Strict Mode double-mount.
- **Decision**: FIXED via single-option fix.

### F3 — Email local-part exposed instead of profiles.display_name (privacy)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (privacy)
- **Location**: src/pages/courses/[slug]/lessons/[lessonSlug].astro:70
- **Detail**: `userDisplayName={Astro.locals.user?.email?.split("@")[0]}` leaked
  the email-local-part to all chat viewers via the user's own optimistic bubbles.
  Other authors' messages already rendered via `profiles.display_name` (joined
  in the chat query); only the current user got the email prefix. F-01's signup
  trigger populates `profiles.display_name` (defaulted to email local-part, but
  the column exists for explicit override) — same value typically, but no
  email-shaped leak surface.
- **Fix**: SSR-side fetch in lesson page frontmatter: query
  `profiles.display_name` for the signed-in user, pass result as
  `userDisplayName` prop. Fallback chain: profile.display_name → email-local-part
  → null. Single extra query per lesson load (negligible).
- **Decision**: FIXED via single-option fix.

### F4 — Hooks location violated AGENTS.md convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture / Pattern Consistency
- **Location**: src/components/chat/useChatMessages.ts vs AGENTS.md line 13
- **Detail**: AGENTS.md said "React hooks → src/components/hooks/" but the chat
  hook lives co-located with the feature folder. Co-location is defensible
  (single consumer, chat-scoped) but the deviation was silent.
- **Fix A ⭐ Recommended (chosen)**: Updated AGENTS.md to permit feature-scoped
  co-location for single-consumer hooks. Established bright line: "if more than
  one feature would import the hook, hoist it to src/components/hooks/."
  Matches modern React feature-folder trend; avoids splitting chat internals.
- **Fix B**: Move the hook to src/components/hooks/. Rejected: pure ceremony
  with one consumer; splits feature internals across two dirs.
- **Decision**: FIXED via Fix A.

### F5 — loadOlder useCallback recreates on every message arrival

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (perf)
- **Location**: src/components/chat/useChatMessages.ts:205-224
- **Detail**: `messages` in useCallback deps causes the callback to re-create
  on every new message. ChatPanel uses it inline (button onClick), so no
  consumer chain breaks. Impact is closure allocation only — negligible at
  MVP scale (≤100 messages).
- **Fix (proposed)**: Drop `messages` from deps; read earliest peer via
  functional setMessages updater. Not applied.
- **Decision**: SKIPPED as acceptable observation. Functional updater pattern
  noted for future-me.

### F6 — SSR Supabase reads from astro:env/client (audit surface)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/supabase.ts:3 + src/lib/config-status.ts:1
- **Detail**: Both SSR-only consumers import from `astro:env/client`. The
  agent suggested switching SSR files to `astro:env/server` to make
  "client-readable surface" grep-auditable.
- **Fix (proposed)**: Switch SSR files to `astro:env/server`. **NOT VIABLE**:
  Phase 1 documented (and we verified in commit `f0baa1d`'s body) that with
  `context: "client", access: "public"`, TypeScript types do NOT export the
  vars from `astro:env/server` — `npx astro check` fails. The agent's
  recommendation contradicts the Phase 1 reality. Could revisit if Astro's
  typedef behavior changes.
- **Decision**: SKIPPED as not-actionable per current Astro 6 envField behavior.
