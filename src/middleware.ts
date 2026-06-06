import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { getDisplayNameOrFallback } from "@/lib/services/profiles";

const LESSON_ROUTE_RE = /^\/courses\/[^/]+\/lessons\//;
const COURSE_TEST_RE = /^\/courses\/[^/]+\/tests\//;
const COURSE_PRACTICE_RE = /^\/courses\/[^/]+\/practice\/?$/;

function isProtectedRoute(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (COURSE_TEST_RE.test(pathname)) return true;
  if (COURSE_PRACTICE_RE.test(pathname)) return true;
  if (LESSON_ROUTE_RE.test(pathname)) return true;
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  // Resolve display_name once per request and expose via locals so
  // both AppTopbar and the lesson page consume from a single source —
  // skips the duplicate profiles query that AppTopbar would otherwise
  // do per render. Skipped for unauthenticated requests (no profile to
  // resolve).
  if (supabase && context.locals.user) {
    context.locals.displayName = await getDisplayNameOrFallback(
      supabase,
      context.locals.user.id,
      context.locals.user.email ?? null,
    );
  } else {
    context.locals.displayName = null;
  }

  // Resolve the active theme from the `theme` cookie so Layout can render the
  // matching class on <html> server-side (no flash for returning visitors).
  // Default dark (brand); first-visit prefers-color-scheme is handled by the
  // inline head script in Layout.astro. Intentional asymmetry: on a cookieless
  // first visit the SSR class is dark and the head script may switch it to
  // light pre-paint (no visible flash). True SSR OS-detection would need
  // Sec-CH-Prefers-Color-Scheme client hints — out of scope; don't "fix" this
  // by trying to read the OS preference here (the server can't).
  const themeCookie = context.cookies.get("theme")?.value;
  context.locals.theme = themeCookie === "light" ? "light" : "dark";

  if (isProtectedRoute(context.url.pathname)) {
    if (!context.locals.user) {
      const nextParam = encodeURIComponent(context.url.pathname + context.url.search);
      return context.redirect(`/auth/signin?next=${nextParam}`);
    }
  }

  return next();
});
