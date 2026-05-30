# Lesson Workspace Shell (S-01) — Plan Brief

> Full plan: `context/changes/lesson-workspace-shell/plan.md`

## What & Why

S-01 is the first user-facing slice of Unstuck and the host surface every later UI slice
attaches to: a public single-course catalog, a course-detail page, and a sign-in-gated
lesson page that combines an embedded video player with rendered markdown content and a
visible-but-empty chat slot. This slice also tokenizes the cosmic visual direction so the
catalog, lesson page, and the S-02 chat panel pull from one design system rather than
copy-pasted utilities. The chat panel itself ships in S-02; here we ship the page that
will hold it.

## Starting Point

F-01 is done — the `courses` / `lessons` / `messages` / `profiles` / `enrollments` schema
is deployed with forced RLS, the typed Supabase SSR client exists, `src/types.ts` exports
the domain aliases, and the local seed has one course / one lesson / two messages. The
cosmic look is already 80% present inline (Welcome, signin, dashboard) but as ad-hoc
Tailwind utilities — not a system. Auth is shipped (signup/signin/signout) and middleware
gates only `/dashboard`. Layout title is still the starter's "10x Astro Starter". No
markdown renderer is installed, and the seeded `lessons.video_url` is a placeholder
`example.com` URL.

## Desired End State

A learner reaches the Unstuck landing at `/`, browses `/courses`, opens a course at
`/courses/[slug]`, signs in (if anon), and reaches a working lesson page at
`/courses/[slug]/lessons/[lessonSlug]` showing an embedded YouTube video, rendered
markdown lesson content, and a "Chat lands in S-02" placeholder card on the right. On
narrow viewports everything reflows to one column with the chat slot stacked at the
bottom. Direct anon access to a lesson URL redirects through
`/auth/signin?next=<lesson-url>` and lands back on the lesson after sign-in. The cosmic
palette is centralized as CSS variable tokens scoped to a new `AppLayout`; existing auth
and dashboard pages render unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Cosmic palette | Deep cosmos background + magenta/violet primary + cobalt blue accent (reserved for S-02 "live") + 3 utilities (`text-cosmic-gradient`, `shadow-cosmic-glow`, `bg-cosmic-starfield`) | Honors the memory's "Hubble Deep Field" anchor and aligns with the already-shipped inline cosmic palette so the retrofit is mechanical. | Plan |
| URL scheme | `/` landing, `/courses` catalog, `/courses/[c]/lessons/[l]` lesson | Mirrors the schema in URLs and reserves a marketing surface for unauth visitors; FR-003 catalog as a real route lets course #2 drop in without rework. | Plan |
| Catalog depth | Catalog → course detail → lesson (3 surfaces) | Course-detail surface is where the lesson list lives; with one course it briefly looks sparse but the seam is right for v2. | Plan |
| Responsive scope | Desktop-first; narrow viewports stack with the chat-slot visible-but-empty | Honors the roadmap "ship desktop-first" directive and gives S-02 a defined slot; full bottom-drawer interactivity defers to S-02 once OQ 2 resolves. | Plan |
| Polish scope | Tokenize new surfaces only — auth + dashboard keep current inline cosmic look | Minimum churn, no double work, isolates the visual experiment to new surfaces. | Plan |
| Markdown lib | `marked` (no sanitizer) + Astro `set:html` | RLS reserves lesson INSERT/UPDATE to service_role; operator-authored content is the only input; chat messages are plain text. Trust boundary documented in a JSDoc on `renderMarkdown`. | Plan |
| Islanding | 100% Astro — no React islands in this slice | Lesson page has no state or event handlers; matches AGENTS.md rule and ships zero hydration JS. | Plan |
| Video embed | Server-side `parseVideoUrl` → `<iframe>` for YouTube + Vimeo, fallback block for unknown | Operators paste natural watch URLs; one helper covers both providers per PRD non-goal "embed externally hosted". | Plan |
| Layout primitive | New `AppLayout.astro` (wraps `Layout.astro`) + `AppTopbar.astro` | Clean separation between marketing landing and in-app chrome; tokens activate via a scoped `.dark` wrapper, leaving auth/dashboard untouched. | Plan |
| Seed video | Update `supabase/seed.sql` `video_url` to a real public YouTube URL | Local-dev verification works end-to-end; production is migrations-only so prod is unaffected. | Plan |
| `?next=` safety | Accept only same-origin paths (single leading `/`, never `//`); fall back to today's `/` (now the Unstuck landing) | Defense against open-redirect via `//evil.example.com`; preserves current post-signin behavior — `?next=` is purely additive. PRD-resolved (OQ#2). | Plan |

## Scope

**In scope**:
- Cosmic palette tokenization (`.dark` block in `global.css`) + 3 reusable utilities.
- `Layout.astro` default title → "Unstuck"; `Welcome.astro` recast as the Unstuck landing.
- `AppLayout.astro` + `AppTopbar.astro` (auth-state-aware).
- `src/lib/services/courses.ts` typed Supabase query helpers.
- `src/pages/courses/index.astro` (catalog), `src/pages/courses/[slug]/index.astro`
  (course detail), `src/pages/courses/[slug]/lessons/[lessonSlug].astro` (lesson).
- `src/lib/markdown.ts` (marked-backed renderer), `src/lib/video-embed.ts`
  (YouTube/Vimeo URL parser).
- `src/middleware.ts` extended to gate lesson URLs with regex; `?next=` round-trip
  completed in the signin form/page.
- `supabase/seed.sql` `video_url` updated to a real public YouTube URL.

**Out of scope**:
- Any chat functionality (read, post, realtime, drawer interactivity) — all S-02.
- Public lesson titles for anon users (would require schema split + RLS rework).
- Bottom-drawer interactivity on narrow viewports (defers to S-02 + OQ 2 resolution).
- Retrofit of auth + dashboard pages onto the new tokens.
- New shadcn components / test framework / video sanitizer / third-party player library.
- Production seed/data changes; only the local-dev `seed.sql` moves.

## Architecture / Approach

`Layout.astro` continues as the document shell. New `AppLayout.astro` wraps it, sets
`class="dark bg-cosmic"` on a top-level wrapper to activate cosmic tokens for its
subtree (auth + dashboard live outside this wrapper and stay on `:root` neutral tokens),
paints the star-field utility, and slots `AppTopbar` above page content. Catalog, course
detail, and lesson pages all opt into `AppLayout`. A typed `src/lib/services/courses.ts`
centralizes Supabase read queries. The lesson page parses `video_url` via the new
`parseVideoUrl` helper and renders `content_md` through `renderMarkdown` (marked) into
an `<article set:html>` — operator-trusted, no sanitizer. Middleware gains a regex that
recognizes lesson URLs and redirects unauth visitors through
`/auth/signin?next=<encoded-url>`; the signin success path honors that next safely.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Cosmic tokens + utilities + Layout title + landing recast | Cosmic design system in `global.css` (`.dark` tokens + 3 utilities), Welcome recast as Unstuck landing, title fix | Replacing `.dark` tokens accidentally regresses auth/dashboard if they relied on the old dark tokens |
| 2. AppLayout + AppTopbar + courses service | The in-app layout primitive + typed Supabase read helpers | Token activation via scoped `.dark` wrapper not flowing to shadcn primitives correctly |
| 3. Catalog + course detail pages | `/courses` (public) and `/courses/[slug]` (public header, gated lesson list) | RLS surprise: anon viewers see lesson list as empty rather than as "sign-in to view" |
| 4. Lesson page + markdown + video embed + seed update | `/courses/[c]/lessons/[l]` with video iframe + markdown body + chat-slot placeholder | Real YouTube URL in seed could rot; markdown trust boundary needs a comment that survives future contributor reading |
| 5. Protected routing + `?next=` round-trip + final verification | Middleware gating lesson URLs, signin form returning to the original URL safely | Open-redirect via `//evil.example.com` if `next` validation is incomplete |

**Prerequisites**: F-01 schema deployed (done); local Supabase stack running for the
seed-affected verification in Phase 4; familiarity with the existing signin handler
implementation (read at Phase 5 start).
**Estimated effort**: ~1–2 sessions across 5 phases (no chat work, all UI + thin glue).

## Open Risks & Assumptions

- The `.dark` wrapper scoping correctly isolates cosmic tokens from auth + dashboard.
  Assumption verified by Tailwind v4 `@custom-variant dark (&:is(.dark *))` + CSS
  variable inheritance — but Phase 1's manual verification explicitly checks that
  auth/dashboard render unchanged.
- The seeded YouTube URL stays public. If it rots, the local-dev demo breaks until the
  URL is updated; production is unaffected (seed is local-only).
- The implementer reads `src/components/auth/SignInForm.tsx` and
  `src/pages/api/auth/signin.ts` at Phase 5 start before deciding where the `next=`
  handling slots in. The plan deliberately doesn't pre-commit the exact mechanism
  because it depends on whether the redirect is server-side or client-side today.

## Success Criteria (Summary)

- A signed-in learner can reach the lesson page end-to-end from `/` and see a working
  video + rendered markdown + chat-slot placeholder.
- An anon learner gated by middleware on the lesson URL signs in and returns to the
  original lesson URL (not `/dashboard`).
- `npm run lint`, `npm run build`, `npx astro check` all exit 0; auth + dashboard pages
  render unchanged from before the slice.
