---
change_id: testing-baseline
title: Testing baseline — runner + first user-perspective tests + CI test stage
status: implemented
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

establish the project's automated testing baseline (Champion path step 1, see context/foundation/certification.md). Pick a test runner — Vitest for domain logic (FSRS scheduling, quiz grading set-equality, ai-answer-matching candidate filtering) plus Playwright for one end-to-end user-perspective flow (sign in -> open lesson -> post chat OR take a test -> see score) — write the first user-perspective test(s) that satisfy the mandatory 10xBuilder "at least one test" requirement, and wire a test stage into .github/workflows/ci.yml so build + tests run automatically. Closes the single blocking gap across Builder/Architect/Champion. Automated deploy (CD) and AI-assisted PR pipeline are follow-on changes, not this one.
