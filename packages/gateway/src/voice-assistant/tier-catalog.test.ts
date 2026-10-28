import { describe, expect, it } from "vitest";
import type { ProviderModelInfo } from "@jait/shared";
import { loadConfig } from "../config.js";
import {
  buildCatalogueFromModels,
  buildVoiceCatalogue,
  effortFor,
  resetVoiceCatalogueCache,
  type VoiceModelCatalogue,
} from "./tier-catalog.js";

function model(overrides: Partial<ProviderModelInfo> & { id: string }): ProviderModelInfo {
  return { name: overrides.id, ...overrides };
}

const FIXTURES: ProviderModelInfo[] = [
  model({
    id: "fixture-quick",
    group: "fixture-cloud",
    pricing: { promptPerMTok: 0.1, completionPerMTok: 0.4 },
  }),
  model({
    id: "fixture-deep",
    group: "fixture-cloud",
    pricing: { promptPerMTok: 3, completionPerMTok: 15 },
    reasoningEffortSupported: true,
    supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }],
  }),
  model({ id: "fixture-unpriced", group: "fixture-cloud" }),
  model({ id: "fixture-local", group: "ollama" }),
];

describe("buildCatalogueFromModels", () => {
  const catalogue: VoiceModelCatalogue = buildCatalogueFromModels(FIXTURES, { now: () => 1 });

  it("ranks the cheapest usable model first for the fast tier", () => {
    // A free local backend is genuinely the cheapest thing that works, and the
    // cheapest paid cloud model comes right after it.
    expect(catalogue.fast[0]?.model).toBe("fixture-local");
    expect(catalogue.fast[0]?.costClass).toBe("free");
    expect(catalogue.fast.map((c) => c.model)).toContain("fixture-quick");
    expect(catalogue.fast[1]?.costClass).toBe("cheap");
  });

  it("ranks a reasoning-capable model first for the deep tier", () => {
    expect(catalogue.deep[0]?.model).toBe("fixture-deep");
    expect(catalogue.deep[0]?.reasoningEfforts).toEqual(["low", "high"]);
  });

  it("treats local backends as free and unpriced cloud models as unknown", () => {
    const all = [...catalogue.fast, ...catalogue.deep];
    expect(all.find((c) => c.model === "fixture-local")?.costClass).toBe("free");
    expect(all.find((c) => c.model === "fixture-unpriced")?.costClass).toBe("unknown");
  });

  it("never ranks an unknown price as if it were free", () => {
    const cheapFirst = catalogue.fast.map((c) => c.costClass);
    expect(cheapFirst.indexOf("unknown")).toBeGreaterThan(cheapFirst.indexOf("cheap"));
  });

  it("carries published prices through to the candidate", () => {
    expect(catalogue.deep[0]).toMatchObject({ promptPerMTok: 3, completionPerMTok: 15 });
  });

  it("reports an empty catalogue when no backend answers", () => {
    const empty = buildCatalogueFromModels([], { now: () => 1 });
    expect(empty.fast).toEqual([]);
    expect(empty.deep).toEqual([]);
  });
});

describe("buildVoiceCatalogue", () => {
  it("uses the injected probe and does not cache it", async () => {
    resetVoiceCatalogueCache();
    let calls = 0;
    const options = {
      config: loadConfig(),
      listModels: async () => {
        calls += 1;
        return FIXTURES;
      },
    };
    const first = await buildVoiceCatalogue(options);
    const second = await buildVoiceCatalogue(options);
    expect(calls).toBe(2);
    expect(first.fast.map((c) => c.model)).toContain("fixture-local");
    expect(first.fast.map((c) => c.model)).toContain("fixture-quick");
    expect(second.fast.map((c) => c.model)).toEqual(first.fast.map((c) => c.model));
  });

  it("returns an empty catalogue instead of throwing when the probe fails", async () => {
    resetVoiceCatalogueCache();
    const catalogue = await buildVoiceCatalogue({
      config: loadConfig(),
      listModels: async () => {
        throw new Error("backend down");
      },
    });
    expect(catalogue.fast).toEqual([]);
    expect(catalogue.deep).toEqual([]);
  });
});

describe("effortFor", () => {
  const candidate = buildCatalogueFromModels(FIXTURES, { now: () => 1 }).deep[0]!;

  it("asks for the lowest effort on the fast tier", () => {
    expect(effortFor(candidate, "fast")).toBe("low");
  });

  it("asks for the deepest effort on the deep tier", () => {
    expect(effortFor(candidate, "deep")).toBe("high");
  });

  it("omits effort for models that accept none", () => {
    const plain = buildCatalogueFromModels(FIXTURES, { now: () => 1 }).fast.find(
      (c) => c.model === "fixture-quick",
    )!;
    expect(effortFor(plain, "fast")).toBeUndefined();
  });
});
