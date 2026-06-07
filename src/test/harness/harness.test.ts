import { describe, it, expect, vi } from "vitest";
import { makeApiContext } from "./api-context";
import { makeFakeSupabase } from "./fake-supabase";

// Phase 1 smoke test: proves the hermetic seam works end-to-end before any risk
// phase depends on it. vi.mock("@/lib/supabase") replaces createClient so the
// real module's astro:env/client import never loads — a route handler that
// imports @/lib/supabase can therefore run in the plain unit project.
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { signOut: () => Promise.resolve({ error: null }) } }),
}));

// Imported AFTER the mock (vi.mock is hoisted): signout imports @/lib/supabase.
import { POST } from "@/pages/api/auth/signout";

describe("hermetic harness", () => {
  it("invokes a real route handler through the mocked supabase seam (astro:env bypassed)", async () => {
    const res = await POST(makeApiContext());
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("makeFakeSupabase builds a client with empty capture buffers", () => {
    const fake = makeFakeSupabase();
    expect(fake.client).toBeDefined();
    expect(fake.writes).toHaveLength(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
