---
change_id: auto-deploy
title: Automated deploy (CD) to Cloudflare Workers on merge to master
status: impl_reviewed
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

automated deploy (CD) to Cloudflare Workers on merge to master via GitHub Actions — 10xChampion path (see context/foundation/certification.md gap #2). Fold the manual .dev.vars-aside build ritual into a CI/CD job: build with prod SUPABASE_URL/SUPABASE_KEY from secrets, leak-check (zero 127.0.0.1, prod ref present), then wrangler deploy using the existing CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets. Open design questions for planning: deploy trigger (every push to master vs tag/manual approval), whether to gate deploy on the CI lint+test+build job passing first, and whether DB migrations (supabase db push) are part of CD or stay manual (safer). The interim lesson-review and operator backfill are unrelated. This is the CD piece; the AI-assisted PR pipeline is a separate follow-on change.
