---
change_id: lesson-video-player
title: Rich custom video player controls for the lesson page
status: impl_reviewed
created: 2026-06-05
updated: 2026-06-05
archived_at: null
---

## Notes

UNS-19 — Rich custom video player controls. Replace the bare YouTube/Vimeo iframe embed on the lesson page with a unified player exposing play/pause, volume, a settings cog (quality + playback speed), CC toggle, fullscreen, and an Expand button that auto-collapses the right lesson aside to maximize the stage. Likely wrap the YouTube iframe API (and Vimeo Player SDK) or migrate to a self-hostable player like Plyr/Vidstack. Wire Expand to the existing aside-collapse mechanism (data-aside-collapsed). High-impact for the "lean back and learn" mode.
