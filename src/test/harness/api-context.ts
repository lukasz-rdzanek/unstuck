import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";

// Hermetic harness (test-plan Phase 3): build the thin slice of an Astro
// APIContext that route handlers actually read, so handlers can be invoked in a
// plain Vitest unit test (no server, no network). Pair with vi.mock("@/lib/
// supabase") so the handler's createClient() returns a fake client and the real
// module's astro:env/client import never loads. See tests/cookbook in test-plan §6.

export interface MakeApiContextOptions {
  /** HTTP method (default POST). */
  method?: string;
  /** Request URL (default a dummy http://test/...). */
  url?: string;
  /** JSON body — stringified with application/json. Mutually exclusive with formData. */
  body?: unknown;
  /** Form body — sent as multipart/form-data via FormData. */
  formData?: Record<string, string>;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** locals.user (default null = unauthenticated). */
  user?: User | null;
  /** Route params, e.g. { lessonId }. */
  params?: Record<string, string>;
}

/**
 * Assemble a fake APIContext. Only the fields handlers read are populated;
 * everything else is intentionally absent (cast through unknown). `redirect`
 * returns a Response whose Location header + status the test asserts.
 */
export function makeApiContext(opts: MakeApiContextOptions = {}): APIContext {
  const method = opts.method ?? "POST";
  const url = opts.url ?? "http://test/local";
  const headers = new Headers(opts.headers ?? {});

  let requestBody: BodyInit | undefined;
  if (opts.formData !== undefined) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(opts.formData)) fd.set(k, v);
    requestBody = fd;
  } else if (opts.body !== undefined) {
    requestBody = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }

  const request = new Request(url, { method, headers, body: requestBody });

  const ctx = {
    request,
    params: opts.params ?? {},
    locals: { user: opts.user ?? null },
    url: new URL(url),
    cookies: {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
      has: () => false,
    },
    redirect: (location: string, status?: number) =>
      new Response(null, { status: status ?? 302, headers: { Location: location } }),
  };

  return ctx as unknown as APIContext;
}
