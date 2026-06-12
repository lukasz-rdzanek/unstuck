# Artifact 3 — Contributors (git history)

Wide-Scan working note. Who holds context, who to ask before changing an area.
Evidence only — interpretation flows into `repo-map.md`.

## The headline: bus factor = 1

- **One human author:** `Lukasz Rdzanek` — **198 of 198 commits**.
- **AI co-authors** (filtered out as non-people, per the prompt): Claude Opus
  4.7 / 4.8 co-authored ~178 commits. Not someone to "ask".
- Per-area human author is **Lukasz for every core area** (api, lesson, chat,
  auth, services, srs, migrations, middleware). No second human anywhere.

So the classic contributor map is degenerate: there is no "ask a different
person" — knowledge is 100% concentrated. For onboarding, the real question
becomes **"where is that knowledge written down?"** — and here this repo is
unusually lucky.

## Knowledge is externalized in `context/` — use it as the contributor map

The project was built with the 10x workflow, so most decisions, edge cases and
trade-offs that would normally live in a senior dev's head are written down in
`context/archive/<change>/plan.md` (+ research/review). That is the substitute
for tribal knowledge. Map area → the change folder that explains it:

| Area / risk zone                               | Ask Lukasz, but first read                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Lesson chat (Realtime, data model, moderation) | `archive/2026-05-28-lesson-chat-data-model`, `2026-05-29-lesson-scoped-chat`, `2026-05-30-operator-message-moderation` |
| Completion / learning loop / SRS               | `2026-05-30-lesson-completion-tracking`, `2026-06-06-learning-loop`, `2026-06-06-spaced-repetition-review`             |
| AI answer matching (business logic)            | `2026-06-07-ai-answer-matching`                                                                                        |
| Auth / signup / email confirm                  | `2026-05-30-signup-email-confirmation`                                                                                 |
| RLS / access control                           | `2026-06-07-testing-access-control-rls`                                                                                |
| Deploy / CI / PR pipeline                      | `2026-06-07-auto-deploy`, `2026-06-07-ai-pr-pipeline`, `2026-06-07-testing-ci-stryker`                                 |
| Lesson page composition / tabs / nav           | `2026-05-31-lesson-tabs-reorder-and-completion-sync`, `2026-05-31-lesson-nav-panel-and-chat-collapse`                  |

Foundation docs (`context/foundation/prd.md`, `roadmap.md`, `test-plan.md`,
`tech-stack.md`, `infrastructure.md`) carry the cross-cutting "why".

## Unknowns / limits

- Single-author history means commit data cannot distinguish "owner" from
  "only person who ever touched it" — they are the same here.
- AI co-authorship means some design choices were agent-proposed; the plan docs
  (human-reviewed) are the authoritative record of intent, not the commits.
- Concentration risk is real: if Lukasz is unavailable, `context/` is the **only**
  onboarding path — keep it current (it is the contributor map).
