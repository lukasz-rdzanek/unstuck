import type { APIContext, APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

// `\d{6}` matches Supabase's `auth.email.otp_length` in supabase/config.toml.
// If the operator bumps otp_length, update this regex AND the HTML
// pattern/maxlength on src/pages/auth/confirm-email.astro in lockstep.
const verifySchema = z.object({
  email: z.email("Enter a valid email address"),
  token: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

// Always go through context.redirect so any cookies queued by Supabase
// via AstroCookies.set (e.g. on a token-already-consumed edge case)
// are merged into the outgoing response. Matches signin.ts/signup.ts.
function redirectToConfirm(context: APIContext, email: string, errorCode: string): Response {
  const params = new URLSearchParams({ email, error: errorCode });
  return context.redirect(`/auth/confirm-email?${params.toString()}`);
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
    // Pass a stable error code (not the raw zod message) so the
    // confirm page can render an actionable copy mapped from
    // errorCopy. Distinguish bad-email vs bad-token shape.
    const issuePath = parsed.error.issues[0].path[0];
    const code = issuePath === "token" ? "format_invalid" : "email_invalid";
    return redirectToConfirm(context, emailStr, code);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return redirectToConfirm(context, parsed.data.email, "supabase_not_configured");
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
    return redirectToConfirm(context, parsed.data.email, code);
  }

  // Success: Supabase set the session cookies via createClient's
  // setAll binding; user is now signed in. Land on the cosmic root.
  return context.redirect("/");
};
