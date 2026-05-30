# Signup Email Confirmation Implementation Plan

## Overview

Close the signup-without-notification abuse vector by re-enabling Supabase
email confirmation, adding a rate-limited resend flow, and giving users a
clean recovery path when confirmation links expire. Lockout for unconfirmed
accounts is enforced by Supabase itself when `enable_confirmations=true` —
no app-side guards needed. Custom SMTP via Resend.com replaces the Supabase
default sender so the 2-email/hour project-wide cap doesn't block real
onboarding.

## Current State Analysis

Email confirmation was intentionally disabled during the initial Cloudflare
deploy as "lokal dev convenience" (deploy-plan.md Phase 0.3) and never
re-enabled before prod went live. Concrete state:

- `supabase/config.toml:209` — `enable_confirmations = false` locally; prod
  dashboard mirrors this (confirmed by the fact that the 3 existing prod
  users — `test@`, `prod-test@`, `lukasz.rdzanek@protonmail.com` — were
  signed up without ever clicking a confirmation link).
- `src/pages/api/auth/signup.ts:33` — already redirects to
  `/auth/confirm-email` after Supabase `signUp()` success. The redirect is
  agnostic to whether confirmation is required, so this code path needs no
  change.
- `src/pages/auth/confirm-email.astro:4-18` — already renders two states
  (`import.meta.env.DEV` → "Registration successful", otherwise →
  "Check your email"). Pleasantly half-wired for prod confirmation already.
  Missing: success vs expired-token state differentiation, and a resend
  affordance for the expired-token case.
- `src/pages/api/auth/signin.ts:44` — calls `signInWithPassword()` and
  redirects to `/auth/signin?error=<message>` on any error. After
  `enable_confirmations=true` flips on, Supabase returns a specific
  "Email not confirmed" error that this code passes through verbatim —
  user sees the raw Supabase message with no recovery affordance.
- `src/components/auth/SignInForm.tsx` — React island (`client:load`)
  receiving `serverError` as a prop. Can be extended with a countdown
  resend button when the error indicates `email_not_confirmed`.
- `src/middleware.ts` — gates `/dashboard` and `/courses/*/lessons/*` on
  `context.locals.user` presence. Since Supabase refuses to issue a
  session for an unconfirmed user (when `enable_confirmations=true`),
  middleware needs no change.
- No existing rate-limit infrastructure; `unstuck-session` KV is wired
  exclusively as Astro session store (`env.SESSION`).
- **Supabase free tier sends 2 emails/hour for the entire project** (not
  per-user — project-wide). This is the actual blocker for any meaningful
  outreach; custom SMTP is therefore non-optional, not nice-to-have.
- Existing prod users have `email_confirmed_at` populated automatically
  (Supabase auto-confirms when `enable_confirmations=false` at insert
  time). After re-enable, they continue to sign in normally — no
  migration needed.

## Desired End State

A user signing up with an email address always triggers a confirmation
email (within ~10 seconds, delivered via Resend) to that address. The
account cannot sign in until the user clicks the confirmation link. If
the link expires, the user can request a new one from
`/auth/confirm-email?error=expired`. If they try to sign in before
confirming, the signin form recognises the state and offers a
"Send confirmation again" button with a 60-second countdown after each
send (rate-limited server-side by Supabase's `max_frequency` setting,
which also forms the project-wide deliverability ceiling). All three
existing prod users (`test@`, `prod-test@`, operator) continue to sign in
normally — they are already confirmed at the DB level. Custom SMTP via
Resend means the per-project sending cap rises from 2/hour to 100/day on
the free tier, sufficient for the 10xDevs MVP outreach scale.

### Key Discoveries:

- Supabase's `signUp()` for an already-existing-but-unconfirmed email
  silently re-sends the confirmation email and returns success, without
  revealing the account exists (anti-enumeration). We adopt this default
  unchanged — re-signup IS the resend recipe for that case
  (`@supabase/supabase-js` docs, confirmed in `src/pages/api/auth/signup.ts:27-31`).
- `confirm-email.astro` already uses `import.meta.env.DEV` to branch UI —
  the same branch logic extends naturally to URL-param states (`?error=expired`,
  `?status=success`, default = pending).
- `SignInForm.tsx` already has `serverError` prop wiring and React state
  for transient UI — adding the resend button is a localised extension,
  not a rewrite.
- `signin.ts` already builds redirects via `URLSearchParams` and preserves
  `next` via `isSafeNext()`. Adding an `unconfirmed_email` parameter
  follows the existing pattern exactly.
- `supabase/config.toml` has a commented-out `[auth.email.smtp]` block
  (lines 219-227) showing the SendGrid example. Resend's SMTP relay uses
  the same envelope — drop-in compatible.

## What We're NOT Doing

- **Password reset flow** (forgot-password) — tematycznie pasuje (też
  email-based) ale to osobna feature; planowane jako kandydat na S-04.5
  lub osobny slice. Out of scope here.
- **Email change after signup** — Supabase has `double_confirm_changes=true`
  pre-configured but there is no UI for account settings yet. Out of scope.
- **Welcome email after confirmation** — onboarding hook, kandydat na S-08
  brand polish phase. Default Supabase confirmation email body is enough
  for v1.
- **Account deletion by user** — backlog item; needs full cascade-delete
  thinking + GDPR considerations.
- **App-side enforcement of confirmed status** — Supabase already refuses
  to issue a session for unconfirmed users; middleware/RLS need no changes.
  Adding redundant checks is duplication.
- **Migration of existing prod users** — they have `email_confirmed_at`
  set; re-enabling confirmation doesn't affect them.
- **Cloudflare-native rate limiter** — Supabase's `max_frequency` is
  sufficient per-email cooldown, and Supabase additionally enforces a
  project-wide cap. Adding a second rate-limit layer is yagni.

## Implementation Approach

Three sequential phases, each independently verifiable on prod before the
next starts. Phase 1 is pure infrastructure (no application code touched)
so we can confirm the email pipeline works end-to-end before building any
UI on top of it. Phase 2 builds the resend endpoint and the unconfirmed-signin
UX in one shot, since both rely on the same `/api/auth/resend` endpoint
and the same `email_not_confirmed` error-code detection in signin. Phase 3
extends `confirm-email.astro` with explicit success / expired / pending
states, reusing the Phase 2 resend endpoint.

The plan defaults to Supabase-managed pieces wherever possible (rate-limiting,
session refusal, anti-enumeration) so the app surface stays minimal.
Custom code only appears where Supabase's API doesn't cover the UX
(countdown timer in the form, URL-param state in confirm-email.astro).

## Critical Implementation Details

- **Supabase auth error code for unconfirmed login**: Supabase returns
  an error whose `code` field is `email_not_confirmed` (and `message`
  is "Email not confirmed"). Detect on `code`, not message, because
  message text may localise; falls back to substring match on message
  only if `code` is absent. This is the trigger for showing the resend
  button on signin.
- **Resend endpoint must never reveal whether email exists**. The
  endpoint always returns `200 { ok: true }` regardless of whether
  `supabase.auth.resend()` succeeded, failed because the email isn't
  registered, or failed because the account is already confirmed.
  Server-side log the actual outcome for debugging. This preserves
  anti-enumeration that Supabase already enforces on `signUp()`.
- **Supabase cookie session persistence after confirmation**: when the
  user clicks the confirmation link from email, Supabase redirects them
  back to a configured `Site URL` with a hash fragment containing the
  session tokens. Our existing SSR cookie-based pattern (`src/lib/supabase.ts`)
  reads from cookies, not URL hash. The cleanest fix is to set the
  Site URL to `/auth/confirm-email?status=success` and let the user
  manually click "Sign in" — they enter credentials, Supabase issues a
  fresh cookie session, done. Auto-login via URL-hash exchange is a
  Phase-3 nice-to-have we explicitly defer (out of scope).
- **Shared `max_frequency` cooldown between `signUp()` and `resend()`**:
  Supabase's per-email rate limit is one cooldown window covering both
  calls. A user who signs up at T=0 and clicks resend at T=10s will hit
  `AuthApiError.code === 'over_email_send_rate_limit'` with ~50s
  remaining on the cooldown, not 60s. The `/api/auth/resend` endpoint
  must extract the actual remaining time from the Supabase error (parse
  from error context or Retry-After header — log the AuthApiError shape
  on first encounter and refine extraction) and surface it as
  `retryAfterSeconds`. Client seeds the countdown from that value, not
  a hard-coded 60. This means a 429 can arrive on the FIRST resend click
  immediately after signup — that's correct behavior, not a bug.

## Phase 1: Email infrastructure (Resend + Supabase config)

### Overview

Stand up the email pipeline end-to-end so confirmation emails actually
arrive when `signUp()` is called. No application code touched. Verifiable
by a single signup attempt that produces a real delivered email.

> **Adaptation during execution (2026-05-30)**: Custom SMTP via Resend
> was attempted but reverted to Supabase default sender. Reason: Resend
> free tier requires a verified custom domain to send to arbitrary
> recipients (the `onboarding@resend.dev` shared sender only delivers to
> the operator's own Resend account email). Without owning a domain in
> v1, custom SMTP is blocked. Falling back to Supabase default sender
> (`noreply@mail.app.supabase.io`) accepts the 2-email/hour project-wide
> cap as residual risk — sufficient for early MVP testing (~5 testers
> staggered across a day). The Resend account stays provisioned for the
> day domain verification lands. See roadmap `## Parked` for the
> "branded confirmation email + custom domain sender" follow-up.

### Changes Required:

#### 1. Resend.com account + sender setup

**File**: External (Resend dashboard)

**Intent**: Provision an SMTP relay that escapes Supabase's 2-email/hour
free-tier project cap. Resend free tier (3000/month + 100/day) is
sufficient for 10xDevs MVP scale.

**Contract**: Resend account created with the operator email. One API key
generated with "Send emails" scope. Either (a) use the default
`onboarding@resend.dev` sender for v1 (no DNS work required, deliverability
is good but the sender address is generic), or (b) verify a custom domain
later in S-08 brand polish. We pick (a) for S-04 to keep scope tight.

#### 2. Supabase prod dashboard — SMTP + confirmations config

**File**: External (Supabase dashboard, project `rhcioqeawpbuylbmkxnr`)

**Intent**: Enable email confirmation on prod and wire Resend as the SMTP
sender. This is the toggle that closes the abuse vector.

**Contract**:
- Authentication → Providers → Email: `Confirm email` = ON.
- Authentication → Emails → SMTP Settings: enable Custom SMTP, host
  `smtp.resend.com`, port `465`, user `resend`, password = Resend API
  key, sender email `onboarding@resend.dev`, sender name `Unstuck`.
- Authentication → URL Configuration: Site URL = `https://unstuck.lukasz-rdzanek.workers.dev`,
  Redirect URLs include `https://unstuck.lukasz-rdzanek.workers.dev/auth/confirm-email`.
- Authentication → Rate Limits: `Token verification rate limit` left at
  default; `Max frequency` for resend = 60 seconds.
- Authentication → Providers → Phone: VERIFY current `Confirm phone`
  setting. Per `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:470-472`,
  Supabase's `signUp()` anti-enumeration obfuscation (returning a fake
  user object for an already-CONFIRMED email) kicks in only when BOTH
  `auth.email.enable_confirmations` AND `auth.sms.enable_confirmations`
  are enabled at project level. For S-04 we accept the residual risk
  that signup with an already-confirmed email returns an explicit
  "user already exists" error (slightly leaks enum). The
  unconfirmed-re-signup case — which IS what the resend recipe depends
  on — works independently of the phone flag. Backlog note: enable
  phone-confirm flag for stronger anti-enum once an SMS provider is
  wired (post-MVP, not blocking).

#### 3. Local `supabase/config.toml` mirrors prod settings

**File**: `supabase/config.toml`

**Intent**: Keep local dev parity with prod so we don't develop against
a different rule set than what ships. Flip `enable_confirmations` and
bump `max_frequency`; SMTP block remains commented (local uses
Supabase's `[inbucket]` mock mail server which catches all emails — no
real delivery needed for dev).

**Contract**: Line 209 `enable_confirmations = false` → `true`. Line 213
`max_frequency = "1s"` → `"60s"`. SMTP block (lines 219-227) stays
commented — inbucket is the dev sink. Additionally, fix the long-standing
port mismatch on `[auth]` block: line 154
`site_url = "http://127.0.0.1:3000"` → `"http://localhost:4321"` and
line 156 `additional_redirect_urls = ["https://127.0.0.1:3000"]` →
`["http://localhost:4321/auth/confirm-email"]`. Astro dev runs on port
4321 over plain HTTP; without this fix, the local inbucket confirmation
link redirects to a dead port and the click-and-confirm round-trip is
broken even though the email arrives.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` exits 0 after config changes (no schema/config
  regression).
- `npm run lint` exits 0 (no app code changed but lint shouldn't have
  collateral failures).

#### Manual Verification:

- On prod, signup with a brand-new email at
  `https://unstuck.lukasz-rdzanek.workers.dev/auth/signup` triggers a
  real email arriving in the inbox within 30 seconds.
- Resend dashboard shows the send event in its log (sender, recipient,
  status `delivered`).
- The email's confirmation link's host is `rhcioqeawpbuylbmkxnr.supabase.co`
  and clicking it redirects back to `/auth/confirm-email` on the prod
  Worker domain with the session established.
- The 3 existing prod users (`test@`, `prod-test@`, operator) can still
  sign in (verified by signing in as operator and reaching `/dashboard`).
- Locally, `npm run dev` + signup at `http://localhost:4321/auth/signup`
  produces an email visible in the Supabase Studio inbucket inbox
  (`http://127.0.0.1:54324`), AND clicking the link in that email
  redirects back to `http://localhost:4321/auth/confirm-email` (verifies
  the port/protocol fix in Section 3 above).

---

## Phase 2: Resend endpoint + signin "unconfirmed" inline UX

### Overview

Build the resend API endpoint and the signin-form UX that surfaces it
when a user tries to sign in before confirming. Both pieces ship in one
phase because they share the error-code detection logic and the
endpoint contract.

### Changes Required:

#### 1. New POST endpoint — `src/pages/api/auth/resend.ts`

**File**: `src/pages/api/auth/resend.ts` (new)

**Intent**: Provide a single API surface the client can POST to with an
email address to request a fresh confirmation link. Anti-enumeration:
always returns success regardless of underlying outcome. Rate-limiting
is delegated entirely to Supabase's `max_frequency` — when the limit is
hit, Supabase returns an error that we translate to a `429` response so
the client countdown can react.

**Contract**:
- `export const prerender = false`. `export const POST: APIRoute`.
- Accepts form-encoded `email` body; validates with zod
  (`z.email(...)`).
- Calls `supabase.auth.resend({ type: 'signup', email })`.
- Response shape: JSON. Three cases:
  - Validation failure → `400 { error: "<zod message>" }`.
  - Supabase rate-limit error (max_frequency exceeded;
    `AuthApiError.code === 'over_email_send_rate_limit'`) →
    `429 { error: "rate_limited", retryAfterSeconds: <n> }` where `<n>`
    is parsed from the Supabase error (context field or Retry-After
    header — log the actual shape on first encounter and refine). NEVER
    hard-coded to 60; the cooldown is shared with `signUp()` per email,
    so a recent-signup user will see <60 remaining.
  - Any other Supabase outcome (success, email unknown, already
    confirmed) → `200 { ok: true }`. Log the actual outcome
    server-side for debugging; never leak via response.
- No CSRF token check (matches existing `signin.ts`/`signup.ts` posture;
  these are form-driven endpoints with same-origin policy as the gate).

#### 2. Detect `email_not_confirmed` in signin

**File**: `src/pages/api/auth/signin.ts`

**Intent**: When Supabase rejects signin because the email isn't confirmed,
preserve the email and a specific marker in the redirect URL so the
form can render the resend affordance instead of a generic error.

**Contract**: After `signInWithPassword()` error branch (line 45),
inspect `error.code` (fall back to `error.message.includes("Email not confirmed")`).
On match, build the redirect URL with `error=unconfirmed&unconfirmed_email=<email>`
(URL-encoded), preserving `next` via existing `isSafeNext()` path.
All other errors keep current behaviour (`error=<message>`).

#### 3. Extend `SignInForm.tsx` with resend countdown button

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: When the form receives `serverError === "unconfirmed"` (the
marker from signin.ts), render a contextual `[Send confirmation again]`
button below the form that POSTs to `/api/auth/resend`. The button is
gated by a 60-second visible countdown after each click; the count
starts at 60 immediately after a successful send and ticks down each
second. Pre-fill the email field from the `unconfirmed_email` URL
parameter so the user doesn't retype it.

**Contract**:
- Props extended: `unconfirmedEmail?: string | null`.
- Local state: `resendCountdown: number` (0 = enabled, >0 = disabled
  with display).
- On `serverError === "unconfirmed"`, render a `<div>` below the form
  with friendly copy ("Twój email jeszcze nie potwierdzony.") and the
  countdown-gated button.
- Button click: `fetch("/api/auth/resend", { method: "POST", body: <form
  with email> })`; on 200 → start countdown at 60, toast
  "Email wysłany ponownie"; on 429 → countdown starts at
  `retryAfterSeconds`; on 400 → inline error.
- Countdown uses `useEffect` with `setInterval(..., 1000)` cleared on
  unmount. Use `useRef` for the interval handle (React 19 + Strict Mode
  safe).
- Update `src/pages/auth/signin.astro` to read `unconfirmed_email` URL
  param and pass it as the new prop.

### Success Criteria:

#### Automated Verification:

- `npm run lint` exits 0.
- `npx astro check` exits 0 (TypeScript clean).
- `npm run build` exits 0.

#### Manual Verification:

- On local dev (with `enable_confirmations=true` mirrored from Phase 1):
  signup with a new email, then immediately try to sign in with same
  credentials → signin form shows "Twój email jeszcze nie potwierdzony"
  + `[Send confirmation again]` button, NOT a raw Supabase error.
- Click the resend button → toast "Email wysłany ponownie", button
  becomes `[Send again (60s)]` and counts down; second email visible in
  inbucket inbox.
- Within the 60s window, clicking the disabled button has no effect
  (button is `disabled` attribute, not just visually styled).
- After 60s the button re-enables; another click triggers another send.
- Resend with a typo'd email that doesn't exist → button still shows
  "Email wysłany" toast (no enumeration leak), no actual email arrives,
  server log shows the failed lookup.
- On prod (after Phase 1 deploy): same flow with a real email →
  confirmation email arrives via Resend within 30s.

---

## Phase 3: Confirm-email page states (success / expired / pending)

### Overview

Extend `confirm-email.astro` so the page renders the three real states
the user lands on, plus an inline resend form for the expired case. No
new endpoints — reuses the `/api/auth/resend` endpoint from Phase 2.

### Changes Required:

#### 1. URL-param state branching in `confirm-email.astro`

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Replace the current `import.meta.env.DEV` branch with explicit
URL-param-driven state (`?status=success`, `?error=expired`, default =
pending). Each state gets distinct UI: success shows a "Sign in"
button, expired shows the resend form, pending shows the existing
"Check your email" copy. The dev convenience copy is dropped — local
dev now mirrors prod confirmation flow.

**Contract**:
- Read `Astro.url.searchParams.get("status")` and `.get("error")` at
  the frontmatter level.
- Three branches:
  - `error === "expired"` → "Link wygasł" heading + inline form with
    `<input name="email">` and `[Send new link]` submit that posts to
    `/api/auth/resend`.
  - `status === "success"` → "Email potwierdzony" heading + green
    accent + `[Sign in]` link to `/auth/signin`.
  - Otherwise → existing "Check your email" pending copy.
- The expired-state form is plain HTML form posting to the resend
  endpoint, NOT a React island (form is one-shot; no countdown UX
  needed here — the page is already a recovery surface, not a flooding
  vector).
- After form submit, redirect back to `/auth/confirm-email?status=success`
  if the email shape was valid (per anti-enum, we can't distinguish
  whether the email actually triggered a send).

#### 2. Configure Supabase to redirect expired tokens

**File**: External (Supabase dashboard, same project as Phase 1)

**Intent**: When Supabase rejects a confirmation token as expired/invalid,
it currently redirects to the Site URL with an error in the hash
fragment. We want it to land on `/auth/confirm-email?error=expired` so
the page can render the recovery flow.

**Contract**: Authentication → URL Configuration → add
`https://unstuck.lukasz-rdzanek.workers.dev/auth/confirm-email?error=expired`
AND `https://unstuck.lukasz-rdzanek.workers.dev/auth/confirm-email?error=invalid`
to the Redirect URLs allow-list. The Site URL stays at the canonical
origin. The redirect target on token-failure is controlled by the
client-side `redirectTo` parameter in `signUp()`, which we're not
currently passing — Supabase falls back to the Site URL with error
information in the URL hash fragment (e.g.
`#error=access_denied&error_code=otp_expired&error_description=...`).
A tiny inline `<script>` on confirm-email.astro parses
`window.location.hash`, reads both `error` and `error_code` fields, and
uses `history.replaceState` to rewrite the URL to one of:
- `?error=expired` when `error_code === 'otp_expired'` (per
  `node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts:6`)
- `?error=invalid` for any other non-empty `error` value (covers
  token-mismatch, malformed, replay, etc.)
- no rewrite when hash is empty or unrelated (page stays in pending
  state)
The recovery UI MAY collapse both states into one branch with generic
copy ("Link nieaktualny lub niepoprawny — wyślij nowy") if separate UI
isn't worth the maintenance; the script still distinguishes so we have
the option without rework.

### Success Criteria:

#### Automated Verification:

- `npx astro check` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.

#### Manual Verification:

- Visit `/auth/confirm-email` directly (no params) → "Check your email"
  pending copy renders.
- Visit `/auth/confirm-email?status=success` → "Email potwierdzony"
  success copy with Sign in link.
- Visit `/auth/confirm-email?error=expired` → "Link wygasł" copy with
  inline resend form.
- Submit the resend form with a valid email → redirect to
  `/auth/confirm-email?status=success`; new email arrives in inbucket
  (local) or Resend (prod).
- On prod: simulate expired token by manually constructing a confirm
  URL with a clearly-invalid token; verify Supabase redirects with
  error-in-hash; verify the inline script normalizes to
  `?error=expired` and the page renders the recovery UI.
- After successful confirmation in prod (real flow): user lands on
  `/auth/confirm-email?status=success`, clicks Sign in, enters
  credentials, reaches `/dashboard`.

---

## Testing Strategy

### Unit Tests:

None for S-04. The existing repo carries no test suite (Module 3 of the
10xDevs curriculum introduces testing strategy; this slice predates it).
Verification is automated-check + manual-walk.

### Integration Tests:

The RLS regression probe (`supabase/tests/rls_matrix.sql`) covers
data-layer auth boundaries and is unaffected by this slice. Re-run
after Phase 1 to confirm no regression: `npx supabase db reset` exits 0.

### Manual Testing Steps:

The end-to-end happy path on prod, after all three phases:

1. Open `/auth/signup` in an incognito window.
2. Submit a brand-new real email + password.
3. Page redirects to `/auth/confirm-email` (pending state).
4. Within 30s, the email arrives (Resend dashboard shows
   `delivered`).
5. Click the link in the email → redirected to
   `/auth/confirm-email?status=success`.
6. Click "Sign in" → enter the same credentials → reach `/dashboard`.

The unhappy paths:

1. Try to sign in BEFORE clicking the email link → signin form shows
   "Twój email jeszcze nie potwierdzony" + resend button + countdown.
2. Click resend → toast "Email wysłany"; second email arrives; button
   counts down from 60.
3. Try to click resend within the countdown → button disabled, no
   request fires.
4. Wait until token expires (or fake by altering URL) → click stale
   link → land on `/auth/confirm-email?error=expired` → submit inline
   resend form → fresh email arrives → confirm → sign in.

## Performance Considerations

The added endpoints and UI are inherently low-traffic (signup is a
one-time-per-user event, and resend is a recovery action). No caching
or load-shedding work required. Resend.com free tier capacity (100/day)
significantly exceeds expected MVP signup volume.

## Migration Notes

The 3 existing prod users (`test@example.com`, `prod-test@example.com`,
`lukasz.rdzanek@protonmail.com`) all have `email_confirmed_at` populated
because they were signed up while `enable_confirmations=false` — Supabase
auto-sets the field at insert time in that mode. Flipping the toggle to
`true` only gates FUTURE signups; existing rows are unaffected. No
migration SQL needed.

Rollback: setting `enable_confirmations=false` in Supabase dashboard
reverts the gating. The app code from phases 2-3 is harmless in the
non-confirmation mode — the `email_not_confirmed` error branch and the
expired-token UI simply never trigger because Supabase doesn't emit
those signals.

## References

- Related change: `context/changes/signup-email-confirmation/change.md`
- Existing auth code: `src/pages/api/auth/{signup,signin,signout}.ts`,
  `src/pages/auth/{signup,signin,confirm-email}.astro`,
  `src/components/auth/{SignInForm,SignUpForm}.tsx`,
  `src/middleware.ts`.
- Supabase config: `supabase/config.toml:202-217`.
- Deploy plan that disabled confirmation originally:
  `context/deployment/deploy-plan.md` Phase 0.3.
- Memory pointer: `[[unstuck-production]]` (operator UUID, prod project
  ref, `.dev.vars` build gotcha).
- Resend SMTP docs: https://resend.com/docs/send-with-smtp
- Supabase confirmation docs:
  https://supabase.com/docs/guides/auth/auth-email

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Email infrastructure (Resend + Supabase config)

#### Automated

- [x] 1.1 `npx supabase db reset` exits 0 after config changes — c9d5788
- [x] 1.2 `npm run lint` exits 0 — c9d5788

#### Manual

- [x] 1.3 Prod signup with new email triggers real email within 30s — c9d5788
- [x] 1.4 Supabase default sender (`noreply@mail.app.supabase.io`) delivers email — Resend reverted per Phase 1 adaptation; verify via inbox arrival, not Resend dashboard — c9d5788
- [x] 1.5 Confirmation link host is `rhcioqeawpbuylbmkxnr.supabase.co` and lands on `/auth/confirm-email` — c9d5788
- [x] 1.6 3 existing prod users still sign in successfully — c9d5788
- [x] 1.7 Local signup produces an email in Supabase Studio inbucket inbox — c9d5788

### Phase 2: Resend endpoint + signin "unconfirmed" inline UX

#### Automated

- [x] 2.1 `npm run lint` exits 0
- [x] 2.2 `npx astro check` exits 0
- [x] 2.3 `npm run build` exits 0

#### Manual

- [x] 2.4 Local signup → immediate signin attempt shows "Your email isn't confirmed yet" yellow block + resend button, not raw Supabase error
- [x] 2.5 Resend click → "Confirmation email sent" inline message + button becomes "Send again (60s)" countdown
- [x] 2.6 Second email visible in inbucket; clicking disabled button within 60s does nothing (HTML disabled attribute)
- [x] 2.7 After 60s button re-enables; another click triggers another send
- [x] 2.8 Resend with typo'd email shows same "Confirmation email sent" (no enumeration leak); server log shows underlying failure via `[resend] supabase.auth.resend returned non-rate-limit error`
- [x] 2.9 Prod redeploy verified (Worker version `b8ca6084`); server-side render of `/auth/signin?error=unconfirmed&unconfirmed_email=...` shows the yellow box with pre-filled email (curl confirmed). **Full prod e2e lockout test deferred to Phase 3** — Proton/Gmail email scanners prefetch the Supabase magic-link verify URL before the user opens the email, auto-confirming the account; the yellow box never triggers for those providers. Phase 3 redesign to OTP code (6-digit number in email body) bypasses prefetch and enables true end-to-end lockout verification.

### Phase 3: Confirm-email page states (success / expired / pending)

#### Automated

- [ ] 3.1 `npx astro check` exits 0
- [ ] 3.2 `npm run lint` exits 0
- [ ] 3.3 `npm run build` exits 0

#### Manual

- [ ] 3.4 `/auth/confirm-email` no params → pending copy
- [ ] 3.5 `/auth/confirm-email?status=success` → success copy with Sign in link
- [ ] 3.6 `/auth/confirm-email?error=expired` → expired copy with inline resend form
- [ ] 3.7 Submit resend form with valid email → redirect to `?status=success`; fresh email arrives
- [ ] 3.8 Prod: invalid token redirects with hash fragment; inline script normalizes to `?error=expired`; recovery UI renders
- [ ] 3.9 Full end-to-end happy path on prod: signup → email → confirm → sign in → `/dashboard`
