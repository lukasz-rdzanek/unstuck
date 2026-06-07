import { describe, it, expect } from "vitest";
import { parseVideoUrl } from "@/lib/video-embed";

describe("parseVideoUrl", () => {
  it("parses a YouTube watch URL", () => {
    const r = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(r.provider).toBe("youtube");
    expect(r.id).toBe("dQw4w9WgXcQ");
    expect(r.embedSrc).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("parses a youtu.be short URL", () => {
    const r = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(r.provider).toBe("youtube");
    expect(r.id).toBe("dQw4w9WgXcQ");
  });

  it("parses a Vimeo URL", () => {
    const r = parseVideoUrl("https://vimeo.com/123456789");
    expect(r.provider).toBe("vimeo");
    expect(r.id).toBe("123456789");
  });

  it("returns unknown for unrecognized hosts", () => {
    expect(parseVideoUrl("https://example.com/watch?v=x").provider).toBe("unknown");
  });

  it("returns unknown for an invalid URL", () => {
    expect(parseVideoUrl("not a url")).toEqual({ embedSrc: null, provider: "unknown", id: null });
  });
});
