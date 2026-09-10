import { describe, expect, it } from "vitest";
import { isOllamaUsageResponse } from "./provider-quota-fetchers.js";

describe("provider quota fetchers", () => {
  it("accepts current Ollama session/weekly and monthly response variants", () => {
    expect(
      isOllamaUsageResponse({
        limits: {
          session: { usage: 0.2, models: [] },
          weekly: { usage: 0.4, models: [] },
        },
      }),
    ).toBe(true);
    expect(
      isOllamaUsageResponse({
        limits: { monthly: { usage: 0.6, models: [] } },
      }),
    ).toBe(true);
  });

  it("rejects malformed Ollama usage responses", () => {
    expect(isOllamaUsageResponse({ limits: {} })).toBe(false);
    expect(
      isOllamaUsageResponse({
        limits: { monthly: { usage: "60%", models: [] } },
      }),
    ).toBe(false);
  });
});
