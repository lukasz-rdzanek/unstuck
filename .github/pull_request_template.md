<!--
Unstuck PR template. See CONTRIBUTING.md for the full workflow.
Merging to master auto-deploys to production (CD) — make sure the checklist holds.
-->

## Summary

<!-- What does this PR change, and why? Link the change folder if applicable:
context/changes/<change-id>/ or the archived path. -->

## Checklist

- [ ] **CI green** — lint + tests + build pass (the `ci` job).
- [ ] **AI review** — ran `/code-review ultra` on this branch/PR and triaged the findings (fixed criticals; recorded accepted/deferred ones).
- [ ] **Tests** — added/updated automated tests if behavior changed (Vitest unit and/or Playwright e2e). N/A for docs-only.
- [ ] **DB migrations** — if this PR adds a migration, I ran `supabase db push` to prod **before** merging (migrations are NOT in CD).
- [ ] **No leaks** — no secrets, no `127.0.0.1`/local refs in the diff; prod build stays prod-pointing (the deploy job's leak-check guards this).
- [ ] **Docs** — updated the change folder / `context/foundation/*` (roadmap, certification, lessons) where relevant.

## Notes

<!-- Migration ordering, rollout caveats, follow-ups, or anything a reviewer should know. -->
