import { describe, expect, test } from "vitest";
import { normalizeBrowserUrl } from "./browser-navigation.js";

describe("normalizeBrowserUrl", () => {
  test("adds https to host-like input", () => {
    expect(normalizeBrowserUrl("example.com/docs")).toBe("https://example.com/docs");
    expect(normalizeBrowserUrl("localhost:3000")).toBe("https://localhost:3000/");
  });

  test("preserves supported explicit protocols", () => {
    expect(normalizeBrowserUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeBrowserUrl("https://example.com/path?q=1")).toBe("https://example.com/path?q=1");
  });

  test("rejects empty, invalid, and unsafe protocols", () => {
    expect(normalizeBrowserUrl(" ")).toBeNull();
    expect(normalizeBrowserUrl("https://")).toBeNull();
    expect(normalizeBrowserUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeBrowserUrl("file:///tmp/example.html")).toBeNull();
    expect(normalizeBrowserUrl("ftp://example.com")).toBeNull();
  });
});
