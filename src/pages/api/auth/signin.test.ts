import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase } from "@/test/harness/fake-supabase";

// R7 — the signin open-redirect SINK. isSafeNext is left REAL (its vectors are
// already unit-tested in safe-next.test.ts); what we pin here is the WIRING: a
// malicious `next` must never survive into the redirect. The success-path sink
// (signin.ts:44) is the mutation-survivable line — drop the isSafeNext wrapper
// and every other test still passes while the vuln reopens.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

import { POST } from "@/pages/api/auth/signin";
import { createClient } from "@/lib/supabase";

/** signin POST with email/password/next; signInWithPassword resolves to `authError`. */
function post(next: string | undefined, authError: { code?: string; message: string } | null = null) {
  vi.mocked(createClient).mockReturnValue(
    makeFakeSupabase({ auth: { signInWithPassword: () => Promise.resolve({ error: authError }) } }).client,
  );
  const formData: Record<string, string> = { email: "real@user.test", password: "pw" };
  if (next !== undefined) formData.next = next;
  return POST(makeApiContext({ formData }));
}

function location(res: Response): string {
  return res.headers.get("Location") ?? "";
}
/** Parse a relative Location into its query params. */
function params(res: Response): URLSearchParams {
  return new URL(location(res), "http://x").searchParams;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("R7 — signin open-redirect sink (success path)", () => {
  it("honors a safe next", async () => {
    expect(location(await post("/dashboard"))).toBe("/dashboard");
  });

  it("rejects a protocol-relative next → falls back to /", async () => {
    expect(location(await post("//evil.com"))).toBe("/");
  });

  it("rejects a backslash-trick next → falls back to /", async () => {
    expect(location(await post("/\\evil.com"))).toBe("/");
  });

  it("falls back to / when next is absent", async () => {
    expect(location(await post(undefined))).toBe("/");
  });
});

describe("R7 — signin error path next propagation", () => {
  it("preserves a safe next in the error redirect", async () => {
    const res = await post("/dashboard", { message: "Invalid login credentials" });
    const p = params(res);
    expect(p.get("error")).toBe("Invalid login credentials");
    expect(p.get("next")).toBe("/dashboard");
  });

  it("drops an unsafe next from the error redirect", async () => {
    const res = await post("//evil.com", { message: "Invalid login credentials" });
    const p = params(res);
    expect(p.get("error")).toBe("Invalid login credentials");
    expect(p.get("next")).toBeNull();
  });

  it("drops an unsafe next on a validation failure (bad email)", async () => {
    vi.mocked(createClient).mockReturnValue(makeFakeSupabase().client);
    const res = await POST(makeApiContext({ formData: { email: "bad", password: "pw", next: "//evil.com" } }));
    const p = params(res);
    expect(p.get("error")).toBeTruthy();
    expect(p.get("next")).toBeNull();
  });
});
