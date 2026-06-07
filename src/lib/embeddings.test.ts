import { describe, it, expect } from "vitest";
import { toVectorLiteral, EMBEDDING_DIM, EMBEDDING_MODEL } from "@/lib/embeddings";

describe("embeddings helpers", () => {
  it("toVectorLiteral renders a pgvector literal", () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
    expect(toVectorLiteral([])).toBe("[]");
  });

  it("model/dim constants are the bge-base 768-dim pair", () => {
    expect(EMBEDDING_DIM).toBe(768);
    expect(EMBEDDING_MODEL).toBe("@cf/baai/bge-base-en-v1.5");
  });
});
