## Project rules

@AGENTS.md — project-specific conventions, tripwires, and pointers. Critical rules (RLS, no Next.js directives, `prerender = false` for API routes) live there. Read alongside the lesson sentinel below.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 4, Lesson 1 (Scaling context)

This root is a **table of contents, not an encyclopedia.** The project is
deliberately on **rung 1** of the context-maturity ladder: one root pair
(`CLAUDE.md` and `AGENTS.md`) plus a single centralized `context/`. The
decision, the escalation signals, and the maintenance cadence live in
@context/foundation/context-architecture.md.

Hard rules while the project stays on rung 1:

- **Keep the roots lean.** Conventions → `AGENTS.md`; deep docs (PRD, roadmap,
  research, plans, decisions) → `context/`, read just-in-time. Don't grow
  either root past ~200 lines.
- **No premature nesting.** Add a per-module `AGENTS.md` or `context/` only on a
  real signal (an agent repeatedly losing a module's context, or the module
  gaining its own owner/deploy) — never "just in case".
- **Periodic hygiene.** Re-run `/10x-rule-review` ~monthly and cut any rule not
  tied to a recurring agent failure mode.

<!-- END @przeprogramowani/10x-cli -->
