import { describe, expect, it } from "vitest";
import {
  THREAD_TITLE_PROMPT,
  fallbackThreadTitle,
  normalizeGeneratedThreadTitle,
} from "./thread-title.js";

describe("thread-title helpers", () => {
  it("keeps the requested title prompt stable", () => {
    expect(THREAD_TITLE_PROMPT).toBe("create a title for this task.");
  });

  it("normalizes provider output into a clean single-line title", () => {
    expect(normalizeGeneratedThreadTitle('Title: "Fix manager thread selection"\n\nExtra text', "Fallback")).toBe(
      "Fix manager thread selection",
    );
  });

  it("falls back when the provider returns no usable title", () => {
    expect(normalizeGeneratedThreadTitle(" \n ", "Fallback title")).toBe("Fallback title");
  });

  it("builds a readable fallback from the task text", () => {
    expect(
      fallbackThreadTitle("  Fix manager mode so new tasks stay in the composer instead of opening the thread  "),
    ).toBe("Fix manager mode so new tasks stay in the composer instead of opening the thread");
  });
});
