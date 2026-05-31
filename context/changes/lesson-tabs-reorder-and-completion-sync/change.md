---
change_id: lesson-tabs-reorder-and-completion-sync
title: "Lesson aside reorder + course-updated indicator + completion sync (UNS-14)"
status: implemented
created: 2026-05-31
updated: 2026-05-31
archived_at: null
---

## Notes

UNS-14 four-part lesson aside upgrade: (a) swap tab order so Lessons is first + default, (b) retarget pulse signal so Chat tab pulses when on Lessons, (c) Lessons-tab attention indicator + banner when course was updated since user's last visit (needs course_views table with last_seen_at), (d) bidirectional MarkComplete ↔ LessonsNav state sync so marking complete updates the list row immediately
