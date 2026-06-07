import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeApiContext } from "@/test/harness/api-context";
import { makeFakeSupabase, type FakeSupabaseOptions } from "@/test/harness/fake-supabase";
import type { User } from "@supabase/supabase-js";

// R6 — backfill operator gate. Fail-closed ladder: no user → 401; OPERATOR_USER_ID
// unset → 503; non-operator → 403; operator → 200. Per-row embed/set failure is
// counted, not fatal; a list-RPC error IS fatal (500).
//
// This file also verifies the residual harness risk: vi.mock on the bare
// `astro:env/server` virtual specifier (which the unit project doesn't resolve).
// The hoisted holder lets each test vary OPERATOR_USER_ID via a live binding.

const envHolder = vi.hoisted((): { OPERATOR_USER_ID: string | undefined } => ({ OPERATOR_USER_ID: "op-1" }));
vi.mock("astro:env/server", () => envHolder);
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/embeddings", () => ({ embedText: vi.fn(), toVectorLiteral: vi.fn(() => "[0]") }));

import { POST } from "@/pages/api/embeddings/backfill";
import { createClient } from "@/lib/supabase";
import { embedText } from "@/lib/embeddings";

const OP = { id: "op-1" } as User;

function body(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  envHolder.OPERATOR_USER_ID = "op-1";
  vi.mocked(embedText).mockResolvedValue([0, 1, 2]);
});

describe("R6 — backfill operator gate", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(makeApiContext({ body: {} }));
    expect(res.status).toBe(401);
    expect((await body(res)).error).toBe("unauthenticated");
  });

  it("503 backfill_disabled when OPERATOR_USER_ID is unset (fail-closed)", async () => {
    envHolder.OPERATOR_USER_ID = undefined;
    const res = await POST(makeApiContext({ user: { id: "anyone" } as User, body: {} }));
    expect(res.status).toBe(503);
    expect((await body(res)).error).toBe("backfill_disabled");
  });

  it("403 forbidden for a non-operator", async () => {
    const res = await POST(makeApiContext({ user: { id: "not-op" } as User, body: {} }));
    expect(res.status).toBe(403);
    expect((await body(res)).error).toBe("forbidden");
  });

  it("operator success → { ok:true, embedded, failed, remaining }", async () => {
    // list returns one pending row on the first call, none on the remaining-count call.
    let listCalls = 0;
    const opts: FakeSupabaseOptions = {
      rpc: (name) => {
        if (name === "list_unembedded_messages") {
          listCalls += 1;
          return listCalls === 1
            ? { data: [{ id: "m-1", body: "a message body" }], error: null }
            : { data: [], error: null };
        }
        return { data: null, error: null }; // set_message_embedding
      },
    };
    vi.mocked(createClient).mockReturnValue(makeFakeSupabase(opts).client);
    const res = await POST(makeApiContext({ user: OP, body: {} }));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.embedded).toBe(1);
    expect(b.failed).toBe(0);
    expect(b.remaining).toBe(0);
  });

  it("500 list_failed when the list RPC errors (fatal)", async () => {
    vi.mocked(createClient).mockReturnValue(
      makeFakeSupabase({ rpc: () => ({ data: null, error: { message: "boom" } }) }).client,
    );
    const res = await POST(makeApiContext({ user: OP, body: {} }));
    expect(res.status).toBe(500);
    expect((await body(res)).error).toBe("list_failed");
  });

  it("per-row embed failure is counted, not fatal (still 200)", async () => {
    let listCalls = 0;
    vi.mocked(createClient).mockReturnValue(
      makeFakeSupabase({
        rpc: (name) => {
          if (name === "list_unembedded_messages") {
            listCalls += 1;
            return listCalls === 1
              ? { data: [{ id: "m-1", body: "a message body" }], error: null }
              : { data: [], error: null };
          }
          return { data: null, error: null };
        },
      }).client,
    );
    vi.mocked(embedText).mockRejectedValue(new Error("embed down"));
    const res = await POST(makeApiContext({ user: OP, body: {} }));
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.embedded).toBe(0);
    expect(b.failed).toBe(1);
  });
});
