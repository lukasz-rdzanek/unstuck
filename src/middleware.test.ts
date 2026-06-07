import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R7 — session route-gating. isProtectedRoute's boundaries (pure) + the gate
// wiring (unauth + protected → redirect to signin with the destination in `next`;
// authed or non-protected → pass through to next()).

vi.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/services/profiles", () => ({ getDisplayNameOrFallback: vi.fn(() => Promise.resolve("Name")) }));

import { onRequest, isProtectedRoute } from "@/middleware";
import { createClient } from "@/lib/supabase";

type Middleware = (context: unknown, next: () => Promise<Response>) => Promise<Response>;
const run = onRequest as unknown as Middleware;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockReturnValue(makeFakeSupabase().client); // anon: getUser → null
});

describe("R7 — isProtectedRoute boundaries", () => {
  it("matches protected routes", () => {
    expect(isProtectedRoute("/dashboard")).toBe(true);
    expect(isProtectedRoute("/courses/react/lessons/intro")).toBe(true);
    expect(isProtectedRoute("/courses/react/tests/quiz")).toBe(true);
    expect(isProtectedRoute("/courses/react/practice")).toBe(true);
    expect(isProtectedRoute("/dashboardfoo")).toBe(true); // documented: /dashboard is a prefix match
  });

  it("does not match near-misses or public routes", () => {
    expect(isProtectedRoute("/courses/react/lessons")).toBe(false); // needs trailing slash
    expect(isProtectedRoute("/courses/react/practice/extra")).toBe(false); // anchored /?$
    expect(isProtectedRoute("/")).toBe(false);
    expect(isProtectedRoute("/courses")).toBe(false);
    expect(isProtectedRoute("/auth/signin")).toBe(false);
  });
});

describe("R7 — middleware gate", () => {
  it("redirects an unauthenticated user off a protected route, preserving the destination in next", async () => {
    const next = vi.fn(() => Promise.resolve(new Response("ok")));
    const res = await run(makeApiContext({ url: "http://test/dashboard?tab=x" }), next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`/auth/signin?next=${encodeURIComponent("/dashboard?tab=x")}`);
  });

  it("passes an authenticated user through to next() on a protected route", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeFakeSupabase({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } as User }, error: null }) },
      }).client,
    );
    const next = vi.fn(() => Promise.resolve(new Response("ok")));
    const res = await run(makeApiContext({ url: "http://test/dashboard" }), next);
    expect(next).toHaveBeenCalledOnce();
    expect(await res.text()).toBe("ok");
  });

  it("passes through on a non-protected route even when unauthenticated", async () => {
    const next = vi.fn(() => Promise.resolve(new Response("ok")));
    await run(makeApiContext({ url: "http://test/courses" }), next);
    expect(next).toHaveBeenCalledOnce();
  });
});
