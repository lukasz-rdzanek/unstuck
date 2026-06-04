---
change_id: lesson-autodescription-tabs
title: Content / Autodescription tabs under the lesson video
status: implementing
created: 2026-06-03
updated: 2026-06-03
archived_at: null
---

## Notes

Parked roadmap item / Linear UNS-20. Add an operator-authored markdown `autodescription_md` to lessons and surface it as a Content/Autodescription tab strip under the video — a text-only summary for readers who skip the playback. Tabs appear only when a summary exists; implemented as an Astro component with a tiny toggle script (keeps the trusted server-rendered HTML in Astro, no `dangerouslySetInnerHTML`).
