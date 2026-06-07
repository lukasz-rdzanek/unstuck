import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { isSafeNext } from "@/lib/safe-next";

export const prerender = false;

const signinSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const next = form.get("next");

  const parsed = signinSchema.safeParse({
    email: form.get("email") ?? "",
    password: form.get("password") ?? "",
  });
  if (!parsed.success) {
    const params = new URLSearchParams({ error: parsed.error.issues[0].message });
    if (isSafeNext(next)) params.set("next", next);
    return context.redirect(`/auth/signin?${params.toString()}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    const params = new URLSearchParams({ error: "Supabase is not configured" });
    if (isSafeNext(next)) params.set("next", next);
    return context.redirect(`/auth/signin?${params.toString()}`);
  }

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const isUnconfirmed = error.code === "email_not_confirmed" || error.message.includes("Email not confirmed");
    const params = new URLSearchParams(
      isUnconfirmed ? { error: "unconfirmed", unconfirmed_email: parsed.data.email } : { error: error.message },
    );
    if (isSafeNext(next)) params.set("next", next);
    return context.redirect(`/auth/signin?${params.toString()}`);
  }

  return context.redirect(isSafeNext(next) ? next : "/");
};
