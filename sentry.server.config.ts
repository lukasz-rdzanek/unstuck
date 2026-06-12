import * as Sentry from "@sentry/cloudflare";
import handler from "@astrojs/cloudflare/entrypoints/server";

// Custom Worker entry point (m3l5 monitoring). Wraps the Astro Cloudflare handler
// with Sentry so production errors surface as issues instead of vanishing — in
// particular the best-effort `console.warn`/`console.error` sites we deliberately
// DON'T turn into 500s (e.g. submit's secondary requiz enrolment). The lesson's
// point: a swallowed-but-logged error is invisible until monitoring captures it.
// `captureConsoleIntegration` forwards warn+error console calls to Sentry as
// events — exactly that mechanism.
//
// No-op when SENTRY_DSN is unset (Sentry initializes in disabled mode on an
// empty/undefined DSN), so local dev and any DSN-less environment run unchanged.
// Production gets the DSN as a Cloudflare secret: `wrangler secret put SENTRY_DSN`
// (or via the dashboard). Errors-only, PII off — sensible + free-plan-friendly.
export default Sentry.withSentry(
  (env: { SENTRY_DSN?: string }) => ({
    dsn: env.SENTRY_DSN,
    integrations: [Sentry.captureConsoleIntegration({ levels: ["warn", "error"] })],
    sendDefaultPii: false,
    tracesSampleRate: 0,
  }),
  handler,
);
