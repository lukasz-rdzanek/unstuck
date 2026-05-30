import type { APIRoute } from "astro";
import type { AuthError } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const resendSchema = z.object({
  email: z.email("Enter a valid email address"),
});

const RATE_LIMIT_FALLBACK_SECONDS = 60;

function extractRetryAfterSeconds(error: AuthError): number {
  // Supabase emits messages like "For security purposes, you can only
  // request this after 45 seconds." — regex out the number; fall back
  // to max_frequency default when the message shape changes.
  const match = /after\s+(\d+)\s+second/i.exec(error.message);
  if (match) return parseInt(match[1], 10);
  return RATE_LIMIT_FALLBACK_SECONDS;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = resendSchema.safeParse({
    email: form.get("email") ?? "",
  });
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0].message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
  });

  if (error?.code === "over_email_send_rate_limit") {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        retryAfterSeconds: extractRetryAfterSeconds(error),
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  // Anti-enumeration: every other outcome (success, email unknown,
  // already confirmed) returns the same shape. Log the underlying
  // outcome server-side so we can debug; never leak via response.
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[resend] supabase.auth.resend returned non-rate-limit error", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
