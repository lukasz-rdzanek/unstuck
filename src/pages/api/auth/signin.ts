import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

/**
 * Same-origin path guard for `?next=`: accepts a single leading `/` and
 * rejects `//`-prefixed values (protocol-relative URLs that would land
 * the browser on a foreign origin after sign-in).
 */
function isSafeNext(next: unknown): next is string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const next = form.get("next");

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    const params = new URLSearchParams({ error: "Supabase is not configured" });
    if (isSafeNext(next)) params.set("next", next);
    return context.redirect(`/auth/signin?${params.toString()}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const params = new URLSearchParams({ error: error.message });
    if (isSafeNext(next)) params.set("next", next);
    return context.redirect(`/auth/signin?${params.toString()}`);
  }

  return context.redirect(isSafeNext(next) ? next : "/");
};
