import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase } from "@/test/harness/fake-supabase";

// Regression: prod issues OTP codes longer than the local stack's 6 digits
// (its `auth.email.otp_length` is cloud-side, not synced by `db push`). The old
// `\d{6}` schema rejected those valid codes and blocked account confirmation.
// What we pin: a 6–10 digit code reaches verifyOtp; anything else is bounced as
// a format error WITHOUT calling Supabase.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

import { POST } from "@/pages/api/auth/verify-otp";
import { createClient } from "@/lib/supabase";

/** verify-otp POST with email/token; verifyOtp resolves to `authError`. */
function post(token: string, authError: { code?: string; message: string } | null = null) {
  const verifyOtp = vi.fn(() => Promise.resolve({ error: authError }));
  vi.mocked(createClient).mockReturnValue(makeFakeSupabase({ auth: { verifyOtp } }).client);
  return { res: POST(makeApiContext({ formData: { email: "real@user.test", token } })), verifyOtp };
}

function params(res: Response): URLSearchParams {
  return new URL(res.headers.get("Location") ?? "", "http://x").searchParams;
}
function path(res: Response): string {
  return new URL(res.headers.get("Location") ?? "", "http://x").pathname;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verify-otp — variable-length OTP acceptance", () => {
  it("accepts an 8-digit prod code → verifies and lands on /", async () => {
    const { res, verifyOtp } = post("20960957");
    const r = await res;
    expect(verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ token: "20960957", type: "signup" }));
    expect(path(r)).toBe("/");
  });

  it("still accepts a 6-digit local code", async () => {
    const { res } = post("123456");
    expect(path(await res)).toBe("/");
  });

  it("accepts the 10-digit upper bound", async () => {
    const { res } = post("1234567890");
    expect(path(await res)).toBe("/");
  });
});

describe("verify-otp — rejects malformed codes without calling Supabase", () => {
  it("rejects a 5-digit (too short) code", async () => {
    const { res, verifyOtp } = post("12345");
    const r = await res;
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(path(r)).toBe("/auth/confirm-email");
    expect(params(r).get("error")).toBe("format_invalid");
  });

  it("rejects an 11-digit (too long) code", async () => {
    const { res, verifyOtp } = post("12345678901");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(params(await res).get("error")).toBe("format_invalid");
  });

  it("rejects a non-numeric code", async () => {
    const { res, verifyOtp } = post("12ab56");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(params(await res).get("error")).toBe("format_invalid");
  });
});

describe("verify-otp — surfaces Supabase verification errors", () => {
  it("maps invalid_otp to the confirm page error", async () => {
    const { res } = post("20960957", { code: "invalid_otp", message: "Token has expired or is invalid" });
    const r = await res;
    expect(path(r)).toBe("/auth/confirm-email");
    expect(params(r).get("error")).toBe("invalid_otp");
  });
});
