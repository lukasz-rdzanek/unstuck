---
change_id: site-wide-light-theme
title: Site-wide light theme with sun/moon toggle
status: implemented
created: 2026-06-02
updated: 2026-06-03
archived_at: null
---

## Notes

Add a full-site light theme with a sun/moon topbar toggle. Define a light palette that preserves the cosmic accents (primary violet, cobalt accent) while flipping surfaces (background, card, foreground, muted, borders, scrollbar); design a light counterpart for the dark-only cosmic motifs (bg-cosmic gradient, starfield, glow orbs) on the landing + auth surfaces. Move theme control from the two hardcoded `dark` wrapper divs (Welcome.astro, AppLayout.astro) to the document root, toggle via a topbar sun/moon control, persist preference in localStorage with prefers-color-scheme fallback on first visit, and avoid FOUC with an inline pre-hydration script. Rework the ~93 hardcoded dark-only utility usages (text-white, text-blue-100/70, bg-white/5, border-white/10, etc.) across ~15 files to be theme-aware.

Scope decision (2026-06-02): **whole site including landing + auth** — the cosmic starfield/orbs/glow need a designed light counterpart, not just hidden. Parked roadmap item #137.
