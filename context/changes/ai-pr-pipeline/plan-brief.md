# AI-Assisted PR Pipeline — Plan Brief

> Full plan: `context/changes/ai-pr-pipeline/plan.md`
> Context: `context/foundation/certification.md` (Champion gap #3)

## What & Why

Document a self-enforced **PR-based workflow with an AI review gate** (`/code-review ultra`) — the last 10xChampion piece (team workflow / AI-in-pipeline). Add a PR template + `CONTRIBUTING.md`, close `certification.md`.

## Starting Point

Commits go straight to `master`; CI already runs on PRs and CD deploys on master-merge — so the pipeline is PR-aware, just undocumented. No PR template / CONTRIBUTING / CODEOWNERS exist. Branch protection is unavailable (private repo on the free plan → GitHub 403).

## Desired End State

A written flow — branch → PR → green CI → `/code-review ultra` + triage → merge → auto-deploy — captured in a PR template (quality checklist) and `CONTRIBUTING.md`, with `certification.md` showing all three Champion pieces addressed (enforcement document-only for now).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Enforcement | Document-only (self-enforced) | Private-free repo can't enforce branch protection; CI already runs on PRs; legit Champion evidence | Plan |
| AI gate | Documented `/code-review ultra` + PR-template checkbox | Course-blessed AI review, no API key/cost; agent can't launch it (user-triggered) | Plan |
| PR template | Full checklist | Encodes CI/AI-review/tests/migrations/leak-check; strong artifact | Plan |
| "How we work" doc | Add CONTRIBUTING.md | Canonical, discoverable team-workflow doc | Plan |
| CODEOWNERS | Skip | Solo — no-op, would block solo merges under enforcement | Plan |

## Scope

**In scope:** `.github/pull_request_template.md` (full checklist); `CONTRIBUTING.md` (PR-flow + AI-gate + CI/CD + branch-protection note); `certification.md` closeout.

**Out of scope:** enforced branch protection; automated LLM-review CI step; CODEOWNERS; `ci.yml` changes (already PR-aware); flipping repo visibility; mandatory dogfooding.

## Architecture / Approach

Pure docs/scaffolding. The pipeline is already wired (CI on PRs, CD guarded to master-push); this change writes the workflow + AI-gate down and provides the PR template. Enforcement is a one-liner (`gh api`) to enable later if the repo goes public/Pro.

## Phases at a Glance

| Phase | Delivers | Key risk |
| --- | --- | --- |
| 1. PR docs + template + cert | PR template, CONTRIBUTING.md, certification.md closeout | Docs drifting from the real pipeline — keep them accurate |

**Prerequisites:** none (CI/CD already shipped via testing-baseline + auto-deploy).
**Estimated effort:** ~1 short session, 1 phase (docs-only).

## Open Risks & Assumptions

- Document-only enforcement relies on discipline; real branch protection needs the repo public or GitHub Pro.
- The AI gate (`/code-review ultra`) is human-run per PR (agent can't trigger it).
- Optional dogfooding (route a real PR through the flow + `/code-review ultra`) would add live evidence but isn't required by this change.

## Success Criteria (Summary)

- PR template + CONTRIBUTING exist and accurately describe the pipeline (CI-on-PR, CD-on-merge, `/code-review ultra` gate, manual migrations, leak-check).
- certification.md shows Champion 3/3 addressed (document-only caveat clear).
- CI stays green.
