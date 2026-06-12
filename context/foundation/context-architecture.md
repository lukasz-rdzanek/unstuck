# Context Architecture

How this project structures the context AI agents read. The decision and the
signals that would change it. (M4L1 — scaling context for AI.)

## Decision: stay on rung 1

This project sits on **rung 1 of the maturity ladder** and stays there until a
real signal forces an escalation:

> **One root `CLAUDE.md` + `AGENTS.md`, one centralized `context/`.**

That is the right shape for an MVP-scale app with a handful of low-coupling
areas. Adding per-module `AGENTS.md` or per-module `context/` now would be
paying for structure that returns nothing — the premature-structure trap the
lesson warns against.

## What lives where

- **Conventions** (how we work, not derivable from the code) — root
  `AGENTS.md` (project rules) + `CLAUDE.md` (lean pointer + lesson sentinel).
- **References** (PRD, roadmap, research, decisions, plans) — `context/`:
  - `context/foundation/` — durable cross-change docs (prd, roadmap,
    tech-stack, test-plan, infrastructure, this file).
  - `context/changes/<id>/` — a single change with its plan and research.
  - `context/archive/` — completed changes, kept out of the working set.
  - `context/deployment/` — deploy plan.
- **Procedures** (repeatable steps) — `.claude/skills/` and `.claude/prompts/`.

The root is a **table of contents, not an encyclopedia**: it holds what is
needed every session (load-bearing conventions, key commands, pointers) and
defers everything else to `context/`, read just-in-time.

## Escalation signals — when to add structure

Climb the ladder only on a signal, one module at a time — never on a folder
count or a feeling that "the app is big":

1. **Per-module `AGENTS.md`** (rung 2) when the root would otherwise grow past
   ~200–300 lines, **or** an agent repeatedly loses one module's context and
   keeps making the same mistake despite root rules. The child file opens with
   "see root AGENTS.md for project conventions" and adds only local nuance — it
   never copies the root. The root then carries an index of child files.
2. **Per-module `context/`** (rung 3) when a module needs its own PRD/roadmap
   that no longer fits the central `context/`, **or** the module gets a
   dedicated owner/team or its own deploy — a real ownership boundary.

Current status: **no signal present.** Roots are ~25 and ~30 non-blank lines.

## Maintenance

- Re-run `/10x-rule-review` on the roots roughly monthly, paired with a critical
  read; cut any rule not tied to a recurring agent failure mode.
- Keep fast-changing facts out of the slow-changing roots. The per-lesson
  sentinel in `CLAUDE.md` is managed by `@przeprogramowani/10x-cli` — refresh it
  with `10x-cli get <lesson>` rather than letting it rot.
- When agent behavior shifts after a context-shape change, attribute it to one
  edit at a time (reorder, then split, then dedupe) — don't bundle.

## Multi-repo note (not applicable yet)

Everything above is single-repo. This project is one repo, so cross-repo
context distribution (shared package / CLI / MCP server) is out of scope.
Revisit only if the codebase splits into multiple repositories.
