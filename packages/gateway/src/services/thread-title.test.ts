import { describe, expect, it } from "vitest";
import {
  THREAD_TITLE_PROMPT,
  normalizeGeneratedThreadTitle,
} from "./thread-title.js";

describe("thread-title helpers", () => {
  it("keeps the requested title prompt stable", () => {
    expect(THREAD_TITLE_PROMPT).toContain("short task title");
  });

  it("normalizes provider output into a clean single-line title", () => {
    expect(normalizeGeneratedThreadTitle('Title: "Fix manager thread selection"\n\nExtra text', "Fallback")).toBe(
      "Fix manager thread selection",
    );
  });

  it("falls back when the provider returns no usable title", () => {
    expect(normalizeGeneratedThreadTitle(" \n ", "Fallback title")).toBe("Fallback title");
  });
});
