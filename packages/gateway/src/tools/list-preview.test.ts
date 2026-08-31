import { describe, expect, it } from "vitest";
import { ellipsizeText, formatEllipsedList, memoryLine, summarizeWithPreview } from "./list-preview.js";

describe("ellipsizeText", () => {
  it("collapses whitespace and returns short text unchanged", () => {
    expect(ellipsizeText("  hello\n  world  ")).toBe("hello world");
  });

  it("truncates long text with a single trailing ellipsis", () => {
    const long = "x".repeat(200);
    const result = ellipsizeText(long, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("formatEllipsedList", () => {
  it("keeps every line when under the item cap", () => {
    expect(formatEllipsedList(["a", "b"])).toBe("a\nb");
  });

  it("appends a +N more marker when truncated", () => {
    const result = formatEllipsedList(["1", "2", "3"], 2);
    expect(result).toBe("1\n2\n… (+1 more)");
  });
});

describe("summarizeWithPreview", () => {
  it("keeps the summary alone when there are no items", () => {
    expect(summarizeWithPreview("Loaded 0 todos:", [])).toBe("Loaded 0 todos:");
  });

  it("joins the summary with the preview block", () => {
    expect(summarizeWithPreview("Loaded 2 todos:", ["one", "two"]))
      .toBe("Loaded 2 todos:\none\ntwo");
  });
});

describe("memoryLine", () => {
  it("formats id, kind, and ellipsed content", () => {
    expect(memoryLine("memory-1", "hello world", "reminder"))
      .toBe("• [memory-1 · reminder] hello world");
  });

  it("appends the extra suffix after the content", () => {
    expect(memoryLine("memory-1", "hello", "memory", "archived"))
      .toBe("• [memory-1 · memory] hello (archived)");
  });
});