# Lesson Workspace Shell (S-01) — Implementation Plan

## Overview

S-01 delivers Unstuck's first user-facing slice: a public single-course catalog, a course-detail
page, and a sign-in-gated lesson page that combines an embedded video player with rendered
markdown content and a (still-empty) chat-slot placeholder. This slice also introduces the
cosmic design system tokenization (CSS variables + utilities) and the first in-app layout
primitive — both load-bearing for every UI slice that follows. The chat panel itself completes
in S-02; here we ship the page that will host it.

## Current State Analysis

**F-01 (DONE) delivered**:
- Schema at production: `courses` (public-readable via RLS), `lessons` (RLS-gated by
  `has_course_access(course_id)`), `messages` (gated likewise, in `supabase_realtime`
  publication), `profiles` (signup-trigger-populated), `enrollments` (empty hook for paid
  path). All forced RLS-on.
- Seed: 1 free course (`react-architecture-deep-dive`), 1 lesson
  (`server-components-streaming`, `position=1`, placeholder `video_url=https://example.com/...`,
  realistic markdown `content_md`), 2 messages (1 seeded, 1 peer).
- Typed SSR Supabase client at [src/lib/supabase.ts:1](src/lib/supabase.ts#L1) reading
  `SUPABASE_URL`/`SUPABASE_KEY` from `astro:env/server`.
- `src/types.ts` exports `Course`, `Lesson`, `Message`, `LessonChatMessage` etc. backed by
  generated `Database` types.

**Cosmic look — partially shipped inline (load-bearing for this plan)**:
- [src/styles/global.css:113](src/styles/global.css#L113) declares `@utility bg-cosmic`
  (linear-gradient `#0a0e1a → #0f1529 → #0a0e1a`). The shadcn `:root` + `.dark` token blocks
  still hold the default neutral OKLCH values — the cosmic look bypasses them entirely.
- [src/components/Welcome.astro](src/components/Welcome.astro), [src/pages/dashboard.astro](src/pages/dashboard.astro),
  and [src/pages/auth/signin.astro](src/pages/auth/signin.astro) all paint cosmic via ad-hoc
  Tailwind utilities (`bg-white/10 backdrop-blur-xl`, gradient strings like
  `from-blue-200 via-purple-200 to-pink-200`, inline `radial-gradient` star-field).
- Only one shadcn primitive is in the tree: [src/components/ui/button.tsx](src/components/ui/button.tsx).
  `lucide-react` is installed.
- Layout default title is still `"10x Astro Starter"` ([src/layouts/Layout.astro:10](src/layouts/Layout.astro#L10)).

**Other relevant baseline**:
- [src/middleware.ts:4](src/middleware.ts#L4) gates only `/dashboard`. Per the PRD's resolved
  OQ#2, lesson routes should redirect unauth visitors to `/auth/signin?next=<original>`.
- Astro 6 SSR, `output: "server"`, Cloudflare adapter. No `tailwind.config.*` file —
  Tailwind v4 reads tokens directly from `global.css` via `@tailwindcss/vite`.
- shadcn `components.json`: `"style": "new-york"`, css = `src/styles/global.css`, no Tailwind
  config file (matches v4).
- No markdown renderer installed. No tests / test framework configured.
- PRD-resolved auth flow: redirect-to-`/auth/signin?next=<path>`, return to next after success.

### Key Discoveries

- The cosmic visual identity is **already 80% present** as copy-pasted Tailwind utilities,
  not as a design system. The work this slice gates is making it **systematic** (CSS
  variable tokens + reusable utilities) so catalog, course detail, lesson, and the future
  S-02 chat panel pull from one source.
- The shadcn `@custom-variant dark (&:is(.dark *))` declaration at
  [src/styles/global.css:4](src/styles/global.css#L4) means an ancestor `.dark` class
  activates dark-mode tokens for its whole subtree. We can scope cosmic-token activation to
  the `AppLayout` wrapper element (not the `<html>` root), keeping auth + dashboard on their
  current `:root` neutral tokens — exactly what the Q4 "tokenize new surfaces only" answer
  requires.
- `lessons.SELECT` is RLS-gated by `has_course_access`. Anon users querying `lessons` see
  zero rows. That means the public course-detail page **cannot list lesson titles for anon
  users without a schema change**. The plan honors the current RLS rather than chasing a
  schema rework for one slice — anon visitors see course header + "Sign in to view lessons"
  CTA. Public lesson-title visibility is captured as out-of-scope.
- Seed `lessons.video_url` is `https://example.com/...`. The local-dev path needs a real
  YouTube/Vimeo URL to verify the lesson page end-to-end. Production was deployed via
  `supabase db push` migrations only — `seed.sql` is local-dev fixture only, so updating it
  has no production side effect.

## Desired End State

A learner can reach the deployed app, see the Unstuck landing at `/`, click "View courses",
browse the single-course catalog at `/courses`, open the course at `/courses/[slug]` (anon
users see a sign-in CTA in place of the lesson list), sign in, and reach the lesson page at
`/courses/[slug]/lessons/[lessonSlug]` showing the embedded video, rendered markdown lesson
content, and a visible-but-empty "Chat lands in S-02" slot. On narrow viewports the lesson
page reflows to a single column with the chat slot stacked at the bottom. Trying to access
a lesson URL while unauthenticated redirects to `/auth/signin?next=<lesson-url>` and a
successful sign-in returns the user to that URL. The cosmic palette is centralized as CSS
variable tokens scoped to the in-app layout; auth and dashboard pages retain their existing
inline cosmic styling unchanged. `npm run lint`, `npm run build`, and `astro check` all pass.

### How we verify the end state

- Visiting `/` shows the Unstuck-branded landing (not "10x Astro Starter").
- `/courses` returns 200 for anon and authenticated users; shows ≥ 1 course card backed by
  the F-01 seed.
- `/courses/react-architecture-deep-dive` (anon) shows course header + sign-in CTA;
  (authenticated) shows the lesson list with `Server Components and the Streaming Model`.
- `/courses/react-architecture-deep-dive/lessons/server-components-streaming` (anon) →
  302 to `/auth/signin?next=…`; (authenticated) → 200, video iframe present, markdown
  rendered as HTML, chat-slot placeholder visible.
- Auth + dashboard pages render unchanged from their current production look.
- `npm run lint`, `npm run build`, and `astro check` exit 0.

## What We're NOT Doing

- **No chat panel functionality.** Reading messages, posting, realtime — all S-02. The
  chat slot in this slice is a visible-but-empty placeholder card.
- **No public lesson titles.** Anon users can't see lesson titles on the course-detail page.
  Solving this requires either a schema split (`lesson_metadata` vs `lesson_content`) or
  RLS surgery — out of scope; out of S-02 scope too. Captured as a v2 candidate.
- **No bottom-drawer interactivity.** Narrow viewports stack the chat slot at the bottom
  statically. The collapsible bottom-drawer pattern (FR-004) lands with S-02, once Open
  Roadmap Question 2 (cross-device support floor) is resolved.
- **No retrofit of auth + dashboard pages onto the new tokens.** Their ad-hoc inline cosmic
  styling stays as shipped; the new token system applies only to catalog/course/lesson.
- **No new shadcn components installed.** The existing `Button` plus token-driven Tailwind
  utilities cover catalog/course/lesson needs. New shadcn primitives arrive when S-02
  introduces forms/inputs.
- **No React islands in this slice.** Lesson page is 100% Astro; markdown renders
  server-side, video is a server-emitted iframe.
- **No video sanitizer or third-party player.** `marked` runs without `sanitize-html` —
  operator-authored markdown is the only input (RLS reserves lesson writes to
  service_role). Documented as a deliberate trust boundary; revisit if non-operator authors
  ever ship.
- **No course-authoring UI, no enrollment UI, no progress tracking, no search.** All PRD
  Non-Goals.
- **No tests.** No test framework is configured in this repo; the plan's Automated
  Verification leans on lint + build + `astro check` + the SQL-probe pattern F-01 used.
  Adding a test framework is a separate change.

## Implementation Approach

Five sequential phases, each ending at a coherent demonstrable state:

1. **Cosmic tokens + utilities + landing/title cleanup** — turn the inline cosmic look into a
   design system; recast Welcome + Layout title to Unstuck. No new pages.
2. **AppLayout + AppTopbar + courses service** — the layout primitive every new in-app page
   uses, plus the typed Supabase query helpers.
3. **Catalog + course detail pages** — the public two-surface read path. Course detail is
   anon-friendly (header always shown) with a sign-in CTA standing in for the lesson list
   for unauth users.
4. **Lesson page** — markdown + video embed utilities, the lesson Astro page, seed fixture
   update so local-dev demos end-to-end.
5. **Protected routing + `?next=` round-trip + final verification** — wire middleware to gate
   lesson URLs, complete the post-signin redirect to the original lesson URL, run the full
   build/lint pipeline.

The phase ordering matches the dependency graph: tokens before layouts before pages before
gating. Each phase is one commit; manual verification gates the next phase.

## Critical Implementation Details

- **Cosmic token activation is scoped to `AppLayout`, not the document root.** Apply
  `class="dark bg-cosmic"` on the `AppLayout` wrapper `<div>`, not on `<html>`. This keeps
  auth + dashboard rendering against the unchanged `:root` neutral tokens (per the Q4 "new
  surfaces only" answer). The existing `@custom-variant dark (&:is(.dark *))` rule means any
  ancestor `.dark` class flows tokens down — we don't need to touch the document element.

- **The lesson middleware pattern is regex, not prefix.** `/courses` and `/courses/[slug]`
  must stay public; `/courses/[slug]/lessons/[lessonSlug]` must redirect. A simple
  `startsWith("/courses/")` would over-gate. Use
  `/^\/courses\/[^/]+\/lessons\//.test(pathname)` as the lesson-route predicate; keep
  `/dashboard` as a separate prefix check.

- **`?next=` must be URL-encoded and bounded to same-origin paths.** Use
  `encodeURIComponent(pathname + search)` in the middleware redirect; in the sign-in
  success handler, read `next`, accept only values starting with `/` and not starting with
  `//` (defense against open-redirect via `//evil.example.com`), default to `/courses` if
  invalid.

- **Markdown trust boundary.** `renderMarkdown` returns operator-trusted HTML — passed into
  `<article set:html={html}>` without sanitization. The boundary holds because (a) RLS on
  `lessons` reserves INSERT/UPDATE to `service_role` only, (b) the operator is the sole
  service_role holder, and (c) S-02's `messages.body` is plain text per the
  `char_length(body) between 1 and 4000` check constraint — chat content does not pass
  through this function. A short JSDoc comment on `renderMarkdown` documents this assumption
  so a future contributor adding peer-authored markdown knows to wire a sanitizer in.

## Phase 1: Cosmic design tokens + utilities + Layout title + landing recast

### Overview

Make the cosmic look a system. Replace the shadcn `.dark` neutral token block with the
cosmic palette, refine the existing `bg-cosmic` gradient to anchor on the new background
token, and add three reusable utilities (`text-cosmic-gradient`, `shadow-cosmic-glow`,
`bg-cosmic-starfield`) that extract today's copy-pasted patterns. Rename the layout default
title from the starter's `"10x Astro Starter"` to `"Unstuck"` and recast Welcome.astro into
the Unstuck product landing.

### Changes Required

#### 1. Cosmic palette tokens

**File**: `src/styles/global.css`

**Intent**: Replace the existing `.dark` block's neutral OKLCH tokens with the accepted
cosmic palette so that any descendant of a `.dark`-classed element resolves shadcn primitives
(`Button`, future inputs) to cosmic colors. Keep `:root` as the default light neutral so
auth + dashboard render unchanged.

**Contract**: The `.dark` block exports the following CSS variable values as **bare HSL
channel triples** (shadcn convention, e.g. `--primary: 263 78% 62%;`). This is required so
the new utilities can compose them via `hsl(var(--token))` and `hsl(var(--token) / 0.35)` —
the same pattern shadcn primitives already use. The `:root` block stays in OKLCH literals
(unchanged) — two color spaces coexist in `global.css` until/unless `:root` is later
converted in a follow-up. Triples below:

| Token | HSL anchor | Role |
| --- | --- | --- |
| `--background` | `224 47% 4%` | Deep cosmos page background |
| `--foreground` | `220 30% 96%` | Body text |
| `--card` | `226 38% 9%` | Glass card surface |
| `--card-foreground` | `220 30% 96%` | Card text |
| `--popover` | `226 38% 9%` | (same as card) |
| `--popover-foreground` | `220 30% 96%` | |
| `--primary` | `263 78% 62%` | Magenta/violet CTA |
| `--primary-foreground` | `220 30% 96%` | |
| `--secondary` | `226 30% 14%` | Subtle elevated surface |
| `--secondary-foreground` | `220 30% 96%` | |
| `--muted` | `226 30% 14%` | |
| `--muted-foreground` | `222 20% 70%` | Secondary text |
| `--accent` | `224 90% 64%` | Cobalt blue accent (reserved for S-02 "live") |
| `--accent-foreground` | `220 30% 96%` | |
| `--destructive` | `0 75% 60%` | Errors (red, kept conventional) |
| `--border` | `230 35% 24%` | Indigo edge |
| `--input` | `230 35% 24%` | |
| `--ring` | `263 78% 70%` | Focus ring (lighter primary) |

`--radius` stays at `0.625rem`. `--chart-*` and `--sidebar-*` tokens may stay at their
current `.dark` values — they are not in use by this slice.

#### 2. Cosmic utilities

**File**: `src/styles/global.css`

**Intent**: Extract today's repeated inline patterns into three reusable Tailwind v4
`@utility` declarations so catalog/course/lesson pages can reach for them by name. Refine
`bg-cosmic` to anchor on the new `--background` so the gradient and the token agree.

**Contract**: Adjust `@utility bg-cosmic` (already present at
[src/styles/global.css:113](src/styles/global.css#L113)) so its midpoint stays cosmic-deep
(start/end use `hsl(var(--background))`; midpoint stays around `#0F1529`). Then add:

- `@utility text-cosmic-gradient` — `background-image: linear-gradient(to right, hsl(var(--primary)), hsl(var(--accent))); background-clip: text; color: transparent;` — replaces today's `from-blue-200 via-purple-200 to-pink-200` headline pattern.
- `@utility shadow-cosmic-glow` — `box-shadow: 0 0 32px hsl(var(--primary) / 0.35);` — single tasteful glow on CTAs per the memory's "use sparingly" directive.
- `@utility bg-cosmic-starfield` — encapsulates the three-layer `radial-gradient` pattern Welcome.astro currently inlines (low-density star field, no aggressive bloom). The implementer lifts the literal CSS from [src/components/Welcome.astro:21-25](src/components/Welcome.astro#L21-L25) into the utility body.

#### 3. Layout default title

**File**: `src/layouts/Layout.astro`

**Intent**: The document layout's title fallback still reads `"10x Astro Starter"`; change
it to `"Unstuck"` so any page that doesn't pass a `title` prop reads as Unstuck in the tab.

**Contract**: At [src/layouts/Layout.astro:10](src/layouts/Layout.astro#L10), replace the
default value: `const { title = "Unstuck" } = Astro.props;`.

#### 4. Recast Welcome into the Unstuck landing

**File**: `src/components/Welcome.astro`

**Intent**: The starter Welcome currently brands "10x Astro Starter" with sign-in/sign-up
CTAs aimed at the starter audience. Recast it as the Unstuck product landing — same cosmic
hero shell (it's already excellent and the visual anchor for the rest of the slice), but
Unstuck wordmark, Unstuck product tagline, primary CTA → `/courses`, secondary CTA → sign-in.
Replace the three "Authentication Ready / Modern Stack / Developer Experience" feature
cards with three Unstuck product cards.

**Contract**:
- Wordmark: `Unstuck`
- Tagline: a single sentence aligned with the PRD vision — e.g. "Lesson-scoped peer chat
  that gets you unblocked without leaving the page." (One sentence; the implementer may
  tighten.)
- Primary CTA: `View courses` → `/courses` (uses `shadow-cosmic-glow` + primary token).
- Secondary CTA: `Sign in` → `/auth/signin` (outline style, current pattern).
- Three feature cards: headlines + 1-sentence copy aligned to PRD vision —
  "Lesson-scoped chat", "Operator-seeded solutions", "Stay in flow".
- Headlines that today use the literal `from-blue-200 via-purple-200 to-pink-200` gradient
  switch to the new `text-cosmic-gradient` utility.
- Star-field inline `style` block at lines 21-25 is replaced by the new
  `bg-cosmic-starfield` utility class on the same element.
- The Topbar import stays; its content is fine for the landing.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- `npm run dev` → `/` renders the Unstuck landing (wordmark "Unstuck", tagline present, primary
  CTA reads "View courses" pointing to `/courses`).
- Browser tab title on `/` reads "Unstuck" (not "10x Astro Starter").
- `/auth/signin`, `/auth/signup`, `/dashboard` render visually unchanged from before this
  phase (cosmic backdrop intact, no regression in card glass, headline gradients still
  visible).
- The headline on `/` uses the new `text-cosmic-gradient` utility (verified by inspecting
  the DOM — class name appears).

**Implementation Note**: After completing this phase and all automated verification passes,
pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: AppLayout primitive + AppTopbar + courses service

### Overview

Introduce the in-app layout shell every new surface will use: `AppLayout.astro` wraps the
document `Layout.astro`, activates cosmic tokens via a `.dark` wrapper, paints the cosmic
backdrop and star-field, and slots an `AppTopbar` above the page content. Add a typed
courses service so catalog/course/lesson pages query Supabase through one named entry point
instead of inline SQL.

### Changes Required

#### 1. AppTopbar component

**File**: `src/components/AppTopbar.astro`

**Intent**: A slim cosmic-styled topbar that shows the Unstuck wordmark on the left and
auth-state-aware actions on the right (`Sign in` / `Sign up` links when no user; user email
+ `Dashboard` + `Sign out` form when signed in). Mirrors the auth-state pattern in the
existing [src/components/Topbar.astro](src/components/Topbar.astro) but uses token-driven
classes (`bg-card/50 border-border text-foreground`) so it follows the cosmic palette.

**Contract**: A single `.astro` component that reads `Astro.locals.user` and renders:
- Left: `Unstuck` wordmark as `<a href="/">`, using `text-cosmic-gradient`.
- Right: when `user` is null, `<a>` to `/auth/signin` ("Sign in") and `/auth/signup`
  ("Sign up"). When `user` is present, the user email (`text-muted-foreground`),
  `<a href="/dashboard">Dashboard</a>`, and a `<form method="POST" action="/api/auth/signout">`
  with a sign-out button (matches the existing logout pattern at
  [src/components/Topbar.astro:16-20](src/components/Topbar.astro#L16-L20)).
- Outer chrome: rounded glass card using `bg-card/50 border border-border backdrop-blur-xl`.

#### 2. AppLayout

**File**: `src/layouts/AppLayout.astro`

**Intent**: The in-app layout primitive. Wraps `Layout.astro` (so the document shell, banner,
and global CSS are inherited), then renders a top-level `<div class="dark bg-cosmic bg-cosmic-starfield min-h-screen">`
wrapper to activate cosmic tokens for its subtree, places the `AppTopbar`, and exposes a
default `<slot />` for page content.

**Contract**: Accepts a `title` prop and forwards it to `Layout`. The structure inside the
`Layout` slot is:

```astro
<div class="dark bg-cosmic relative min-h-screen w-full overflow-hidden">
  <div class="bg-cosmic-starfield pointer-events-none absolute inset-0" />
  <div class="relative z-10 p-4 sm:p-8">
    <AppTopbar />
    <slot />
  </div>
</div>
```

(The `.dark` class is what activates the cosmic tokens for descendants without affecting the
sibling auth/dashboard surfaces, which continue to use Layout directly.)

#### 3. Courses service

**File**: `src/lib/services/courses.ts`

**Intent**: Centralize the read queries the catalog, course detail, and lesson pages all
need, so each page calls a named helper instead of inlining `.from("courses").select(…)`.
All helpers accept an already-constructed Supabase client (returned by `createClient()` in
[src/lib/supabase.ts](src/lib/supabase.ts)) so the page controls the request-scoped client
lifecycle.

**Contract**: Exports four functions, all returning `Promise<...>`:

- `listCourses(supabase): Promise<Course[]>` — `select * from courses order by created_at asc`.
  Returns `[]` on error (logs to console with a labeled prefix).
- `getCourseBySlug(supabase, slug: string): Promise<Course | null>` — `.eq("slug", slug).single()`.
  Returns `null` when not found.
- `listLessonsForCourse(supabase, courseId: string): Promise<Lesson[]>` —
  `.eq("course_id", courseId).order("position", { ascending: true })`. Returns `[]` when RLS
  hides rows (anon user) — callers branch on emptiness.
- `getLessonBySlugs(supabase, courseSlug: string, lessonSlug: string): Promise<{ course: Course; lesson: Lesson } | null>` —
  resolve course by slug, then lesson by `course_id + slug`. Returns `null` when either is
  missing or hidden by RLS.

Types use the existing `Course` and `Lesson` aliases from
[src/types.ts](src/types.ts). The Supabase client parameter is typed as
`ReturnType<typeof import("@/lib/supabase").createClient>` (NonNullable handling at the
caller).

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- `npm run dev` → `/` still renders unchanged from Phase 1 (no AppLayout consumer yet).
- AppLayout file imports without TypeScript errors.
- AppTopbar renders correctly in isolation when temporarily mounted on `/courses-preview`
  (a throwaway smoke check that can be deleted before commit).

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Catalog + course detail pages

### Overview

The first two in-app surfaces. `/courses` is the public catalog — anon-readable per
`courses.SELECT` policy. `/courses/[slug]` is the course detail page — also public for the
course header itself, but the lesson list is gated by `lessons.SELECT` (`has_course_access`),
so anon users see a "Sign in to view lessons" CTA instead.

### Changes Required

#### 1. Catalog page

**File**: `src/pages/courses/index.astro`

**Intent**: Cosmic grid of course cards backed by `listCourses`. Card layout uses the new
token-driven styling (`bg-card/40 border-border`); CTA on each card links to
`/courses/[slug]`. Wraps content in `AppLayout`.

**Contract**:
- SSR by default (project's `output: "server"` makes prerender=false the default for
  pages; no per-page export needed — AGENTS.md's `prerender = false` rule applies to API
  routes only).
- Builds the Supabase client via `createClient(Astro.request.headers, Astro.cookies)`; if
  null (env vars missing), renders an empty state.
- Calls `listCourses(supabase)`; renders cards in a CSS grid (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`).
- Each card shows `title` (using `text-cosmic-gradient`), `description` truncated to ~140
  chars, and an outline button styled with `bg-primary text-primary-foreground` linking to
  `/courses/${course.slug}`.
- Page heading: "Courses" with subline "One lesson, one chat, no leaving the page."
- Title prop: `"Courses — Unstuck"`.

#### 2. Course detail page

**File**: `src/pages/courses/[slug]/index.astro`

**Intent**: Course header (title, description) always visible. Lesson list rendered when the
authenticated viewer has course access (free course → everyone signed-in; in v1 every course
is free). Anon viewers see a sign-in CTA instead of the lesson list. 404 when the slug
doesn't resolve.

**Contract**:
- SSR by default (no per-page `prerender` export needed).
- Reads `Astro.params.slug`.
- Builds Supabase client; calls `getCourseBySlug(supabase, slug)`.
- If null → set `Astro.response.status = 404` and render a cosmic-styled "Course not found"
  message inside `AppLayout` (no `/404` page exists; Astro doesn't auto-generate one for
  SSR pages, so a redirect approach would itself 404). The page still returns HTML so the
  AppLayout chrome — wordmark, auth state — stays visible.
- If course found: render header with title (`text-cosmic-gradient`) + description.
- Call `listLessonsForCourse(supabase, course.id)`:
  - If `Astro.locals.user` is null OR the result is empty → render the "Sign in to view
    lessons" CTA card (primary button → `/auth/signin?next=/courses/${slug}`).
  - Else: render a numbered lesson list, each lesson row a link to
    `/courses/${slug}/lessons/${lesson.slug}` styled `bg-card/40 border-border` with the
    lesson `position` (e.g. "01") and `title`.
- Title prop: `"${course.title} — Unstuck"`.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- Sign out (or open private window). Visit `/courses` → renders the React Architecture Deep
  Dive card.
- Click the card → `/courses/react-architecture-deep-dive` renders the course header
  + "Sign in to view lessons" CTA.
- Sign in, return to `/courses/react-architecture-deep-dive` → renders the lesson list with
  one entry, "01 — Server Components and the Streaming Model".
- Visiting `/courses/does-not-exist` returns a 404 (response code) and a cosmic-styled
  "Course not found" page.
- Both pages use the AppLayout (topbar with Unstuck wordmark + auth state visible).

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Lesson page + markdown + video embed + seed fixture update

### Overview

The third in-app surface — and the most content-rich. Add a `marked`-backed
`renderMarkdown` helper, a small `parseVideoUrl` utility for YouTube/Vimeo, and build the
two-column desktop / single-column narrow lesson page. Update the local-dev seed
`video_url` to a real public YouTube URL so the end-to-end demo works.

### Changes Required

#### 1. `marked` + `@tailwindcss/typography` dependencies

**Files**: `package.json` (via `npm install marked @tailwindcss/typography`) and
`src/styles/global.css`

**Intent**: Add the markdown parser (operator-trusted-content boundary means no sanitizer
is paired with it, per Q5) and the typography plugin that styles the rendered markdown
inside the cosmic theme. Pin both to current stable majors.

**Contract**:
- `marked` and `@tailwindcss/typography` appear under `dependencies` in `package.json`;
  `package-lock.json` updates.
- `src/styles/global.css` gains a `@plugin "@tailwindcss/typography";` directive (Tailwind
  v4 plugin loading) placed near the top alongside the existing `@import "tailwindcss";`.
  This activates the `prose` / `prose-invert` utility classes used by the lesson page
  `<article>`.
- `npm run build` continues to succeed.

#### 2. Markdown helper

**File**: `src/lib/markdown.ts`

**Intent**: Encapsulate `marked.parse` with the project's GFM options and a documented
trust-boundary comment so the call site is one identifier, not a parser configuration
literal.

**Contract**: Exports `renderMarkdown(content: string): string`. Uses
`marked.parse(content, { gfm: true, breaks: false, async: false })` and returns the
resulting string. File-level JSDoc explains that the function returns trusted HTML
suitable for `set:html`, that the trust comes from operator-only write access (RLS), and
that adding a sanitizer is the required follow-up if non-operator authors ever write
markdown.

#### 3. Video embed parser

**File**: `src/lib/video-embed.ts`

**Intent**: Convert a `lessons.video_url` into an iframe-ready embed URL for YouTube and
Vimeo. Operators paste natural watch URLs; the parser normalizes them. Unrecognized hosts
return a fallback signal so the page can render a "Video preview unavailable" message
instead of a broken iframe.

**Contract**: Exports `parseVideoUrl(url: string): { embedSrc: string | null; provider: "youtube" | "vimeo" | "unknown" }`. Recognizes:
- `youtube.com/watch?v=ID` → `https://www.youtube.com/embed/ID`
- `youtu.be/ID` → `https://www.youtube.com/embed/ID`
- `youtube.com/embed/ID` → passes through
- `vimeo.com/ID` (numeric ID) → `https://player.vimeo.com/video/ID`
- `player.vimeo.com/video/ID` → passes through
- Anything else → `{ embedSrc: null, provider: "unknown" }`

ID extraction tolerates trailing query strings (e.g. `youtube.com/watch?v=ID&t=42s`).
Implementation uses `URL` parsing (not regex over the full URL) for the host check; ID
extraction uses search-param lookup for YouTube watch, path segment for the rest.

#### 4. Lesson page

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: The lesson workspace surface — wraps `AppLayout`, renders the embedded video,
the rendered markdown body, and the chat-slot placeholder card. Two-column on desktop,
single-column on narrow viewports.

**Contract**:
- SSR by default (no per-page `prerender` export needed).
- Reads `Astro.params.slug` and `Astro.params.lessonSlug`.
- Builds Supabase client; calls
  `getLessonBySlugs(supabase, slug, lessonSlug)`.
- If null → `Astro.response.status = 404`, render "Lesson not found" inside `AppLayout`.
- If found: parse `lesson.video_url` via `parseVideoUrl`; render
  `renderMarkdown(lesson.content_md)`.
- Layout grid (desktop): `grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]`.
- Left column (lg:col-span-1, on narrow: full-width):
  - Video container: 16:9 aspect-ratio wrapper. When `embedSrc !== null`, render
    `<iframe src={embedSrc} class="absolute inset-0 h-full w-full" allowfullscreen referrerpolicy="strict-origin" loading="lazy" />`.
    When `embedSrc === null`, render a cosmic-styled "Video preview unavailable for this
    URL" fallback block (uses `bg-card/40`).
  - Below the video: lesson title (`text-cosmic-gradient`).
  - Below the title: `<article class="prose prose-invert max-w-none" set:html={html}></article>`
    — the `prose-invert` modifier from `@tailwindcss/typography` (added in step 1) gives
    cosmic-compatible default styling for headings, lists, code, etc. Customization knobs
    (link color = `--primary`, etc.) can land later if needed; v1 takes the plugin defaults.
- Right column (lg, narrow: stacked below the left column at full width): chat slot card
  with header "Live peer chat", a `bg-card/40 border-border` glass block, and centered
  body text "Coming in S-02. The chat panel will live here on every lesson." The card uses
  `shadow-cosmic-glow` to hint at the future "live" affordance.
- Title prop: `"${lesson.title} — Unstuck"`.

#### 5. Seed video URL

**File**: `supabase/seed.sql`

**Intent**: Replace the placeholder `https://example.com/...` `video_url` for the seeded
lesson with a real public YouTube watch URL aligned with the lesson title ("Server
Components and the Streaming Model" — pick a stable React Conf or React-team talk on
that topic). This affects only local-dev `db reset` runs; production was deployed via
`supabase db push` (migrations only) and is unaffected.

**Contract**: At [supabase/seed.sql:79-80](supabase/seed.sql#L79-L80), change the
`video_url` literal to a stable public YouTube watch URL (e.g. an official React-team
talk on Server Components from the React Conf YouTube channel). The implementer picks the
URL; the parser's YouTube watch branch must successfully convert it to an embed.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.
- `npx supabase db reset` applies cleanly with the updated seed (Supabase local stack
  running).

#### Manual Verification

- Signed in, visit `/courses/react-architecture-deep-dive/lessons/server-components-streaming`
  → renders the lesson page with a working video iframe (YouTube embed loads), rendered
  markdown content (headings, paragraphs, lists from the seed `content_md`), and the chat-
  slot placeholder card on the right.
- Resize to narrow viewport (< 1024 px wide) → columns collapse to a single column; chat
  slot stacks below the markdown.
- Visit `/courses/react-architecture-deep-dive/lessons/does-not-exist` → 404 page renders
  inside AppLayout.
- Temporarily set `lessons.video_url` to a non-YouTube/Vimeo URL (e.g. via Supabase
  Studio) and reload → "Video preview unavailable" fallback renders in place of the
  iframe.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Protected routing + `?next=` round-trip + final verification

### Overview

Wire the lesson route into the auth middleware so anon visitors are redirected to
`/auth/signin?next=<encoded-lesson-url>`. Complete the post-signin redirect to honor that
`next` parameter (safely — only same-origin paths). Run the full build/lint pipeline as the
phase exit gate.

### Changes Required

#### 1. Middleware lesson gating + `next` parameter

**File**: `src/middleware.ts`

**Intent**: Extend the route gating to cover lesson URLs without over-gating the public
catalog or course-detail pages. When redirecting an unauth visitor, encode the original
pathname + search into a `next` query parameter so the sign-in success path can return them.

**Contract**: Introduces a local `isProtectedRoute(pathname: string): boolean` helper that
returns `true` when:
- `pathname.startsWith("/dashboard")`, or
- `/^\/courses\/[^/]+\/lessons\//.test(pathname)`.

The redirect path on protected, unauth requests becomes
`/auth/signin?next=${encodeURIComponent(pathname + search)}` where `pathname = context.url.pathname`
and `search = context.url.search` — middleware exposes `context`, not the `Astro`
namespace, matching the existing pattern at [src/middleware.ts:18](src/middleware.ts#L18).
Catalog (`/courses`) and course detail (`/courses/[slug]`) remain unprotected — the regex
requires the `/lessons/` segment.

#### 2. Sign-in success `?next=` honoring (server-side, three coordinated edits)

**Files**: `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signin.ts`

**Intent**: After a successful sign-in, redirect to the `next` query parameter when present
and safe; otherwise keep today's `/` fallback (the recast Unstuck landing post-Phase 1).
"Safe" means a single-leading-slash same-origin path (rejects `//evil.example.com`
open-redirect attempts). The flow is fully server-side today
([src/pages/api/auth/signin.ts:19](src/pages/api/auth/signin.ts#L19) already does
`return context.redirect("/")`) — no client-side redirect logic anywhere in
SignInForm.tsx — so the plan pre-commits the contract instead of leaving it for discovery.

**Contract** (three coordinated edits):

1. **`src/pages/auth/signin.astro`** — alongside the existing `const error = Astro.url.searchParams.get("error")`
   at [src/pages/auth/signin.astro:5](src/pages/auth/signin.astro#L5), add
   `const next = Astro.url.searchParams.get("next");` and pass it as a prop:
   `<SignInForm serverError={error} next={next} client:load />`.

2. **`src/components/auth/SignInForm.tsx`** — extend the `Props` interface with
   `next?: string | null`. Render a hidden input inside the form whenever `next` is
   non-null and non-empty: `<input type="hidden" name="next" value={next} />`. No other
   form logic changes — the existing `handleSubmit` validation gate is untouched.

3. **`src/pages/api/auth/signin.ts`** — after the successful `signInWithPassword` branch,
   read `form.get("next")` as `string | null`, validate via
   `isSafeNext(next): boolean = typeof next === "string" && next.startsWith("/") && !next.startsWith("//")`,
   then replace the existing `return context.redirect("/")` with
   `return context.redirect(isSafeNext(next) ? next! : "/")`. The fallback stays `/`
   (today's behavior) — the Unstuck landing recast in Phase 1 is the right post-signin
   surface when no specific destination was requested. The error-path redirects keep
   propagating `next` if present so the round-trip survives a wrong-password retry:
   `?error=…&next=…`.

#### 3. Final verification gate

**Files**: none (verification step)

**Intent**: This is the slice's exit gate — run the build pipeline, manually walk through
the full end-to-end demo, and confirm no auth/dashboard regressions.

**Contract**: All three commands exit 0; the manual walk-through succeeds.

### Success Criteria

#### Automated Verification

- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npx astro check` exits 0.

#### Manual Verification

- Sign out. Visit
  `/courses/react-architecture-deep-dive/lessons/server-components-streaming` directly →
  redirects to `/auth/signin?next=%2Fcourses%2Freact-architecture-deep-dive%2Flessons%2Fserver-components-streaming`.
- Sign in via that page → returns to the original lesson URL (not `/dashboard`).
- Visit `/auth/signin?next=//evil.example.com/x` → sign-in succeeds, redirects to `/`
  (the safe fallback), NOT to the external host.
- Visit `/auth/signin` without `?next=` → sign-in succeeds, redirects to `/` (today's
  fallback — now the Unstuck landing).
- Auth + dashboard pages render unchanged from before this slice.
- Lighthouse/devtools network: lesson page initial JS bundle does not include `marked`
  client-side (markdown is server-rendered; no React island ships).

**Implementation Note**: This is the slice's exit gate. After manual confirmation, the
change is ready for `/10x-plan-review` follow-up if needed, otherwise for `/10x-archive`
once merged.

---

## Testing Strategy

This repo has no test framework configured. The plan's verification strategy is:

- **Static** — `npm run lint`, `npm run build`, `npx astro check` per phase.
- **Manual** — end-to-end browser walk-throughs per phase's Manual Verification list,
  exercised against `npm run dev` with the local Supabase stack running and seeded.
- **Schema/RLS** — already proven by F-01; this slice does not change schema or policies.

Introducing a test framework (Vitest for utils, Playwright for e2e) is captured as
out-of-scope and a follow-up candidate.

## Performance Considerations

- 100% Astro pages — no React hydration cost for catalog/course/lesson. The only
  client-side JS on the lesson page is the standard browser handling of the YouTube iframe.
- `marked` runs server-side; `renderMarkdown` is synchronous. At the seed's
  `content_md` size (~400 chars) this is sub-millisecond per request.
- YouTube iframe uses `loading="lazy"` so the embed only fetches when the player scrolls
  into view (relevant on narrow viewports where the video is above the markdown but the
  user may scroll past).
- Cosmic backdrop uses CSS gradients + a static `radial-gradient` star-field — no canvas,
  no JS animation. No measurable paint cost.

## Migration Notes

- No production migrations. F-01 covered the schema; this slice ships UI only.
- `supabase/seed.sql` is local-dev only — the changed `video_url` does not affect the
  deployed Supabase project.
- No environment variable changes; the existing `SUPABASE_URL` / `SUPABASE_KEY` remain
  sufficient.

## References

- F-01 plan: [context/changes/lesson-chat-data-model/plan.md](context/changes/lesson-chat-data-model/plan.md)
- F-01 brief: [context/changes/lesson-chat-data-model/plan-brief.md](context/changes/lesson-chat-data-model/plan-brief.md)
- Roadmap S-01: [context/foundation/roadmap.md#L63-L74](context/foundation/roadmap.md#L63-L74)
- PRD FR-003 / FR-004: [context/foundation/prd.md](context/foundation/prd.md)
- Cosmic direction memory: `~/.claude/.../memory/unstuck-visual-direction.md`
- Existing cosmic patterns to extract: [src/components/Welcome.astro](src/components/Welcome.astro), [src/pages/auth/signin.astro](src/pages/auth/signin.astro)
- Existing schema: [supabase/migrations/20260528122957_lesson_chat_schema.sql](supabase/migrations/20260528122957_lesson_chat_schema.sql)
- Existing RLS: [supabase/migrations/20260528140054_lesson_chat_rls.sql](supabase/migrations/20260528140054_lesson_chat_rls.sql)
- Existing seed: [supabase/seed.sql](supabase/seed.sql)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Cosmic design tokens + utilities + Layout title + landing recast

#### Automated

- [x] 1.1 `npm run lint` exits 0 — 442a6cf
- [x] 1.2 `npm run build` exits 0 — 442a6cf
- [x] 1.3 `npx astro check` exits 0 — 442a6cf

#### Manual

- [x] 1.4 `/` renders the Unstuck landing (wordmark, tagline, CTA → `/courses`) — 442a6cf
- [x] 1.5 Browser tab title on `/` reads "Unstuck" — 442a6cf
- [x] 1.6 `/auth/signin`, `/auth/signup`, `/dashboard` render unchanged from pre-phase — 442a6cf
- [x] 1.7 Landing headline uses the new `text-cosmic-gradient` utility (DOM-inspected) — 442a6cf

### Phase 2: AppLayout primitive + AppTopbar + courses service

#### Automated

- [x] 2.1 `npm run lint` exits 0 — c287271
- [x] 2.2 `npm run build` exits 0 — c287271
- [x] 2.3 `npx astro check` exits 0 — c287271

#### Manual

- [ ] 2.4 `/` still renders unchanged from Phase 1
- [ ] 2.5 AppLayout file imports without TypeScript errors
- [ ] 2.6 AppTopbar renders correctly in a throwaway smoke route

### Phase 3: Catalog + course detail pages

#### Automated

- [x] 3.1 `npm run lint` exits 0 — 141ea38
- [x] 3.2 `npm run build` exits 0 — 141ea38
- [x] 3.3 `npx astro check` exits 0 — 141ea38

#### Manual

- [ ] 3.4 Anon `/courses` renders the seeded course card
- [ ] 3.5 Anon `/courses/react-architecture-deep-dive` renders header + "Sign in to view lessons" CTA
- [ ] 3.6 Authenticated `/courses/react-architecture-deep-dive` renders the lesson list (one entry)
- [ ] 3.7 `/courses/does-not-exist` returns 404 with cosmic "Course not found" page
- [ ] 3.8 Both pages use the AppLayout (topbar visible with auth state)

### Phase 4: Lesson page + markdown + video embed + seed fixture update

#### Automated

- [x] 4.1 `npm run lint` exits 0
- [x] 4.2 `npm run build` exits 0
- [x] 4.3 `npx astro check` exits 0
- [x] 4.4 `npx supabase db reset` applies cleanly with updated seed

#### Manual

- [ ] 4.5 Authenticated lesson URL renders video iframe + rendered markdown + chat-slot placeholder
- [ ] 4.6 Narrow viewport (< 1024 px) reflows to single column with chat slot stacked
- [ ] 4.7 Unknown lesson slug returns 404 with cosmic "Lesson not found" page
- [ ] 4.8 Non-YouTube/Vimeo `video_url` renders "Video preview unavailable" fallback

### Phase 5: Protected routing + `?next=` round-trip + final verification

#### Automated

- [ ] 5.1 `npm run lint` exits 0
- [ ] 5.2 `npm run build` exits 0
- [ ] 5.3 `npx astro check` exits 0

#### Manual

- [ ] 5.4 Anon visit to lesson URL redirects to `/auth/signin?next=<encoded-url>`
- [ ] 5.5 Sign-in on that page returns to the original lesson URL
- [ ] 5.6 `?next=//evil.example.com/x` falls back to `/` (not the external host)
- [ ] 5.7 `?next=` absent falls back to `/` (today's behavior; `/` is now the Unstuck landing)
- [ ] 5.8 Auth + dashboard pages render unchanged from pre-slice
- [ ] 5.9 Lesson-page network panel confirms no `marked` JS in the client bundle
