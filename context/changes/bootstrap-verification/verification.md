---
bootstrapped_at: 2026-05-26T19:54:03Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: unstuck
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

# Bootstrap verification — unstuck

Run-time audit trail for the `/10x-bootstrapper` invocation that scaffolded this project.

## Hand-off

Verbatim copy from `context/foundation/tech-stack.md`:

```yaml
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
```

### Why this stack (verbatim)

Solo learner shipping Unstuck — a lesson-scoped peer-chat web app — on a 3-week after-hours budget. Standard path: the 10x Astro Starter is the recommended default for (web-app, JS) and clears all four agent-friendly gates (typed, convention-based, popular in training data, well documented). It ships with auth (covering FR-001/FR-002), Postgres for chat persistence, and Supabase Realtime for the <2s message-visibility non-functional requirement — three otherwise-heavy pieces the user would have to assemble. Cloudflare Pages is the starter's default deploy and the cheapest path at MVP scale (dozens to ~100 users). Auth and realtime feature flags are set; payments and AI are out of scope per PRD Non-Goals (both deferred to v2). CI runs on GitHub Actions with auto-deploy-on-merge — what the starter ships with. Bootstrapper confidence is first-class, meaning the starter is registered with a valid CLI but not yet battle-tested end-to-end through /10x-bootstrapper — expect mostly-smooth scaffolding with occasional manual steps; budget one extra evening for friction.

## Pre-scaffold verification

| Signal       | Value                                                              | Severity | Notes                                                          |
| ------------ | ------------------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| npm package  | not run                                                            | n/a      | `cmd_template` starts with `git clone`; no `create-*` CLI to resolve |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17T10:33:39Z | fresh    | from card.docs_url; ~9 days ago                                |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 21 top-level entries (`.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `CLAUDE.md.scaffold`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`, plus the renamed `CLAUDE.md` → `CLAUDE.md.scaffold` collision)

**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (existing user CLAUDE.md from the 10xDevs course preserved; starter's CLAUDE.md sidelined for manual merge)

**.gitignore handling**: moved silently (no `.gitignore` existed in cwd)

**.bootstrap-scaffold cleanup**: deleted

**Install warnings (informational, not blocking)**:

- Node version: starter requires Node >=22.12.0; environment is v20.20.2. `EBADENGINE` warnings printed for `astro@6.3.1`, `@astrojs/prism@4.0.1`, `@astrojs/react@5.0.4`, `@cloudflare/kv-asset-handler@0.5.0`, `miniflare@4.20260507.1`, `wrangler@4.90.0`. Install completed and packages locked, but the dev server, production builds, and Cloudflare deploys are likely to break until Node is upgraded to 22.x.
- Deprecated transitives: `@babel/plugin-proposal-private-methods@7.18.6`, `node-domexception@1.0.0`. Informational.
- 773 packages installed; 309 packages soliciting funding (no action required).

## Post-scaffold audit

**Tool**: `npm audit --json`

**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW (total 10)

**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 — i.e. 2 of 10 advisories trace to direct dependencies (`@astrojs/check`, `wrangler`, both moderate); the remaining 8 (including the 1 HIGH) are transitive.

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (transitive) — pulled in via the Cloudflare tooling chain (`wrangler` → `miniflare` → `devalue`). Action: not directly actionable until the upstream maintainer ships a patched release; monitor `npm audit` after future installs.

#### MODERATE findings

- **@astrojs/check** (direct) — via `@astrojs/language-server`. Pinned by the starter.
- **wrangler** (direct) — via `miniflare`. Pinned by the starter; required for Cloudflare deployment.
- **@astrojs/language-server** (transitive) — via `volar-service-yaml`.
- **@cloudflare/vite-plugin** (transitive) — via `miniflare`, `wrangler`, `ws`.
- **miniflare** (transitive) — via `ws`.
- **volar-service-yaml** (transitive) — via `yaml-language-server`.
- **ws** (transitive).
- **yaml** (transitive).
- **yaml-language-server** (transitive) — via `yaml`.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

The following hints were read from the hand-off frontmatter but bootstrapper takes no action on them in v1. A future skill (M1L4 — Memory Architecture) is expected to translate these into agent context (CLAUDE.md / AGENTS.md / CI workflows).

| Hint                       | Value                          |
| -------------------------- | ------------------------------ |
| bootstrapper_confidence    | first-class                    |
| quality_override           | false                          |
| path_taken                 | standard                       |
| self_check_answers         | null                           |
| team_size                  | solo                           |
| deployment_target          | cloudflare-pages               |
| ci_provider                | github-actions                 |
| ci_default_flow            | auto-deploy-on-merge           |
| has_auth                   | true                           |
| has_payments               | false                          |
| has_realtime               | true                           |
| has_ai                     | false                          |
| has_background_jobs        | false                          |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- **Upgrade Node to 22.x** before running `npm run dev`. The install completed under Node 20.20.2 but several core packages (astro, wrangler, miniflare, @astrojs/cloudflare via @astrojs/react and @astrojs/prism) require Node >=22.12.0. Recommend `nvm install 22 && nvm use 22` (and the cloned starter's `.nvmrc` already pins the right version — `cat .nvmrc` to confirm).
- **Review `CLAUDE.md.scaffold`** and decide which content to merge into your existing `CLAUDE.md`. The existing file is the 10xDevs lesson rules; the `.scaffold` sibling contains the starter's project-specific guidance (architecture conventions, common commands).
- **`git init`** to start your own repo history. The cloned upstream `.git/` was deleted before move-up; this directory currently has no git history. (`git init && git add . && git commit -m "scaffold: 10x-astro-starter via /10x-bootstrapper"` is a reasonable first commit.)
- **Address audit findings per your project's risk tolerance.** The 1 HIGH (`devalue`) is transitive and not directly actionable; the 2 direct MODERATE advisories (`@astrojs/check`, `wrangler`) are pinned by the starter. `npm audit fix` may attempt fixes but read its proposed changes before accepting.
- **Resolve the three Open Questions** from `context/foundation/prd.md` before deep implementation: auth mechanism flavor (Supabase ships email/password, magic-link, and OAuth — pick one), gated-route behavior on unauthenticated access, and a cross-device support floor (browser/OS list).
