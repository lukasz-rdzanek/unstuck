import { describe, it, expect } from "vitest";
import { isSafeNext } from "@/lib/safe-next";

describe("isSafeNext (open-redirect guard)", () => {
  it("accepts a same-origin absolute path", () => {
    expect(isSafeNext("/courses/react")).toBe(true);
    expect(isSafeNext("/dashboard")).toBe(true);
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(isSafeNext("//evil.com")).toBe(false);
    expect(isSafeNext("/\\evil.com")).toBe(false);
  });

  it("rejects absolute URLs and non-path strings", () => {
    expect(isSafeNext("https://evil.com")).toBe(false);
    expect(isSafeNext("evil.com")).toBe(false);
    expect(isSafeNext("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isSafeNext(null)).toBe(false);
    expect(isSafeNext(undefined)).toBe(false);
    expect(isSafeNext(123)).toBe(false);
  });

  it("rejects a non-string that string-coerces to a path-like value (type-guard is load-bearing)", () => {
    // The `typeof === "string"` check is not redundant: without it, a value
    // whose String() coercion starts with a safe-looking "/foo" would pass the
    // regex. `isSafeNext` is a `next is string` predicate — a non-string must
    // never be treated as a safe redirect, even if it coerces to one.
    expect(isSafeNext(["/dashboard"])).toBe(false);
    expect(isSafeNext({ toString: () => "/dashboard" })).toBe(false);
  });
});
