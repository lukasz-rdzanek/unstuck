# Exploring Unstuck with the Playwright CLI (m3l4)

`@playwright/cli` is the token-cheap way for an agent to drive the app: shell
commands + accessibility snapshots on disk (~27K tokens/scenario) instead of the
MCP's 30+ in-context tools (~114K). The agent navigates the **accessibility tree**
(roles/names/states with element refs), not pixels — which is exactly why it
naturally produces `getByRole` tests. This is the recorded exploration that backs
the e2e specs in this folder.

## Prereqs

```bash
npm install -g @playwright/cli@latest
npx supabase start          # local stack (seed.sql data, diagtest account)
npm run dev                 # app at http://localhost:4321
```

## Session (verified 2026-06-11, headless)

```bash
# 1. Open + snapshot — the a11y tree lands in .playwright-cli/page-*.yml
playwright-cli open http://localhost:4321/auth/signin
#   textbox "Email"    [ref=e18]
#   textbox "Password" [ref=e26]
#   button  "Sign in"  [ref=e31]

# 2. Drive by ref. The CLI prints the Playwright code it ran — note it resolves
#    refs to ROLE-BASED locators, the pattern our seed + rules enforce:
playwright-cli fill  e18 "diagtest@local.dev"
#   → await page.getByRole('textbox', { name: 'Email' }).fill('diagtest@local.dev');
playwright-cli fill  e26 "password123"
#   → await page.getByRole('textbox', { name: 'Password' }).fill('password123');
playwright-cli click e31
#   → Page URL: http://localhost:4321/        (signed in, server redirect)

# 3. Navigate to a protected lesson (reachable now that we're authed) + snapshot:
playwright-cli goto "http://localhost:4321/courses/react-architecture-deep-dive/lessons/server-components-streaming"
playwright-cli snapshot
#   button "Completed" [pressed] [ref=e54]   ← the MarkCompleteButton island

playwright-cli close
```

## What this demonstrates (and why it shaped the specs)

- **Role/name navigation → `getByRole` specs.** The CLI surfaces elements by role
  and accessible name, so the generated tests use `getByRole('button', { name:
'Mark as complete' })`, not brittle CSS — see `seed.spec.ts`.
- **Auth is a gate, not a per-test cost.** Logging in once here mirrors why the
  suite uses `storageState` (`auth.setup.ts`) instead of the login UI per test.
- **The protected lesson is only reachable when authed** — the same boundary
  `auth-gating.spec.ts` (R7) asserts from the anonymous side.

Snapshots/logs are written under `.playwright-cli/` (gitignored). Use
`playwright-cli -s=<name> ...` for parallel named sessions; `playwright-cli show`
opens a live dashboard of active sessions.
