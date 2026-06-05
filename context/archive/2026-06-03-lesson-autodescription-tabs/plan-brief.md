# Content / Autodescription Tabs — Plan Brief

> Full plan: `context/changes/lesson-autodescription-tabs/plan.md`

## What & Why

Add an operator-authored, markdown **autodescription** to lessons and surface it as a Content/Autodescription tab strip under the video — a text-only summary for readers who skip the playback (Linear UNS-20). Tabs appear only when a summary exists, so existing lessons are visually untouched.

## Starting Point

Lessons render a single `<article class="prose" set:html={renderMarkdown(content_md)}>` on the lesson page. The `lessons` table is service_role-write / learner-read via RLS, `getLessonBySlugs` already does `select("*")`, and `Lesson = Tables["lessons"]["Row"]`, so a new nullable column flows through types/queries with almost no plumbing. There is no reusable Tabs component, and no island currently takes server-rendered HTML.

## Desired End State

On a lesson with an autodescription, a Content | Autodescription tab strip (matching the aside tabs) sits under the video; Content is default, switching is instant and keyboard-accessible. Lessons without one render exactly as today. The column exists locally and in prod; one local seed lesson has a sample summary.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Tab implementation | Astro component + tiny inline toggle script | Keeps trusted SSR markdown server-rendered; no `dangerouslySetInnerHTML`, no hydration | Plan |
| When tabs show | Only when `autodescription_md` is non-empty | Progressive enhancement; zero change for existing lessons | Plan |
| Autodescription format | Markdown via the same `renderMarkdown` + `prose` | Consistent rendering, reuses pipeline | Plan |
| Default / persistence | Content default, no cross-lesson persistence | Simplest, predictable; Content is primary | Plan |
| Video gating | Decoupled — gate only on autodescription presence | One simple condition; operator decides per lesson | Plan |
| Deploy | Local migration + types + seed, then gated prod `db push` | Additive nullable column is prod-safe | Plan |
| Seed | One seeded lesson populated, rest NULL | Exercises both tabs-present and tabs-absent paths | Plan |

## Scope

**In scope:** nullable `autodescription_md` column + migration; regenerate `database.types.ts`; one seed row; `LessonContentTabs.astro` (tab strip + two `set:html` panels + toggle script); lesson-page wiring; prod `db push`.

**Out of scope:** operator authoring UI; React island / `dangerouslySetInnerHTML`; tab persistence; sanitizer changes; query changes; autodescription anywhere but the lesson page.

## Architecture / Approach

Additive data change (`alter table … add column autodescription_md text;`) → types regen → one seed row. The lesson page renders both `content_md` and `autodescription_md` to trusted HTML; when the summary exists it passes both into `LessonContentTabs.astro`, which renders two `role="tabpanel"` `<article>` blocks and a `role="tablist"` of two `<button>`s, toggled by a small scoped `<script>` (visibility + `aria-selected`). Otherwise the existing single article renders unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data | Nullable column + regenerated types + one seed row | Types regen step is manual (no npm script) |
| 2. UI | `LessonContentTabs.astro` + lesson-page wiring | Matching aside styling + a11y of the toggle script |
| 3. Deploy | Additive column pushed to prod + smoke check | Prod DB action (gated; additive/nullable = safe) |

**Prerequisites:** local Supabase running for `db reset` + type regen; linked prod project for `db push`.
**Estimated effort:** ~1–2 sessions; Phase 2 is the bulk.

## Open Risks & Assumptions

- Type regen is a manual command (no package script) — must run it after the migration or types lag.
- Astro + inline-script tabs is a deliberate exception to "interactivity → React," justified by keeping trusted SSR HTML out of `dangerouslySetInnerHTML`.
- Prod lessons get autodescriptions only when an operator authors them via Studio after the push.

## Success Criteria (Summary)

- Seeded lesson shows working, accessible Content/Autodescription tabs matching the aside, in both themes; un-seeded lessons render unchanged.
- Column exists locally and in prod; build/check/lint green.
- No regression to existing lesson rendering or the markdown trust boundary.
