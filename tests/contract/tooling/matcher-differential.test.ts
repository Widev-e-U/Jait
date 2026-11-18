// Differential corpus: real Vitest decides each case, and the Rust comparator
// (tests/contract/tests/support/tail_assertions.rs) must reproduce the same
// verdict for the matching wire observation. The golden in cases.json is what
// this spec asserts, so a wrong golden fails here rather than silently agreeing
// with the Rust side.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

const corpusDir = fileURLToPath(new URL("../corpus/matcher-differential/", import.meta.url));
const verdictDir = fileURLToPath(new URL("../../../.jait/artifacts/matcher-differential/", import.meta.url));

type CorpusCase = { id: string; vitest: boolean };
const cases = JSON.parse(readFileSync(`${corpusDir}cases.json`, "utf8")) as CorpusCase[];

class CorpusAlpha {}
class CorpusBeta {}
const ExpectedFailure = class CollisionError extends Error {};
const OtherFailure = class CollisionError extends Error {};
class ChildFailure extends ExpectedFailure {}

// One runner and one real assertion per corpus id. These are ordinary Vitest
// assertions; nothing here consults the Rust comparator.
const runners: Record<string, () => void> = {
  "throw-class-same-identity": () => expect(() => { throw new ExpectedFailure("fixture failure"); }).toThrow(ExpectedFailure),
  "throw-class-same-name-other-identity": () => expect(() => { throw new OtherFailure("fixture failure"); }).toThrow(ExpectedFailure),
  "throw-class-subclass": () => expect(() => { throw new ChildFailure("fixture failure"); }).toThrow(ExpectedFailure),
  "throw-class-negated-other-identity": () => expect(() => { throw new OtherFailure("fixture failure"); }).not.toThrow(ExpectedFailure),
  "throw-class-error-alias-other-identity": () => expect(() => { throw new OtherFailure("fixture failure"); }).toThrowError(ExpectedFailure),
  "throw-class-requires-throw": () => expect(() => {}).toThrow(ExpectedFailure),

  "object-containing-allows-extra-outer-fields": () => {
    const fetchMock = vi.fn();
    fetchMock("http://localhost:20128/v1/models", { headers: {}, signal: "fixture" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models",
      expect.objectContaining({ headers: {} }));
  },
  "object-containing-rejects-extra-nested-header": () => {
    const fetchMock = vi.fn();
    fetchMock("http://localhost:20128/v1/models", { headers: { Authorization: "Bearer fixture" }, signal: "fixture" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models",
      expect.objectContaining({ headers: {} }));
  },
  "object-containing-rejects-extra-nested-nonempty-field": () => {
    const fetchMock = vi.fn();
    fetchMock("http://localhost:20128/v1/models", { headers: { Authorization: "Bearer fixture", Accept: "application/json" } });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models",
      expect.objectContaining({ headers: { Authorization: "Bearer fixture" } }));
  },
  "object-containing-explicit-nested-subset": () => {
    const fetchMock = vi.fn();
    fetchMock("http://localhost:20128/v1/models", { headers: { Authorization: "Bearer fixture", Accept: "application/json" } });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fixture" }) }));
  },
  "match-object-retains-recursive-subset": () => {
    expect({ headers: { Authorization: "Bearer fixture", Accept: "application/json" } })
      .toMatchObject({ headers: { Authorization: "Bearer fixture" } });
  },
  "object-containing-missing-required-key": () => {
    const fetchMock = vi.fn();
    fetchMock("http://localhost:20128/v1/models", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:20128/v1/models",
      expect.objectContaining({ headers: {} }));
  },
  "object-containing-empty-sample-matches-null": () => {
    expect(null).toEqual(expect.objectContaining({}));
  },
  "property-bracket-index": () => {
    expect({ items: [1] }).toHaveProperty("items[0]", 1);
  },
  "property-missing-index": () => {
    expect({ items: [1] }).toHaveProperty("items[1]");
  },
  "property-wrong-value": () => {
    expect({ items: [1] }).toHaveProperty("items[0]", 2);
  },
  "set-unordered-equality": () => {
    expect(new Set([2, 1])).toEqual(new Set([1, 2]));
  },
  "set-different-members": () => {
    expect(new Set([1, 2])).toEqual(new Set([1, 3]));
  },
  "map-unordered-equality": () => {
    expect(new Map([["b", 2], ["a", 1]])).toEqual(new Map([["a", 1], ["b", 2]]));
  },
  "array-order-is-significant": () => {
    expect([2, 1]).toEqual([1, 2]);
  },
  "nested-date-is-not-iso-string-loose": () => {
    expect({ x: new Date(0) }).toEqual({ x: "1970-01-01T00:00:00.000Z" });
  },
  "nested-date-is-not-iso-string-strict": () => {
    expect({ x: new Date(0) }).toStrictEqual({ x: "1970-01-01T00:00:00.000Z" });
  },
  "undefined-object-key-loose": () => {
    expect({ code: "ABC", optional: undefined }).toEqual({ code: "ABC" });
  },
  "undefined-object-key-strict": () => {
    expect({ code: "ABC", optional: undefined }).toStrictEqual({ code: "ABC" });
  },
  "null-is-not-undefined-key": () => {
    expect({ code: "ABC", optional: null }).toEqual({ code: "ABC" });
  },
  "set-contains-member": () => {
    expect(new Set(["a", "b"])).toContain("a");
  },
  "set-contains-missing-member": () => {
    expect(new Set(["a", "b"])).toContain("c");
  },
  "identity-same-argument": () => {
    const shared = {};
    expect(shared).toBe(shared);
  },
  "identity-distinct-equal-objects": () => {
    expect({}).toBe({});
  },
  "contains-identity-differs-from-structural": () => {
    const member = { id: 1 };
    expect([member]).toContain({ id: 1 });
  },
  "contains-identity-accepts-same-member": () => {
    const member = { id: 1 };
    expect([member]).toContain(member);
  },
  "contains-equal-uses-structure": () => {
    const member = { id: 1 };
    expect([member]).toContainEqual({ id: 1 });
  },
  "bigint-ordering-across-magnitudes": () => {
    expect(99999999999999999999999999999999999999999n).toBeLessThan(
      100000000000000000000000000000000000000000n,
    );
  },
  "bigint-ordering-negative": () => {
    expect(-20n).toBeLessThan(-3n);
  },
  "lone-surrogate-length": () => {
    expect("\uD83Dxy").toHaveLength(3);
  },
  "lone-surrogate-contains": () => {
    expect("\uD83Dxy").toContain("xy");
  },
  "function-identity-equal-matcher": () => {
    const fn = () => {};
    expect(fn).toEqual(fn);
  },
  "function-identity-toBe-distinct": () => {
    expect(() => {}).toBe(() => {});
  },
  "exception-thrown-satisfies-toThrow": () => {
    expect(() => {
      throw new Error("boom");
    }).toThrow();
  },
  "exception-not-thrown-fails-toThrow": () => {
    expect(() => {}).toThrow();
  },
  "exception-message-substring": () => {
    expect(() => {
      throw new Error("boom happened");
    }).toThrow("happened");
  },
  "class-instance-strict-equality-same-prototype": () => {
    expect(new CorpusAlpha()).toStrictEqual(new CorpusAlpha());
  },
  "class-instance-strict-equality-different-prototype": () => {
    expect(new CorpusAlpha()).toStrictEqual(new CorpusBeta());
  },
  "nan-equals-nan": () => {
    expect(Number.NaN).toEqual(Number.NaN);
  },
  "nan-not-equal-to-number": () => {
    expect(Number.NaN).toEqual(0);
  },
  "regex-anchored-start": () => {
    expect("foobar").toMatch(/^foo/);
  },
  "regex-dollar-end-matches-exact": () => {
    expect("x").toMatch(/x$/);
  },
  "regex-dollar-rejects-trailing-newline": () => {
    expect("x\n").toMatch(/x$/);
  },
  "regex-multiline-dollar-before-terminator": () => {
    expect("x\nrest").toMatch(/x$/m);
  },
  "regex-class-and-boundary": () => {
    expect("a1").toMatch(/^\w\d$/);
  },
};

const observed: Record<string, boolean> = {};

describe("matcher differential corpus", () => {
  for (const corpusCase of cases) {
    it(corpusCase.id, () => {
      const run = runners[corpusCase.id];
      expect(run, `${corpusCase.id}: no Vitest runner`).toBeTypeOf("function");
      let verdict = true;
      try {
        run();
      } catch {
        verdict = false;
      }
      observed[corpusCase.id] = verdict;
      expect(verdict, `${corpusCase.id}: stored golden disagrees with real Vitest`).toBe(
        corpusCase.vitest,
      );
    });
  }

  it("keeps runners and corpus ids in sync", () => {
    expect(Object.keys(runners).sort()).toEqual(cases.map(corpusCase => corpusCase.id).sort());
  });
});

afterAll(() => {
  mkdirSync(verdictDir, { recursive: true });
  writeFileSync(`${verdictDir}verdicts-vitest.json`, `${JSON.stringify(observed, null, 2)}\n`);
});
