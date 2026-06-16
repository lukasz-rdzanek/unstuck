# AI artifact distribution — model choice (M5L4)

> The M5L4 practical artifact: apply the lesson's decision table to Unstuck and pick a
> distribution model **before** building. The implementation lives in
> [`tools/ai-toolkit/`](../../tools/ai-toolkit/).

## Task 1 — the decision (first row decides: who is the consumer?)

**Consumer:** Unstuck is a **solo project hosted on GitHub** (`lukasz-rdzanek/unstuck`).
The "team" is the developer + AI agents + any future contributor — all already on GitHub,
single stack, no external/gated audience, no AWS.

**Chosen model: Model 1 — GitHub Packages.** The registry already exists (it's GitHub);
"standing up infrastructure" is one `publishConfig` field; publishing uses the ephemeral
`GITHUB_TOKEN` (free, `packages: write`), no long-lived secret.

| Decision row        | Unstuck                                                               |
| ------------------- | --------------------------------------------------------------------- |
| Audience            | solo/team already on GitHub → **Model 1**                             |
| Auth (publish)      | ephemeral `GITHUB_TOKEN` in CI                                        |
| Auth (read)         | org/repo membership; `read:packages` token only for external CI       |
| Permissions         | GitHub repo/org membership                                            |
| Revoke access       | remove from repo/org                                                  |
| Time-gated release  | not needed                                                            |
| Multi-tool delivery | installer (`.claude/skills`; portable `SKILL.md` covers Cursor/Codex) |
| Cost                | ~zero (private package within plan; `GITHUB_TOKEN` pulls are free)    |

**Why not the heavier models (avoiding the "distribution for the CV" trap):**

- **Model 2 (AWS CodeArtifact + Terraform)** — deliberate choice only for an AWS org or
  one needing registry-level governance GitHub can't give. Unstuck isn't on AWS → no.
- **Model 3 (API + CLI)** — for multi-stack or gated _external_ audiences (like 10xDevs'
  own `10x-cli`). Unstuck has one internal consumer on one stack → overkill.

Choosing a heavier model here would be building infrastructure the audience doesn't need.

## What we ship (Model 1)

A single npm package, `@lukasz-rdzanek/unstuck-ai-toolkit`, published to GitHub Packages:

- `skills/code-review/` — the portable FS-2 code-review skill (ties to M5L2/L3).
- `rules/CLAUDE.md` — the team's load-bearing conventions, injected between sentinel
  markers so a consumer's own edits survive updates.
- `install.js` / `uninstall.js` — idempotent installer + manifest-driven clean removal.
- `.github/workflows/publish-ai-toolkit.yml` — CI publishes on merge when the toolkit
  changes (version-guarded against 409).

## Cross-model invariants applied

- **Sentinel markers** (`<!-- BEGIN/END … -->`) for in-place rule updates.
- **Manifest** (`.claude/.unstuck-ai-toolkit-manifest.json`) for reliable uninstall.
- **`SKILL.md` portability** — same artifact, tool-specific target dir only.
- **Sentinel-injection guard** — installer refuses rules content that itself carries markers.

This is **10xChampion proof project #2** (the alternative to the M5L2/L3 review pipeline,
which is already live). Evidence: this repo (source of truth) + the package definition +
the published version list on GitHub Packages.
