import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authedClientFor, serviceClient, type DbClient } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// R5(b) — set_message_embedding must change ONLY the embedding column, ONLY when
// it was NULL, and ONLY the target row. (Per the F1 caveat, the SQL does NOT
// gate per-course writes today, so we assert exactly what's guaranteed —
// column-scope / null-only / single-row — and nothing more.)

const RUN_ID = "embedding-immutability";

/** A 768-dim pgvector literal with component 0 set to `v0`. */
function vec(v0: number): string {
  const arr = new Array<number>(768).fill(0);
  arr[0] = v0;
  return `[${arr.join(",")}]`;
}

describe("R5(b) — set_message_embedding immutability", () => {
  let fx: RunFixture;
  let learner: DbClient;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
    learner = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  it("sets a NULL embedding while leaving every other column untouched (column-scope)", async () => {
    const svc = serviceClient();
    const cols = "body, author_id, is_seeded, lesson_id, created_at, embedding";
    const before = await svc.from("messages").select(cols).eq("id", fx.unembeddedMessageId).single();
    expect(before.error).toBeNull();
    expect(before.data?.embedding).toBeNull();

    const set = await learner.rpc("set_message_embedding", {
      p_message_id: fx.unembeddedMessageId,
      p_embedding: vec(0.5),
    });
    expect(set.error).toBeNull();

    const after = await svc.from("messages").select(cols).eq("id", fx.unembeddedMessageId).single();
    expect(after.error).toBeNull();
    expect(after.data?.embedding).not.toBeNull(); // embedding was set
    // ...and nothing else moved.
    expect(after.data?.body).toBe(before.data?.body);
    expect(after.data?.author_id).toBe(before.data?.author_id);
    expect(after.data?.is_seeded).toBe(before.data?.is_seeded);
    expect(after.data?.lesson_id).toBe(before.data?.lesson_id);
    expect(after.data?.created_at).toBe(before.data?.created_at);
  });

  it("does not overwrite an already-set embedding (null-only)", async () => {
    const svc = serviceClient();
    // The message was set in the previous test; capture its current embedding.
    const current = await svc.from("messages").select("embedding").eq("id", fx.unembeddedMessageId).single();
    const set = await learner.rpc("set_message_embedding", {
      p_message_id: fx.unembeddedMessageId,
      p_embedding: vec(0.25),
    });
    expect(set.error).toBeNull();
    const after = await svc.from("messages").select("embedding").eq("id", fx.unembeddedMessageId).single();
    expect(after.data?.embedding).toBe(current.data?.embedding); // unchanged — the null-only guard held
  });

  it("touches only the target row (single-row scope)", async () => {
    const svc = serviceClient();
    const before = await svc.from("messages").select("embedding").eq("id", fx.embeddedMessageId).single();
    // Operate on the unembedded message again...
    await learner.rpc("set_message_embedding", { p_message_id: fx.unembeddedMessageId, p_embedding: vec(0.75) });
    // ...the pre-set sibling is unaffected.
    const after = await svc.from("messages").select("embedding").eq("id", fx.embeddedMessageId).single();
    expect(after.data?.embedding).toBe(before.data?.embedding);
  });
});
