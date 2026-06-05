# Save Lesson as Markdown Implementation Plan

## Overview

Add a "Save as Markdown" button beside Mark-Complete on the lesson page that downloads the current lesson as a single, attributed `.md` note (title + course + content body + video link + footer). Fully client-side (Blob + `<a download>`), zero new dependencies, Workers-safe. This is Phase 1 of UNS-21's two-phase rollout; PDF export and LLM-summarized "derivative" output are explicitly out of scope here.

## Current State Analysis

- The lesson page renders an actions row gated on `userId`: `<div class="border-border mt-8 border-t pt-6"><MarkCompleteButton client:load lessonId={lesson.id} initialCompleted={isCompleted} /></div>` (`src/pages/courses/[slug]/lessons/[lessonSlug].astro`). Lessons are auth-gated (protected route + RLS), so every viewer is signed in.
- `MarkCompleteButton` (`src/components/lesson/MarkCompleteButton.tsx`) is a React island taking plain props — the established pattern for an interactive lesson action.
- Lesson data available on the page: `lesson.title`, `lesson.content_md`, `lesson.video_url` (nullable), `lesson.slug`, `lesson.autodescription_md`; `course.title`, `course.slug`.
- Dependencies (`package.json`): only `marked` — no PDF lib, no LLM SDK, no file-saver. Client-side markdown download needs none of those.
- `renderMarkdown` converts markdown → HTML for display; the export is the *opposite* direction — it ships the raw `content_md` text, so there is no HTML/`set:html`/trust concern.

## Desired End State

- On any lesson, a "Save as Markdown" button sits next to Mark-Complete. Clicking it downloads `<course-slug>-<lesson-slug>.md` containing: an `# <title>` heading, a course line, the `content_md` body, a "Watch the video: <url>" line when a video exists, and an attribution footer (`Saved from Unstuck — <lesson url> — for personal use`). The button styling matches the theme in both light and dark.

**Verify**: `astro check`, `npm run lint`, `npm run build` pass; clicking downloads a correctly-named `.md` with the expected sections; the video line is omitted on reading-only lessons.

### Key Discoveries

- Zero-dependency client download (`Blob` + `URL.createObjectURL` + a temporary `<a download>`) is the simplest Workers-safe path; the Linear note's two-phase plan endorses md-first.
- Export builds raw markdown (not HTML) → no trust-boundary/sanitization concerns.
- `course.slug` + `lesson.slug` are already URL-safe, so the filename needs no sanitization.

## What We're NOT Doing

- No PDF export (client or server) — deferred to UNS-21 Phase 2.
- No LLM summarization / "derivative" output — deferred; respects no-LLM-in-v1.
- No bulk / whole-course export — single lesson at a time (anti-mirror).
- No new dependencies.
- No DB / schema / API changes — purely a client-side read of data already on the page.
- No persistence or tracking of exports.

## Implementation Approach

A pure helper assembles the markdown string from plain fields; a small React island wraps the click → build → download flow and is dropped into the existing actions row next to Mark-Complete. The attribution link uses `window.location.href` at click time so it's correct per environment.

---

## Phase 1: Save-as-Markdown export

### Overview

Build the export helper, the button island, and wire it into the lesson actions row.

### Changes Required

#### 1. Markdown export helper

**File**: `src/lib/lesson-export.ts` (new)

**Intent**: Pure, testable functions that assemble the export string and the filename — kept out of the component so the formatting is unit-checkable and reusable (e.g., a future PDF path).

**Contract**: `buildLessonMarkdown(input: { title: string; courseTitle: string; contentMd: string; videoUrl: string | null; lessonUrl: string }): string` returns the composed note — `# <title>` heading, an italic course line, the `contentMd` body, a `---` divider, a "Watch the video: <videoUrl>" line only when `videoUrl` is non-null, and an italic attribution footer `Saved from Unstuck — <lessonUrl> — for personal use`. `lessonExportFilename(courseSlug: string, lessonSlug: string): string` returns `${courseSlug}-${lessonSlug}.md`.

#### 2. SaveLessonButton island

**File**: `src/components/lesson/SaveLessonButton.tsx` (new)

**Intent**: A React island that, on click, builds the markdown via the helper and triggers a client-side download. Interactive (event handler) → React island per AGENTS.md.

**Contract**: Props `{ title: string; courseTitle: string; contentMd: string; videoUrl: string | null; courseSlug: string; lessonSlug: string }`. On click: `md = buildLessonMarkdown({ ..., lessonUrl: window.location.href })`; create `new Blob([md], { type: "text/markdown;charset=utf-8" })`; `URL.createObjectURL`; a temporary `<a>` with `download = lessonExportFilename(courseSlug, lessonSlug)`; click; then `URL.revokeObjectURL`. Renders a secondary/outline-style button (Download icon from lucide-react + "Save as Markdown") using theme tokens (`border-border text-foreground hover:bg-muted`) so it pairs visually with Mark-Complete in both themes. Guard for `typeof document === "undefined"` defensively (island only acts on click, so it's inherently client-side).

#### 3. Wire into the lesson actions row

**File**: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`

**Intent**: Render the Save button next to Mark-Complete.

**Contract**: In the `userId`-gated actions row, make the container a flex row (`flex flex-wrap items-center gap-3`) holding `<MarkCompleteButton …/>` and `<SaveLessonButton client:load title={lesson.title} courseTitle={course.title} contentMd={lesson.content_md} videoUrl={lesson.video_url} courseSlug={course.slug} lessonSlug={lesson.slug} />`. Import the component.

### Success Criteria

#### Automated Verification

- Type check passes: `npx astro check`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No new dependencies added: `git diff --stat package.json` shows no change

#### Manual Verification

- The "Save as Markdown" button appears next to Mark-Complete on a lesson, in both light and dark themes.
- Clicking downloads `<course-slug>-<lesson-slug>.md`; the file contains the title heading, course line, content body, the video link (for a video lesson), and the attribution footer.
- On a reading-only lesson (no video), the file omits the "Watch the video" line.
- No regression to Mark-Complete (still marks/uses confetti) — the two buttons coexist in the row.

**Implementation Note**: Single phase. After automated verification passes, pause for manual confirmation, then commit.

---

## Testing Strategy

### Manual Testing Steps

1. Open a video lesson → click Save as Markdown → confirm filename + file sections (title, course, body, video link, footer).
2. Open a reading-only lesson → export → confirm no video line.
3. Toggle theme → confirm the button matches Mark-Complete styling in both.

## Migration Notes

No DB or schema changes. The feature is client-side; it becomes visible in prod with the next app (Cloudflare) deploy — no separate migration or `db push`.

## References

- Change identity: `context/changes/lesson-save-as-markdown/change.md`
- Plan brief: `context/changes/lesson-save-as-markdown/plan-brief.md`
- Linear: UNS-21 (Phase 1 of 2)
- Actions row + lesson data: `src/pages/courses/[slug]/lessons/[lessonSlug].astro`
- Island pattern: `src/components/lesson/MarkCompleteButton.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Save-as-Markdown export

#### Automated

- [x] 1.1 Type check passes: `npx astro check` — 091f90b
- [x] 1.2 Lint passes: `npm run lint` — 091f90b
- [x] 1.3 Build succeeds: `npm run build` — 091f90b
- [x] 1.4 No new dependencies added (`git diff --stat package.json` clean) — 091f90b

#### Manual

- [x] 1.5 Save button appears next to Mark-Complete (both themes) — 091f90b
- [x] 1.6 Click downloads `<course-slug>-<lesson-slug>.md` with title/course/body/video/footer — 091f90b
- [x] 1.7 Reading-only lesson omits the video line — 091f90b
- [x] 1.8 No Mark-Complete regression — 091f90b
