---
starter_id: 10x-astro-starter
package_manager: npm
project_name: unstuck
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo learner shipping Unstuck — a lesson-scoped peer-chat web app — on a 3-week after-hours budget. Standard path: the 10x Astro Starter is the recommended default for (web-app, JS) and clears all four agent-friendly gates (typed, convention-based, popular in training data, well documented). It ships with auth (covering FR-001/FR-002), Postgres for chat persistence, and Supabase Realtime for the <2s message-visibility non-functional requirement — three otherwise-heavy pieces the user would have to assemble. Cloudflare Pages is the starter's default deploy and the cheapest path at MVP scale (dozens to ~100 users). Auth and realtime feature flags are set; payments and AI are out of scope per PRD Non-Goals (both deferred to v2). CI runs on GitHub Actions with auto-deploy-on-merge — what the starter ships with. Bootstrapper confidence is first-class, meaning the starter is registered with a valid CLI but not yet battle-tested end-to-end through /10x-bootstrapper — expect mostly-smooth scaffolding with occasional manual steps; budget one extra evening for friction.
