import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const verifySchema = z.object({
  email: z.email("Enter a valid email address"),
  token: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

function redirectToConfirm(email: string, errorCode: string): Response {
  const params = new URLSearchParams({ email, error: errorCode });
  return new Response(null, {
    status: 302,
    headers: { Location: `/auth/confirm-email?${params.toString()}` },
  });
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = verifySchema.safeParse({
    email: form.get("email") ?? "",
    token: form.get("token") ?? "",
  });
  if (!parsed.success) {
    const emailRaw = form.get("email");
    const emailStr = typeof emailRaw === "string" ? emailRaw : "";
    return redirectToConfirm(emailStr, parsed.error.issues[0].message);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectToConfirm(parsed.data.email, "supabase_not_configured");
  }

  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "signup",
  });

  if (error) {
    // Supabase emits `otp_expired` and `invalid_otp` (see
    // node_modules/@supabase/auth-js/dist/main/lib/error-codes.d.ts).
    // Anything else falls through to a generic friendly message.
    const code = error.code ?? "verify_failed";
    return redirectToConfirm(parsed.data.email, code);
  }

  // Success: Supabase set the session cookies via createClient's
  // setAll binding; user is now signed in. Land on the cosmic root.
  return context.redirect("/");
};
