import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { executeVoiceTool } from "./tools.js";
const originalFetch = globalThis.fetch;
describe("voice location lookup", () => {
  afterEach(() => { globalThis.fetch = originalFetch; });
  it("resolves an approximate location from the lookup response", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ city: "Oslo", region: "Oslo", country_name: "Norway", latitude: 59.9, longitude: 10.7 }), { status: 200 })) as typeof fetch;
    const result = await executeVoiceTool("get_location", {}, { config: loadConfig(), userApiKeys: { JAIT_LOCATION: "", LOCATION: "" } });
    expect(JSON.parse(result)).toMatchObject({ city: "Oslo", country: "Norway", latitude: 59.9, source: "ip" });
  });

});
