import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serviceClient, authedClientFor } from "./setup/clients";
import { createRunFixture, cleanup, type RunFixture } from "./setup/fixtures";

// Harness connectivity smoke test (Phase 1). Proves the wiring end-to-end before
// any risk logic: the service client can read seed data, and a freshly-minted
// fixture user can authenticate through the real GoTrue password grant.

const RUN_ID = "smoke";
const SEED_COURSE_ID = "a0000000-0000-0000-0000-000000000001";

describe("integration harness smoke", () => {
  let fx: RunFixture;

  beforeAll(async () => {
    fx = await createRunFixture(RUN_ID);
  });

  afterAll(async () => {
    await cleanup(RUN_ID, [fx.enrolled, fx.outsider]);
  });

  it("service client reads the seed course", async () => {
    const svc = serviceClient();
    const { data, error } = await svc.from("courses").select("id").eq("id", SEED_COURSE_ID).single();
    expect(error).toBeNull();
    expect(data?.id).toBe(SEED_COURSE_ID);
  });

  it("a freshly-created fixture user can authenticate", async () => {
    const client = await authedClientFor(fx.enrolled.email, fx.enrolled.password);
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(fx.enrolled.id);
  });
});
