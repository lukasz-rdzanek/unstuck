# Signup Email Confirmation — Plan Brief

> Full plan: `context/changes/signup-email-confirmation/plan.md`

## What & Why

Re-enable Supabase email confirmation on signup so accounts can't be
created on someone else's email without that owner knowing. Add a
rate-limited resend flow so users with expired or missing emails can
recover. Without this, the prod app (live since 2026-05-30) has a
standing abuse vector: any attacker can register `victim@example.com`,
no email is ever sent to the real owner, and the account works
unrestricted.

## Starting Point

Email confirmation was disabled during the initial Cloudflare deploy
(`context/deployment/deploy-plan.md` Phase 0.3, marked "lokal dev
convenience") and never re-enabled before prod went live. The signup
endpoint already redirects to `/auth/confirm-email`, and that page
already has a two-state UI (DEV vs prod copy) — half the wiring exists.
What's missing: the Supabase toggle, custom SMTP (Supabase free tier
caps at 2 emails/hour project-wide — blocks any real outreach), a resend
endpoint, the unconfirmed-signin UX, and the expired-token recovery flow.

## Desired End State

Signing up with an email always triggers a confirmation email via Resend
within ~30 seconds. The account cannot sign in until the link is clicked.
Trying to sign in before confirming shows an inline "Send confirmation
again" button with a 60-second countdown on the existing signin form
(no new page). Clicking an expired link lands on a recovery page with a
resend form. The 3 existing prod users (`test@`, `prod-test@`, operator)
continue working unchanged because Supabase auto-set their
`email_confirmed_at` at insert time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SMTP provider | Resend.com (free tier 100/day) | Supabase default 2/hr cap blocks real onboarding; Resend has modern DX and sufficient capacity. | Plan |
| Rate-limit strategy | Supabase native `max_frequency = 60s` | Zero app code, server-side enforcement, Supabase also enforces project-wide cap as second layer. | Plan |
| Unconfirmed-signin UX | Inline resend button on signin form | Single-page flow, minimal friction, reuses existing `SignInForm.tsx` React island. | Plan |
| Existing prod users | Leave as-is | They have `email_confirmed_at` populated (Supabase auto-sets when confirmations disabled); no migration needed. | Plan |
| Expired token UX | `confirm-email.astro` recovery state + inline resend form | Reuses the resend endpoint built for the signin flow; one-page recovery. | Plan |
| Resignup with existing-unconfirmed email | Supabase default (silent resend, anti-enum) | Built-in security best practice; re-signup IS the resend recipe. | Plan |
| Cooldown UX | Visible 60s countdown on button | Transparent to user; prevents repeated-click confusion. | Plan |
| Lockout enforcement | Supabase signin block only (no app-side) | When `enable_confirmations=true`, Supabase refuses to issue a session for unconfirmed users; middleware needs no change. | Plan |
| Out of scope | Password reset / email change / welcome email / account deletion | Each is its own slice; pulling any of them in doubles scope. | Plan |

## Scope

**In scope:**
- Custom SMTP via Resend on prod Supabase + matching local config
- `enable_confirmations=true` and `max_frequency=60s` on both prod and local
- New POST `/api/auth/resend` endpoint (zod validated, anti-enum response shape)
- Signin endpoint detects `email_not_confirmed` and round-trips a marker into the form
- `SignInForm.tsx` extended with countdown-gated resend button
- `confirm-email.astro` extended to render success / pending / expired states
- Inline resend form on the expired-token state

**Out of scope:**
- Password reset (forgot-password) — separate slice candidate
- Email change after signup (requires account settings page that doesn't exist yet)
- Welcome email after confirmation — candidate for S-08 brand polish
- Account deletion by user — backlog item
- Cloudflare-native rate limiter (Supabase coverage is sufficient)
- Auto-login via URL-hash exchange after confirmation (defer; user signs in manually after confirm-success)

## Architecture / Approach

```
Signup ──► supabase.auth.signUp() ──► Resend SMTP ──► user inbox
                                                       │
                                                       ▼
                                  user clicks link
                                                       │
                                                       ▼
                       /auth/confirm-email?status=success
                                                       │
                                                       ▼
                              user signs in normally

Sign-in BEFORE confirm:
  signInWithPassword() ──► error.code === 'email_not_confirmed'
                                                       │
                                                       ▼
        signin.ts: redirect ?error=unconfirmed&unconfirmed_email=...
                                                       │
                                                       ▼
        SignInForm renders [Send confirmation again] (60s countdown)
                                                       │
                                                       ▼
              POST /api/auth/resend ──► supabase.auth.resend()
                                                       │
                                                       ▼
                                       always 200 { ok:true } (anti-enum)
                                       except 429 on max_frequency hit
```

Three building blocks: (1) Supabase config + Resend SMTP (no code), (2) the
resend endpoint + signin UX wiring, (3) confirm-email page state branching.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Email infrastructure | Resend account + Supabase prod dashboard wired + local config mirror; real email arrives on signup | Resend deliverability quirks; DNS not needed for `onboarding@resend.dev` v1 sender |
| 2. Resend endpoint + signin UX | `/api/auth/resend` + signin detects unconfirmed + SignInForm renders countdown resend button | Supabase error code field naming (`email_not_confirmed` confirmed in docs but format may differ across versions) |
| 3. Confirm-email page states | `?status=success` / `?error=expired` / pending branches + inline resend form for expired case | Supabase token-expiry redirect URL format uses hash fragment; mitigated by small inline normalizer script |

**Prerequisites:**
- Production worker live with current MVP (✅ done, deployed 2026-05-30 at `417e98b8`)
- Operator access to Resend.com (sign-up required during Phase 1)
- Operator access to Supabase dashboard for project `rhcioqeawpbuylbmkxnr` (✅ confirmed)

**Estimated effort:** ~2-4 hours across 3 phases (smallest of the post-MVP slices); Phase 1 is mostly external dashboard work, Phases 2-3 are localised code changes.

## Open Risks & Assumptions

- **Resend free tier signup-side limits**: 100/day is well above expected MVP volume but if first-day outreach goes wide, this could throttle. Mitigation: monitor Resend dashboard; upgrading to paid tier is a one-click op.
- **Supabase `email_not_confirmed` error code stability**: assumed based on `@supabase/supabase-js` v2 docs. If the code field is absent or renamed, fall back to substring match on `error.message` ("Email not confirmed").
- **Token-expiry redirect format**: Supabase redirects with hash fragments; the Phase 3 normalizer script depends on `window.location.hash` containing `error=access_denied&error_description=...`. If Supabase changes that format, the expired-state UI won't trigger automatically — user would just see the pending copy after clicking a stale link.
- **Local Supabase email pipeline**: `inbucket` mail server runs as part of `supabase start`. If the operator runs `supabase status` and inbucket isn't listed, the Phase 2 local manual checks can't verify email arrival; would need to use Supabase Studio's `Authentication → Users → resend confirmation` admin action instead.

## Success Criteria (Summary)

- A signup on prod produces a real email delivered via Resend within 30 seconds.
- An unconfirmed account cannot sign in; the signin form offers a clear recovery affordance with a working 60-second countdown.
- An expired-token click recovers cleanly without the user having to re-signup.
- Existing 3 prod users continue working without any data migration.
