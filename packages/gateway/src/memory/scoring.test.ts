import { describe, expect, it } from "vitest";
import { bm25Rank, bm25Tokens } from "./scoring.js";

function rank(query: string, texts: string[]): { text: string; score: number }[] {
  return bm25Rank(query, texts.map((text) => ({ item: text, text })))
    .map((result) => ({ text: result.item, score: result.score }));
}

describe("bm25Tokens", () => {
  it("folds plurals so singular queries match plural content", () => {
    expect(bm25Tokens("Icons and tooltips")).toEqual(["icon", "tooltip"]);
  });

  it("drops single-character noise", () => {
    expect(bm25Tokens("a b_c 42")).toEqual(["b_c", "42"]);
  });

  it("drops function words that IDF cannot discount on short facts", () => {
    expect(bm25Tokens("what does this do in the app")).toEqual(["app"]);
  });
});

describe("bm25Rank", () => {
  it("weights rare terms far above corpus-wide ones", () => {
    const corpus = [
      "The app should retry failed webhooks.",
      "The app uses pnpm for installs.",
      "The app deploys from main.",
      "The app renders markdown reasoning.",
      "Quarantined tool calls must not end the turn.",
    ];

    const [common, rare] = [
      rank("app quarantined", corpus).find((r) => r.text.startsWith("The app should retry"))!,
      rank("app quarantined", corpus).find((r) => r.text.startsWith("Quarantined"))!,
    ];

    expect(rare.score).toBeGreaterThan(common.score * 3);
  });

  it("scores documents with no shared term at zero", () => {
    const results = rank("database migration rollback", [
      "Use compact todo controls with icons.",
      "Roll back the migration before deploying.",
    ]);

    expect(results[0]?.score).toBe(0);
    expect(results[1]?.score).toBeGreaterThan(0);
  });

  it("does not let a long document win on incidental repetition alone", () => {
    const focused = "Retries are capped at three.";
    const padded = `Retries. ${"Unrelated background prose about deployment and tooling. ".repeat(20)}`;
    const results = rank("retries", [focused, padded]);

    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("returns zero scores when the query has no usable terms", () => {
    expect(rank("!", ["anything at all"])).toEqual([{ text: "anything at all", score: 0 }]);
  });

  it("handles an empty corpus", () => {
    expect(bm25Rank("anything", [])).toEqual([]);
  });
});
