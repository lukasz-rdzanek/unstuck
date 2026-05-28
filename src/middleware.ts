import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

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

  if (isProtectedRoute(context.url.pathname)) {
    if (!context.locals.user) {
      const nextParam = encodeURIComponent(context.url.pathname + context.url.search);
      return context.redirect(`/auth/signin?next=${nextParam}`);
    }
  }

  return next();
});
