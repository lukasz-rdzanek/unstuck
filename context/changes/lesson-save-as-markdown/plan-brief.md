# Save Lesson as Markdown — Plan Brief

> Full plan: `context/changes/lesson-save-as-markdown/plan.md`

## What & Why

A "Save as Markdown" button next to Mark-Complete that downloads the current lesson as a single, attributed `.md` note (Linear UNS-21, Phase 1). Learners get portable personal notes without the platform becoming a trivially-mirrorable course dump.

## Starting Point

The lesson page has a `userId`-gated actions row containing only `MarkCompleteButton` (a React island). All lesson data needed (title, content_md, video_url, slugs, course title) is already on the page. Deps include only `marked` — no PDF lib, no LLM SDK — so a client-side markdown download needs nothing new.

## Desired End State

On any lesson, clicking "Save as Markdown" downloads `<course-slug>-<lesson-slug>.md` containing the title heading, course line, content body, a video link (when present), and an attribution footer — styled to match Mark-Complete in both themes.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Format (this slice) | Markdown only, client-side | Zero deps, Workers-safe; matches the note's two-phase plan | Plan |
| PDF / LLM summary | Deferred | New dep/SDK + cost; respects no-LLM-v1 | Plan |
| Video URL | Include as a labeled link | Convenient; URL is already the public embed | Plan |
| Anti-mirror | Attribution header/footer, single-lesson (no bulk) | Personal-notes framing, lightweight, no infra | Plan |
| File contents | Title + course + body + video + footer | Self-contained useful note | Plan |
| Filename | `<course-slug>-<lesson-slug>.md` | Stable, filesystem-safe, groups by course | Plan |
| Structure | Pure helper + React island | Testable formatting; interactivity → island per AGENTS.md | Plan |

## Scope

**In scope:** `buildLessonMarkdown()` + `lessonExportFilename()` helper; `SaveLessonButton` island (Blob + `<a download>`); wiring into the lesson actions row.

**Out of scope:** PDF (client or server); LLM summarization; bulk/whole-course export; new deps; any DB/API change.

## Architecture / Approach

Pure helper assembles the markdown string from plain fields; a small client island builds it on click (attribution link from `window.location.href`), creates a `text/markdown` Blob, and triggers a download via a temporary anchor. Dropped into the existing `userId`-gated actions row beside Mark-Complete.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Save-as-Markdown export | Helper + SaveLessonButton island + lesson-page wiring | Trivial; main care is button styling parity + filename correctness |

**Prerequisites:** none.
**Estimated effort:** ~1 short session.

## Open Risks & Assumptions

- Client-side download (`<a download>` + object URL) is well-supported in target browsers; no SSR concern (handler is client-only).
- Anti-mirror is framing/attribution, not technical prevention — acceptable for personal-notes scope.
- Visible in prod only after the next app (Cloudflare) deploy — no DB change.

## Success Criteria (Summary)

- Button appears beside Mark-Complete (both themes); clicking downloads a correctly-named, correctly-composed `.md`.
- Video line present for video lessons, omitted for reading-only.
- No new deps; build/check/lint green; no Mark-Complete regression.
