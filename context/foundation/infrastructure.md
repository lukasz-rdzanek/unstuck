---
project: unstuck
researched_at: 2026-05-27
recommended_platform: cloudflare-workers-pages
runner_up: fly-io
context_type: mvp
tech_stack:
  language: typescript
  framework: astro-6
  runtime: cloudflare-workerd (production) / node-22 (development)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

The 10x-astro-starter the project bootstrapped from already ships `@astrojs/cloudflare` v13.5.0; the production runtime is `workerd` end-to-end (dev, preview, prod) which removes the dev/prod parity class of bugs. At MVP scale (dozens to ~100 users, low QPS, persistent connections delegated to Supabase Realtime), the Workers free tier covers usage at $0/month while delivering true global edge for the user experience. Cloudflare scored 5/5 on the agent-friendly criteria — `wrangler` is operationally complete, `llms.txt` and per-product `llms-full.txt` make docs agent-readable, and multiple GA MCP servers (Observability, Docs, Workers Bindings, Code Mode) provide structured tool-use over platform primitives.

## Platform Comparison

Hard filter applied: Q1 = persistent connections required. Vercel and Netlify dropped (Functions are short-lived; neither supports native WebSockets — both delegate to external services such as Supabase Realtime). The matrix below covers the four candidates that survived the filter.

| Platform | CLI-first | Managed | Docs | Deploy API | MCP / Integration | Score |
| --- | --- | --- | --- | --- | --- | --- |
| **Cloudflare Workers + Pages** | Pass | Pass | Pass | Pass | Pass | **5 / 5** |
| **Fly.io** | Pass | Pass | Partial | Pass | Partial | **3 / 5 + 2 partial** |
| **Railway** | Pass | Pass | Pass | Pass | Pass | **5 / 5** |
| **Render** | Pass | Pass | Pass | Pass | Pass | **5 / 5** |

Render is excluded from the shortlist below despite a 5/5 criteria score because Q4 (global edge) is a load-bearing soft weight for Unstuck — Render web services deploy to a single region per service across only five zones (Oregon, Ohio, Virginia, Frankfurt, Singapore) with no multi-region routing.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

The fit comes from three places: the starter's adapter is already wired (zero migration cost); the free tier covers MVP scale at $0/month versus $5–7/month for the alternatives; and Cloudflare's edge runtime is the strongest global story among the candidates (200+ POPs vs Fly.io's multi-region machines or Railway's 4 regions). Documentation is the most agent-friendly of any candidate — `llms.txt` indices per product, full markdown source via `Accept: text/markdown` or `.md` suffix, and explicit "Markdown for Agents" docs. The MCP surface is the broadest: Observability MCP for live logs, Docs MCP for grounded answers, Workers Bindings MCP for resource introspection, plus the Code Mode single-server covering 2,500+ API endpoints in ~1K tokens. Persistent connections are available via Durable Objects (Workers Paid, $5/mo) but are not load-bearing for Unstuck — Supabase Realtime handles client ↔ server message push directly.

#### 2. Fly.io

Strong on every dimension where the Cloudflare model has its real weaknesses: Fly Machines run as persistent VMs with native WebSocket support and no Durable Objects pricing complexity, multi-region deployment is a `fly regions add` away, and the operating model is "container with Dockerfile" — agent-readable and stack-portable. Loses to Cloudflare on: no `llms.txt` (markdown is available on GitHub via "copy as markdown" buttons, but no convention adopted); `fly mcp server` is marked experimental and the official MCP repo (`superfly/flymcp`) has no published releases; no free tier post-July 2024 means ~$4–6/month for a shared-cpu-1x machine plus IPv4. Real fallback if Cloudflare's Pages-to-Workers-Static-Assets migration becomes blocking or if the chat workload's DO cost ceiling becomes a concern.

#### 3. Railway

Solid 5/5 on the criteria with strong DX: Railpack auto-detects Astro projects, the MCP server at `mcp.railway.com` covers projects/deploys/variables/logs/redeploy, and `llms.txt` plus `.md` suffix on every doc page make it agent-friendly. The gaps are workload-shaped, not criteria-shaped: 4 regions (US-West, US-East, EU-West, SE Asia) cover most users but are not true global, and a documented 15-minute idle-WebSocket cap requires client-side reconnect logic — manageable but adds code. Hobby plan is $5/month flat including $5 credit, so the real cost at MVP scale is ~$5. Best alternative if Fly.io's docs/MCP gaps matter more than Railway's regional gaps.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **Durable Objects pricing scales with chat volume, not request count.** WebSockets via DOs bill incoming messages at a 20:1 ratio (50k DO requests per 1M messages); duration is wall-clock unless using the Hibernation API. Free at MVP scale; at ~5k learners with active lesson chats, monthly DO costs scale faster than the simple-request mental model implies. Unstuck's MVP avoids this entirely by using Supabase Realtime for message push, but adding any Cloudflare-native presence/typing/sync feature later triggers DO billing.
2. **Pages is feature-frozen; Workers Static Assets reached parity March 2026 and is the strategic path.** `@astrojs/cloudflare` (the starter's adapter) currently targets Pages. A migration to Workers Static Assets is inevitable within ~12 months, requiring re-tested CI and possibly config changes.
3. **`nodejs_compat` compatibility flag is mandatory for the Supabase SDK and adds binary size.** Without it the Supabase SDK fails at runtime (AsyncLocalStorage requirement). The starter sets the flag in `wrangler.jsonc`, but it is easy to lose when copying handlers between projects or rewriting configs.
4. **Astro SSR routes can hit the Workers Free tier 10ms CPU-per-invocation ceiling.** Markdown-heavy lesson pages or complex chat-panel rendering may exceed 10ms and force Workers Paid ($5/mo). Easy to hit unintentionally as lesson content grows.
5. **Cloudflare Pages preview deploys are public by default.** Anyone with the URL accesses them. For an MVP with auth flows visible at preview URLs (signup form, OAuth callbacks), this is a real leak surface. Mitigation requires Cloudflare Access (Zero Trust, paid) or branch-restricted previews.

### Pre-Mortem — How This Could Fail

Six months after launch, the team is migrating off Cloudflare. The breakdown started in month 3 when lesson chats began accumulating Durable Object incoming-message bills — operator-seeded threads plus 5–10 concurrent learners per lesson pushed monthly DO costs past $15. A "who's online" presence indicator added in month 4 doubled that figure. In month 5, Cloudflare deprecated Pages support paths the starter relied on; the deploy pipeline broke and shipping froze for 3 days while the team migrated to Workers Static Assets — a migration nobody had budgeted for. The team realized too late that Unstuck's chat workload is stateful and bursty, not edge-static; most learners are in EU and NA business hours, and a single-region Node process behind a CDN would have been cheaper and simpler. The Cloudflare "edge for everything" framing matched the marketing but not the workload shape. Net outcome: the team rewrites for Fly.io in month 6, losing a sprint.

### Unknown Unknowns

- **Durable Object storage billing started 2026-01-07.** Most "Cloudflare for chat" tutorials predate this; budget assumptions from 2024–2025 sources are now wrong.
- **`@astrojs/cloudflare` v13 removed the `workerEntryPoint` field.** Older tutorials reference fields that no longer exist; copy-paste from any pre-v13 source breaks the build.
- **Any Durable Object usage requires Workers Paid ($5/mo minimum).** The "free tier covers MVP" framing breaks the moment DOs are wired. The starter avoids this by using Supabase Realtime; stay on that path unless platform-level WebSockets are genuinely required.
- **`wrangler login` is browser-interactive.** On a CI agent or headless context, set `CLOUDFLARE_API_TOKEN` (with `CLOUDFLARE_ACCOUNT_ID` for some operations). Common first-deploy stumbling block in agent-driven flows.
- **Preview deploys are public by default.** Protecting them requires Cloudflare Access or branch-restricted previews. If sign-in or OAuth callbacks render at preview URLs, audit the surface before sharing links.

## Operational Story

- **Preview deploys**: every push to a non-`main` branch builds a preview Worker / Pages deployment with a unique URL of the form `<commit-hash>.<project>.pages.dev`. Available immediately on push; no protection by default (public if URL known). Mitigation for sensitive previews: enable Cloudflare Access on the preview hostname pattern (paid Zero Trust), or restrict to specific branches in `wrangler.jsonc`.
- **Secrets**: env-var schema declared in `astro.config.mjs` via `env.schema`; runtime values stored in Workers Secrets (`wrangler secret put SUPABASE_KEY`). For local dev, `.dev.vars` (gitignored). GitHub Actions secrets configured separately for CI builds requiring deploy permissions (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Rotation: `wrangler secret put` overwrites in place; no separate rotation flow.
- **Rollback**: `wrangler versions list` shows version IDs; `wrangler rollback [VERSION_ID]` reverts traffic to the named version. Typical time-to-revert: under 30 seconds. Caveat: Supabase migrations applied between deploys do not roll back with the Worker — schema rollback is a separate Supabase concern.
- **Approval**: agent may perform unattended: `wrangler deploy` to preview, `wrangler tail`, `wrangler secret put` for non-production env vars. Human required: production deploy (publish to apex domain / canonical project), rotation of `SUPABASE_KEY` and other primary secrets, any operation that touches Supabase migrations or RLS policies. Operationalize via Plan Mode (read-only plan → human approval → execution) for any production-touching action.
- **Logs**: `wrangler tail --format pretty` for live stream; `wrangler tail --format json | jq` for structured filtering. Read-only by default. Observability MCP server (`observability.mcp.cloudflare.com/mcp`) provides agent-accessible log queries with OAuth 2.1 — preferred for agent workflows over CLI parsing.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Pages → Workers Static Assets migration becomes blocking | Devil's advocate #2; Pre-mortem | M | M | Track `@astrojs/cloudflare` upstream releases; plan a v2 deploy track on Workers Static Assets within 6 months. Test in a branch before committing. |
| Durable Object costs grow if platform-level WebSockets are added later | Devil's advocate #1; Pre-mortem; Unknown unknown #3 | L (MVP) / M (v2) | M | Keep Supabase Realtime as the message-push path. Do NOT migrate chat to DOs without a written cost projection at expected scale. |
| `nodejs_compat` flag accidentally removed during config refactor | Devil's advocate #3 | L | H | Lock the flag's presence as a Vitest / smoke-test assertion. Document in `AGENTS.md` (already present). |
| SSR route exceeds 10ms CPU ceiling on Workers Free | Devil's advocate #4 | M | L | Monitor wrangler tail for `CPU time exceeded` errors. Acceptable to upgrade to Workers Paid ($5/mo) when triggered — not a project-killer. |
| Preview deploys publicly expose auth surface | Devil's advocate #5; Unknown unknown #5 | M | M | For previews containing sign-in or OAuth callbacks, either enable Cloudflare Access on `*.pages.dev` (Zero Trust, paid) or restrict preview builds to specific branches in `wrangler.jsonc`. Audit any preview URL shared externally. |
| `wrangler login` interactive flow breaks CI / agent-driven deploys | Unknown unknown #4 | M | L | Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets and as local environment variables for agent workflows. Document in `AGENTS.md`. |
| Pricing assumptions in older tutorials no longer apply (DO storage billing started 2026-01-07) | Unknown unknown #1 | L | M | When estimating cost projections at scale, verify against `developers.cloudflare.com/durable-objects/platform/pricing/` published current date, not third-party tutorials. |
| `@astrojs/cloudflare` v13 removed config fields older tutorials reference | Unknown unknown #2 | M | L | When copying patterns from external sources, verify they reference `@astrojs/cloudflare` ≥13. The bootstrapped starter is already on v13.5.0. |
| Fly.io `auto_stop_machines` would have killed WebSockets (informational — runner-up risk) | Research finding | N/A | N/A | Not applicable to Cloudflare. Documented here so it carries forward if a future swap to Fly.io is considered. |

## Getting Started

These steps are version-validated against the starter's pinned versions (`@astrojs/cloudflare` v13.5.0; `astro` 6.3.1; `wrangler` 4.90.0 per the post-scaffold install). Verify before running.

1. **Install wrangler globally** (optional but useful for one-off commands): `npm install -g wrangler@latest`. The starter ships `wrangler` as a devDependency, so `npx wrangler …` also works without a global install.
2. **Authenticate**: `wrangler login` opens a browser. For headless/agent contexts, generate an API token at `https://dash.cloudflare.com/profile/api-tokens` with the "Edit Cloudflare Workers" template and set `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID` for some operations) in `.dev.vars`, GitHub Secrets, and your local shell.
3. **Set production secrets**: `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_KEY`. Confirm `nodejs_compat` is in the `compatibility_flags` array in `wrangler.jsonc` (the starter sets this; verify it survived any local edits).
4. **First deploy**: `npm run build && npx wrangler deploy`. The starter's `npm run build` invokes the Astro build via the Cloudflare adapter; `wrangler deploy` reads `wrangler.jsonc` and publishes to the project's `<name>.pages.dev` hostname.
5. **Tail logs** for the first request: `npx wrangler tail --format pretty` from another terminal, then hit the deployed URL. Confirm the request lands and the Supabase SSR client initializes.

Do not run `wrangler init` — the starter already configured `wrangler.jsonc`. Do not separately invoke `astro dev` for Cloudflare runtime fidelity — the starter's `npm run dev` uses the Cloudflare adapter's workerd-based dev server (matches production behavior). The historical pattern of running `wrangler pages dev` against the build output is legacy for this stack.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration (not used by Cloudflare Workers).
- CI/CD pipeline setup beyond the starter's existing `.github/workflows/ci.yml` (lint + build).
- Production-scale architecture: multi-region database replicas, dedicated support tiers, multi-region failover, disaster-recovery rehearsals.
- Payment gateway selection (paywall is deferred to v2 per `prd.md` Non-Goals).
- Observability beyond `wrangler tail` and the Observability MCP server (no APM / RUM / structured-error-aggregation tooling evaluated).
