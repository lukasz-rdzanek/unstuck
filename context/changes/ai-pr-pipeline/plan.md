# AI-Assisted PR Pipeline Implementation Plan

## Overview

Establish a documented, self-enforced **PR-based workflow with an AI review gate** (`/code-review ultra`) — the final 10xChampion piece (team workflow / AI-in-pipeline). Add a PR template (full quality checklist) and a `CONTRIBUTING.md` describing the flow (branch → PR → green CI → AI review → merge → auto-deploy), then close `certification.md`. Branch protection is **not** enforced (the repo is private on the free plan, where GitHub disables it) — the flow is document-only, with a note to enable enforcement if the repo goes public. CODEOWNERS is skipped (solo).

## Current State Analysis

- **Workflow today**: commits go straight to `master`; each push runs CI (lint+test+build) and the CD `deploy` job.
- **CI already supports PRs**: `.github/workflows/ci.yml` has `on: pull_request` (CI runs on PRs) and the `deploy` job is guarded to `push` + `master` only (PRs don't deploy) — so the pipeline is already PR-aware; what's missing is the *workflow + AI-gate documentation* and the PR scaffolding.
- **Branch protection unavailable**: `gh api …/branches/master/protection` → 403 "Upgrade to GitHub Pro or make this repository public to enable this feature." So required-checks / required-PR cannot be enforced on the current private-free repo.
- **No PR-flow files exist**: no `.github/pull_request_template.md`, no `CONTRIBUTING.md`, no `CODEOWNERS`.
- **AI review tool**: `/code-review ultra` is the course's multi-agent cloud review — **user-triggered and billed**; the agent cannot launch it. It is documented as the human-run AI gate.

### Key Discoveries:

- The pipeline is already PR-aware (`ci.yml` `on: pull_request` + deploy guard) — this change is documentation + scaffolding, not workflow rewiring.
- Enforcement is blocked by the private-free plan → document-only is the pragmatic path; enabling real branch protection is a one-liner (`gh api`) the day the repo is public/Pro.

## Desired End State

A contributor (or the solo owner) follows a written flow: branch → open PR → CI runs (lint+test+build) → run `/code-review ultra` on the PR + triage findings → merge → CD auto-deploys. The PR template encodes the quality checklist; `CONTRIBUTING.md` is the canonical "how we work" doc; `certification.md` shows all three Champion pieces addressed. Verify: the three docs exist + read accurately; CI stays green; the certification Champion section reflects the AI-PR-pipeline as done (document-only).

## What We're NOT Doing

- **No enforced branch protection** (private-free repo blocks it) — document-only; revisit if the repo goes public/Pro.
- **No automated LLM-review CI step** — the AI gate is the human-run `/code-review ultra` (no API key/cost added). Automating it is a possible future follow-up.
- **No CODEOWNERS** (solo project — self-ownership is a no-op and would block solo merges under enforcement).
- **No change to `ci.yml`** — it already runs on PRs and guards deploy to master-push.
- **No repo visibility change** — staying private is the user's call; this change doesn't flip it.
- **No mandatory dogfooding** — routing this change through a real PR is an optional extra-evidence step the user can do (agent opens the PR via `gh`; user runs `/code-review ultra`).

## Implementation Approach

Three documentation artifacts, committed normally. The PR template + CONTRIBUTING describe the flow for future changes; certification.md records the Champion piece as addressed (document-only). Because CI already handles PRs and CD already guards on master-push, no workflow code changes are needed.

## Phase 1: PR pipeline docs + template + cert closeout

### Overview

Add the PR template + CONTRIBUTING.md, update certification.md.

### Changes Required:

#### 1. PR template

**File**: `.github/pull_request_template.md`

**Intent**: Encode the quality checklist every PR should satisfy.

**Contract**: a markdown template with a Summary section + a checklist: CI green (lint+test+build); `/code-review ultra` run + findings triaged; tests added/updated if behavior changed; DB migration run manually before merge if the change includes one; no secrets/localhost refs in the diff (leak-check awareness); change-folder / docs updated if applicable.

#### 2. CONTRIBUTING guide

**File**: `CONTRIBUTING.md`

**Intent**: The canonical "how we work" doc — the Champion team-workflow evidence.

**Contract**: sections for — Workflow (branch → PR → green CI → `/code-review ultra` + triage → merge → auto-deploy); the CI/CD pipeline (lint+test+build gate, CD on merge to master, leak-check, manual migrations pre-merge); the AI review gate (what `/code-review ultra` is, that it's run per PR, how findings are triaged); branch-protection note (document-only today because the repo is private-free; enable required-checks + required-PR via `gh api` if the repo goes public/Pro); link to `context/foundation/certification.md`.

#### 3. Certification closeout

**File**: `context/foundation/certification.md`

**Intent**: Mark Champion gap #3 (AI-PR-pipeline) addressed; reflect all three Champion pieces done (document-only enforcement caveat).

**Contract**: update the Champion section (gap #3 → done, document-only), the TL;DR Champion row, the "Path to Champion" step 4 → done, and the bottom line (all three Champion pieces addressed; enforcement is document-only pending public/Pro).

### Success Criteria:

#### Automated Verification:

- The three files exist: `.github/pull_request_template.md`, `CONTRIBUTING.md`, `context/foundation/certification.md` (updated).
- CI stays green on the push (lint + test + build) and CD redeploys (docs-only change).

#### Manual Verification:

- PR template + CONTRIBUTING accurately describe the actual pipeline (CI-on-PR, CD-on-merge, `/code-review ultra` gate, manual migrations, leak-check); no inaccuracies.
- certification.md Champion section reads correctly (3/3 pieces addressed; document-only enforcement caveat clear).

---

## Testing Strategy

### Manual Testing Steps:
1. Read the PR template + CONTRIBUTING — confirm the flow matches reality (CI on PRs, deploy on master-merge, `/code-review ultra` gate, manual migrations, leak-check).
2. Confirm certification.md reflects Champion 3/3 (document-only) accurately.
3. (Optional dogfooding) route a later change through a real PR + run `/code-review ultra` to produce live evidence.

## References

- Champion path + gaps: `context/foundation/certification.md`
- Pipeline: `.github/workflows/ci.yml` (CI on PRs + CD on master-push)
- `/code-review ultra`: the course's multi-agent cloud review (user-triggered, billed)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PR pipeline docs + template + cert closeout

#### Automated

- [x] 1.1 Three files present: PR template, CONTRIBUTING.md, certification.md (updated) — efb3e2b
- [x] 1.2 CI green on push (lint+test+build) and CD redeploys — efb3e2b

#### Manual

- [x] 1.3 PR template + CONTRIBUTING accurately describe the pipeline (CI-on-PR, CD-on-merge, /code-review ultra gate, manual migrations, leak-check) — efb3e2b
- [x] 1.4 certification.md Champion section reads correctly (3/3 addressed; document-only caveat clear) — efb3e2b
