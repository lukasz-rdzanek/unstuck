---
change_id: learning-loop
title: Course learning loop — summary review + A/B/C/D tests + spaced re-quizzing
status: implementing
created: 2026-06-06
updated: 2026-06-06
archived_at: null
---

## Notes

Build the course learning loop: LEARN (video/text lessons, already exists) → REVIEW (an ungraded content SUMMARY of a course or part, author-provided, shown before the test) → TEST (graded A/B/C/D quiz, single OR multiple correct answers, attachable to a chapter/part or the whole course). Spaced repetition (the existing FSRS engine from change spaced-repetition-review: srs_review_state + ts-fsrs + /api/reviews/rate) is repurposed to re-surface TEST QUESTIONS over time for long-term retention, instead of whole lessons. Author control is operator-set via data (no author UI; instructor role deferred per PRD). Author options: course with video / course with only text (already supported via lessons); a test at the end of a part or course; a review/summary part before the test. Build order: (1) Tests — defines the question/answer model; (2) Review = Summary; (3) spaced re-quizzing — repurpose the FSRS engine onto quiz questions. This supersedes the interim lesson-review UI in change spaced-repetition-review (its Phase 1-2 engine is kept and re-pointed).
