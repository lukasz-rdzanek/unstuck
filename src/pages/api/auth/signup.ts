import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const signupSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = signupSchema.safeParse({
    email: form.get("email") ?? "",
    password: form.get("password") ?? "",
  });
  if (!parsed.success) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/auth/confirm-email");
};
