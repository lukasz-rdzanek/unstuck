import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { getDisplayNameOrFallback } from "@/lib/services/profiles";

const LESSON_ROUTE_RE = /^\/courses\/[^/]+\/lessons\//;

function isProtectedRoute(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
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
  // inline head script in Layout.astro.
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
