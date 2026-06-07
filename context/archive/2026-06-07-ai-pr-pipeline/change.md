---
change_id: ai-pr-pipeline
title: AI-assisted PR pipeline + team workflow (final 10xChampion piece)
status: archived
created: 2026-06-07
updated: 2026-06-07
archived_at: 2026-06-07T12:50:09Z
---

## Notes

the last 10xChampion piece (see context/foundation/certification.md gap #3): an AI-assisted PR pipeline + team workflow. Move from commit-straight-to-master to a PR-based flow with an AI review gate. Likely components: branch protection on master (require the CI check; merge via PR), a .github/pull_request_template.md, and an AI review gate — either an automated LLM-review step in CI (needs an API key + cost) and/or documenting /code-review ultra as the human-triggered AI gate on each PR (note: /code-review ultra is user-triggered + billed, the agent cannot launch it). Document the workflow (PR flow + AI gate) as the Champion team-pipeline evidence in certification.md (and maybe a CONTRIBUTING/AGENTS note). Open design questions for planning: branch-protection strictness (enforce on master vs document-only), AI-gate mechanism (automated CI LLM review vs documented /code-review ultra vs both), PR template scope, CODEOWNERS. This is the team-workflow/CI-pipeline piece; depends on the now-shipped CD (auto-deploy) and testing-baseline.
