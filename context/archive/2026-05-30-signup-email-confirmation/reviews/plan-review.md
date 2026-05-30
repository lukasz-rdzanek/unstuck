<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Signup Email Confirmation

- **Plan**: `context/changes/signup-email-confirmation/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-30
- **Verdict (pre-triage)**: REVISE
- **Verdict (post-triage)**: SOUND — all 4 findings fixed in plan
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts (pre-triage)

| Dimension              | Verdict |
|------------------------|---------|
| End-State Alignment    | PASS    |
| Lean Execution         | PASS    |
| Architectural Fitness  | PASS    |
| Blind Spots            | WARNING |
| Plan Completeness      | PASS    |

## Grounding

- 6/6 file paths exist (`supabase/config.toml`, `src/pages/api/auth/{signup,signin}.ts`, `src/pages/auth/confirm-email.astro`, `src/components/auth/SignInForm.tsx`, `src/middleware.ts`) ✓
- 4/4 symbols present (`enable_confirmations`, `max_frequency`, `[auth.email.smtp]` commented block, `serverError`/`client:load` form prop wiring) ✓
- brief↔plan consistent (3 phases, same scope, same decisions) ✓
- Sub-agent claim verification (4 Supabase claims): 2 fully CONFIRMED, 1 PARTIALLY CONFIRMED (rate-limit nuance — became F1), 1 CONFIRMED with refinement (otp_expired specificity — became F3). Evidence from `node_modules/@supabase/auth-js/dist/main/lib/{errors,error-codes}.d.ts` and `GoTrueClient.js`.

## Findings

### F1 — Shared `max_frequency` cooldown between signUp() and resend() not handled

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 / Critical Implementation Details + `/api/auth/resend.ts` contract
- **Detail**: Supabase's `max_frequency = 60s` rate-limits both `signUp()` and `resend()` per email in one shared cooldown. A user signing up at T=0 then clicking resend at T=10s hits `AuthApiError.code === 'over_email_send_rate_limit'` with ~50s remaining, but the plan hard-coded `retryAfterSeconds: 60`. UI starts countdown from 60 instead of ~50, locking the button longer than needed. Also: a 429 can arrive on the FIRST resend click immediately after signup — that's correct, not a bug, and the plan didn't acknowledge it.
- **Fix A ⭐ Recommended**: Parse Supabase's `retryAfterSeconds` from AuthApiError context and pass through `/api/auth/resend` 429 response.
  - Strength: Accurate countdown reflects real Supabase state.
  - Tradeoff: One extra line in endpoint contract.
  - Confidence: HIGH — `over_email_send_rate_limit` is in the error-codes enum.
  - Blind spot: Format of retry-after value in AuthApiError; log on first encounter to refine.
- **Fix B**: Always show 60s countdown; ignore Supabase's actual remaining time.
  - Strength: Simpler client code.
  - Tradeoff: Worse UX in signup-then-immediate-resend case.
  - Confidence: HIGH.
- **Decision**: FIXED via Fix A — added a 4th Critical Implementation Details bullet explaining the shared cooldown; updated `/api/auth/resend` contract to extract `retryAfterSeconds` from AuthApiError instead of hard-coding.

### F2 — supabase/config.toml site_url uses wrong port; breaks Phase 1 local verification 1.7

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 / Section 3 (Local `supabase/config.toml` mirror)
- **Detail**: `supabase/config.toml:154` has `site_url = "http://127.0.0.1:3000"` and `:156` has `additional_redirect_urls = ["https://127.0.0.1:3000"]`. Both wrong: Astro dev runs on port 4321 over HTTP, and the additional_redirect_urls also uses HTTPS. After Phase 1 flips `enable_confirmations=true` locally, the confirmation link in inbucket redirects to a dead port. Manual check 1.7 passes for email-arrival but the click-and-confirm round-trip is broken.
- **Fix**: Add two more line changes to Phase 1 Section 3 Contract (lines 154 and 156 → `http://localhost:4321` / `["http://localhost:4321/auth/confirm-email"]`) and extend manual check 1.7 to verify the click-and-confirm round-trip works locally.
- **Decision**: FIXED — added the two line changes to Phase 1 Section 3 Contract and extended manual check 1.7 with "AND clicking the link redirects back to http://localhost:4321/auth/confirm-email".

### F3 — Phase 3 normalizer should parse `error_code=otp_expired` not generic `error=access_denied`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 / Critical Implementation Details + Section 2
- **Detail**: Per `node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts:6`, Supabase emits `otp_expired` specifically for expired confirmation tokens, in addition to the generic `error=access_denied` bucket. The URL fragment carries both. Parsing `error_code` lets recovery UI distinguish "link expired" from "link invalid" — small UX polish, no extra work.
- **Fix**: Phase 3 Section 2 Contract: normalizer parses both `error` and `error_code` fields; maps `otp_expired` → `?error=expired`, other non-empty errors → `?error=invalid`; no rewrite when hash is empty. Recovery UI MAY collapse both into one branch with generic copy if separate UI isn't worth it; script still distinguishes.
- **Decision**: FIXED — rewrote Phase 3 Section 2 Contract with the dual-field parsing logic; added Redirect URL allow-list entries for both `?error=expired` AND `?error=invalid`.

### F4 — Phase 1 doesn't address Supabase phone-confirm flag (anti-enum nuance)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 / Section 2 (Supabase prod dashboard config)
- **Detail**: Per sub-agent verification of `GoTrueClient.js:470-472`, Supabase's `signUp()` anti-enum obfuscation (fake user object for already-CONFIRMED accounts) kicks in only when BOTH `auth.email.enable_confirmations` AND `auth.sms.enable_confirmations` are enabled. Phase 1 only enables email. Low-impact because: (a) unconfirmed re-signup case works regardless, (b) v1 has 3 confirmed users and limited attack surface, (c) attacker can already enumerate via signin error patterns.
- **Fix**: Add verification note + backlog reference to Phase 1 Section 2.
- **Decision**: FIXED — added a sub-bullet to Phase 1 Section 2 Supabase dashboard contract documenting the phone-confirm flag situation, accepting the residual risk for v1, and tagging the post-MVP backlog enhancement.

## Triage summary

| Status        | Findings                | Count |
|---------------|-------------------------|-------|
| Fixed (now)   | F1, F2, F3, F4          | 4     |
| Skipped       | —                       | 0     |
| Accepted      | —                       | 0     |
| Dismissed     | —                       | 0     |

**Verdict after fixes**: SOUND. All 4 findings landed as edits in `plan.md`. Plan is ready for `/10x-implement signup-email-confirmation phase 1`.
