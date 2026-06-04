# Content / Autodescription Tabs Implementation Plan

## Overview

Add an operator-authored, markdown `autodescription_md` field to lessons and surface it on the lesson page as a **Content / Autodescription** tab strip beneath the video — a text-only summary for readers who skip the playback. The tab strip appears only when a summary exists (progressive enhancement: existing lessons render exactly as today). It's implemented as an Astro component with a small inline toggle script, so the trusted server-rendered markdown stays server-rendered (no `dangerouslySetInnerHTML`, no extra hydration).

## Current State Analysis

- **lessons schema**: `id, course_id, slug, title, position, video_url (nullable), content_md, chapter_id, created_at, updated_at` — created in `supabase/migrations/20260528122957_lesson_chat_schema.sql:52`, amended by `20260530120000_lesson_chapters.sql` (chapter_id, nullable video_url) and `20260531170123_course_views_and_updated_at.sql` (updated_at).
- **RLS** (`20260528140054_lesson_chat_rls.sql:69`): learners `SELECT` lessons via `has_course_access(course_id)` (all columns, no column-level policy); no authenticated INSERT/UPDATE — writes are **service_role only**. A new nullable column is therefore learner-readable and operator-writable with **no policy change**.
- **DB types**: `src/lib/db/database.types.ts:183` holds `lessons` Row/Insert/Update. Regenerated via `npx supabase gen types typescript --local | grep -v "^Connecting" > src/lib/db/database.types.ts` (per the comment in `src/types.ts:1`). `Lesson = Tables["lessons"]["Row"]` (`src/types.ts:28`) auto-includes new columns.
- **Query**: `getLessonBySlugs` uses `.select("*")` (`src/lib/services/courses.ts:80`) — the new column flows through with **no query change**.
- **Render**: lesson page builds `html = renderMarkdown(lesson.content_md)` and renders `<article class="prose max-w-none" set:html={html} />` (`src/pages/courses/[slug]/lessons/[lessonSlug].astro:22,179`). `renderMarkdown` (`src/lib/markdown.ts`) returns trusted HTML via `marked.parse` — safe because lessons are operator-only (RLS).
- **Tab styling to match**: the aside tab buttons (`src/components/lesson/LessonAside.tsx:259-305`) use `role="tablist"` container `flex items-center gap-1` and buttons `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors`, active `bg-primary/15 text-primary`, inactive `text-muted-foreground hover:text-foreground hover:bg-card/60`.
- **No reusable Tabs component**; `src/components/ui/` has only `button.tsx` + `LibBadge.astro`. No island currently receives server-rendered HTML.
- **Seed**: local `supabase/seed.sql:95` INSERTs lessons with explicit columns incl. `content_md` (E'...'). Production lessons are authored/edited via Supabase Studio (service_role); `docs/operator/seeding.md` covers operator seeding.

## Desired End State

- A nullable `autodescription_md` column exists on `lessons` (local + prod), readable by learners, writable by operator.
- On a lesson whose `autodescription_md` is non-empty, the lesson page shows a **Content | Autodescription** tab strip (matching the aside tabs) under the video/badges; Content is selected by default and shows the existing markdown; Autodescription shows the rendered summary. Switching tabs is instant and keyboard-accessible.
- On a lesson with no `autodescription_md`, the page renders the Content article exactly as today (no tab strip).
- One local seed lesson has a sample autodescription so both states are exercised in dev.

**Verify**: `npx astro check`, `npm run lint`, `npm run build` pass; locally, the seeded lesson shows working tabs and an un-seeded lesson shows none; prod migration applied and lessons still load.

### Key Discoveries

- `select("*")` + `Lesson = Row` alias means the only type/query work is regenerating `database.types.ts` — no manual DTO edits.
- Writes are service_role-only, so no RLS change is needed for an operator-authored field.
- `renderMarkdown` returns trusted HTML; rendering a second `set:html` block for the summary follows the existing pattern exactly.

## What We're NOT Doing

- No operator authoring UI — `autodescription_md` is set via SQL/Studio like all lesson content.
- No `dangerouslySetInnerHTML` / React island for the tabs (Astro + inline script instead).
- No tab-choice persistence across lessons (Content default every time).
- No markdown sanitizer change (content stays operator-trusted, same trust boundary as `content_md`).
- No change to `getLessonBySlugs` / `listChaptersWithLessonsForCourse` queries (already `select("*")`).
- No autodescription on the course-catalog or aside — lesson page only.

## Implementation Approach

Extend the data model first (additive nullable column + types + one seed row), then build a self-contained `LessonContentTabs.astro` that renders both markdown panels server-side and toggles them with a tiny inline script, and wire it into the lesson page behind an "autodescription present?" check. Finish with a gated prod `supabase db push` (additive/nullable = safe).

## Critical Implementation Details

- **Trusted-HTML boundary**: both panels render operator-authored markdown via `renderMarkdown` + `set:html`, identical to today's article. Do not introduce `dangerouslySetInnerHTML` or pass HTML into a React island.
- **A11y**: the toggle script must keep `role="tab"`/`role="tabpanel"`, `aria-selected`, and `hidden` in sync, and the tab buttons must be keyboard-operable (native `<button>`s; Enter/Space work for free).

---

## Phase 1: Data — migration, types, seed

### Overview

Add the nullable column, regenerate types, and seed one lesson so the feature is exercisable locally.

### Changes Required

#### 1. Migration: add `autodescription_md`

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_lesson_autodescription.sql` (new)

**Intent**: Add a nullable, operator-authored markdown summary column to `lessons`. Additive only; no RLS change (learner SELECT already covers all columns; writes stay service_role-only).

**Contract**: `alter table public.lessons add column autodescription_md text;` (nullable, no default → NULL means "no summary"). Use the `YYYYMMDDHHmmss_` naming convention matching existing migrations. Optionally a `comment on column` documenting it as operator-seeded.

#### 2. Regenerate DB types

**File**: `src/lib/db/database.types.ts`

**Intent**: Reflect the new column in the generated types so `Lesson` exposes `autodescription_md: string | null`.

**Contract**: Run `npx supabase gen types typescript --local | grep -v "^Connecting" > src/lib/db/database.types.ts` (after `supabase db reset`/migration applied locally). `lessons` Row gains `autodescription_md: string | null`; Insert/Update gain the optional field. No edit to `src/types.ts` (alias auto-updates).

#### 3. Seed one lesson

**File**: `supabase/seed.sql`

**Intent**: Populate `autodescription_md` on exactly one seeded lesson (leave the rest NULL) so dev exercises both the tabs-present and tabs-absent paths.

**Contract**: Add `autodescription_md` to the column list + a sample `E'...'` markdown value for a single lesson row in the existing `insert into public.lessons (...)`. Other rows omit it (NULL).

### Success Criteria

#### Automated Verification

- Migration applies on reset: `npx supabase db reset` (or `supabase migration up`) succeeds
- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- `autodescription_md` present in types: `grep -q "autodescription_md" src/lib/db/database.types.ts`

#### Manual Verification

- In local Studio / psql, the seeded lesson has a non-null `autodescription_md`; others are NULL.

**Implementation Note**: Pause for confirmation before Phase 2.

---

## Phase 2: UI — LessonContentTabs.astro + lesson-page wiring

### Overview

Build the tab component and wire it into the lesson page so the summary surfaces only when present.

### Changes Required

#### 1. LessonContentTabs.astro

**File**: `src/components/lesson/LessonContentTabs.astro` (new)

**Intent**: Render a Content/Autodescription tab strip + two prerendered markdown panels, with a tiny inline script that toggles panel visibility and `aria-selected`/`hidden`. Visually matches the aside tabs. Content tab/panel active by default.

**Contract**: Props: `contentHtml: string`, `autodescriptionHtml: string` (both already-rendered trusted HTML). Markup: a `role="tablist"` strip with two `role="tab"` `<button>`s reusing the aside's class strings (active `bg-primary/15 text-primary`, inactive `text-muted-foreground hover:text-foreground hover:bg-card/60`); two `role="tabpanel"` `<article class="prose max-w-none" set:html={...}>` blocks, the autodescription one `hidden` initially. A scoped `<script>` wires click → toggle `hidden` + `aria-selected` (+ `tabindex` if desired). Self-contained; no props beyond the two HTML strings.

#### 2. Lesson page wiring

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Render `autodescription_md` to HTML; when present, replace the single `<article>` with `<LessonContentTabs>`, else keep the current plain article. No query change (already `select("*")`).

**Contract**: Compute `const autoHtml = lesson?.autodescription_md ? renderMarkdown(lesson.autodescription_md) : ""`. At the article site (`:179`), conditionally render: `autoHtml` truthy → `<LessonContentTabs contentHtml={html} autodescriptionHtml={autoHtml} />`; else the existing `<article class="prose max-w-none" set:html={html} />` unchanged. Import the new component.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Seeded lesson: tab strip shows under the video; Content is default and matches prior rendering; clicking Autodescription reveals the rendered summary; clicking Content returns. Keyboard: Tab to the buttons, Enter/Space switches.
- Un-seeded lesson: no tab strip; Content article renders exactly as before.
- Tabs visually match the aside tabs in both light and dark themes.
- Reading-only lesson (no video) with an autodescription set: tabs still render (gated on autodescription, not video).

**Implementation Note**: Pause for confirmation before Phase 3.

---

## Phase 3: Prod deploy

### Overview

Apply the additive migration to production and smoke-check.

### Changes Required

#### 1. Push migration to prod

**File**: (no code) — `supabase db push`

**Intent**: Apply the additive nullable column to the production database. Safe: additive, nullable, no backfill, no RLS change.

**Contract**: Run `npx supabase db push` against the linked prod project (per the F-01 deploy precedent). Verify the column exists (`\d public.lessons` / SQL probe). Prod lesson content is authored via Studio — operators can now set `autodescription_md` per lesson.

### Success Criteria

#### Automated Verification

- `supabase db push` reports the migration applied (no error)

#### Manual Verification

- Prod `lessons` has the `autodescription_md` column (SQL probe in Studio)
- Deployed lesson pages still load (existing lessons render Content with no tab strip, since prod autodescriptions are unset until an operator adds them)

**Implementation Note**: Final phase — gated prod action; confirm before running `supabase db push`.

---

## Testing Strategy

### Manual Testing Steps

1. `npx supabase db reset` → open the seeded lesson with an autodescription → verify Content default + working tab switch (mouse + keyboard) in both themes.
2. Open a lesson without an autodescription → verify no tab strip, article unchanged.
3. Set `autodescription_md` on a reading-only (no-video) lesson via local Studio → verify tabs appear.
4. After prod push: probe the column in Studio; load an existing prod lesson → renders normally.

## Migration Notes

Additive nullable column; no backfill, no data migration, no RLS change. Rollback is `alter table public.lessons drop column autodescription_md;` (only if needed before any operator authors content).

## References

- Change identity: `context/changes/lesson-autodescription-tabs/change.md`
- Plan brief: `context/changes/lesson-autodescription-tabs/plan-brief.md`
- Linear: UNS-20
- Lesson schema: `supabase/migrations/20260528122957_lesson_chat_schema.sql:52`; RLS `20260528140054_lesson_chat_rls.sql:69`
- Types regen: comment in `src/types.ts:1`; `src/lib/db/database.types.ts:183`
- Query: `src/lib/services/courses.ts:80`
- Render + article: `src/pages/courses/[slug]/lessons/[lessonSlug].astro:22,179`; `src/lib/markdown.ts`
- Tab styling to match: `src/components/lesson/LessonAside.tsx:259-305`
- Seed: `supabase/seed.sql:95`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Data — migration, types, seed

#### Automated

- [x] 1.1 Migration applies on reset (`npx supabase db reset`)
- [x] 1.2 Type check passes: `npx astro check`
- [x] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Build succeeds: `npm run build`
- [x] 1.5 `autodescription_md` present in `database.types.ts` (grep)

#### Manual

- [x] 1.6 Seeded lesson has non-null autodescription_md; others NULL

### Phase 2: UI — LessonContentTabs.astro + lesson-page wiring

#### Automated

- [ ] 2.1 Type check passes: `npx astro check`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Seeded lesson: tabs show, Content default, switch works (mouse + keyboard)
- [ ] 2.5 Un-seeded lesson: no tab strip, article unchanged
- [ ] 2.6 Tabs match aside styling in light + dark
- [ ] 2.7 Reading-only lesson with autodescription shows tabs

### Phase 3: Prod deploy

#### Automated

- [ ] 3.1 `supabase db push` applies the migration without error

#### Manual

- [ ] 3.2 Prod `lessons` has `autodescription_md` (SQL probe)
- [ ] 3.3 Existing prod lesson pages still load
