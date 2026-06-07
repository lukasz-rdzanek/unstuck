import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase } from "@/test/harness/fake-supabase";

// R6 — resend anti-enumeration. The security contract: resend must NOT reveal
// whether an email exists. Success / unknown / already-confirmed / unconfigured
// all return an identical { ok:true }/200; only a rate-limit is distinguishable.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

import { POST } from "@/pages/api/auth/resend";
import { createClient } from "@/lib/supabase";

function body(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** A createClient whose auth.resend resolves to the given error (or null). */
function clientResolving(error: { code?: string; message: string; status?: number } | null) {
  return makeFakeSupabase({ auth: { resend: () => Promise.resolve({ error }) } }).client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("R6 — resend anti-enumeration", () => {
  it("400 on an invalid email", async () => {
    vi.mocked(createClient).mockReturnValue(clientResolving(null));
    const res = await POST(makeApiContext({ formData: { email: "not-an-email" } }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBeTruthy();
  });

  it("success → { ok:true }/200", async () => {
    vi.mocked(createClient).mockReturnValue(clientResolving(null));
    const res = await POST(makeApiContext({ formData: { email: "real@user.test" } }));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
  });

  it("unknown / already-confirmed email → identical { ok:true }/200 (no enumeration)", async () => {
    vi.mocked(createClient).mockReturnValue(
      clientResolving({ code: "user_already_exists", message: "already", status: 400 }),
    );
    const res = await POST(makeApiContext({ formData: { email: "maybe@user.test" } }));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
  });

  it("supabase unconfigured → { ok:true }/200 (still no signal)", async () => {
    vi.mocked(createClient).mockReturnValue(null);
    const res = await POST(makeApiContext({ formData: { email: "real@user.test" } }));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true });
  });

  it("rate-limited → 429 with retryAfterSeconds parsed from the message", async () => {
    vi.mocked(createClient).mockReturnValue(
      clientResolving({
        code: "over_email_send_rate_limit",
        message: "you can only request this after 45 seconds.",
        status: 429,
      }),
    );
    const res = await POST(makeApiContext({ formData: { email: "real@user.test" } }));
    expect(res.status).toBe(429);
    const b = await body(res);
    expect(b.error).toBe("rate_limited");
    expect(b.retryAfterSeconds).toBe(45);
  });
});
