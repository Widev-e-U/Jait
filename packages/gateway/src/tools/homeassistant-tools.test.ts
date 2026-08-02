import { afterEach, describe, expect, it, vi } from "vitest";
import { createHomeAssistantStatesTool } from "./homeassistant-tools.js";
import type { ToolContext } from "./contracts.js";

function context(apiKeys: Record<string, string>): ToolContext {
  return {
    userId: "u1",
    sessionId: "s1",
    apiKeys,
    signal: new AbortController().signal,
  } as ToolContext;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["HA_URL"];
  delete process.env["HA_TOKEN"];
  delete process.env["HASS_URL"];
  delete process.env["HASS_TOKEN"];
});

describe("Home Assistant tools", () => {
  it("uses the HA_URL and HA_TOKEN names exposed by Settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      entity_id: "person.alice",
      state: "home",
      attributes: { friendly_name: "Alice" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createHomeAssistantStatesTool().execute(
      { entity_id: "person.alice" },
      context({ HA_URL: "http://homeassistant.local:8123/", HA_TOKEN: "secret-token" }),
    );

    expect(result).toEqual(expect.objectContaining({ ok: true, message: "person.alice = home" }));
    expect(fetchMock).toHaveBeenCalledWith(
      "http://homeassistant.local:8123/api/states/person.alice",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
      }),
    );
  });

  it("keeps legacy HASS_URL and HASS_TOKEN environment support", async () => {
    process.env["HASS_URL"] = "http://legacy-ha:8123";
    process.env["HASS_TOKEN"] = "legacy-token";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));

    const result = await createHomeAssistantStatesTool().execute({}, context({}));

    expect(result).toEqual(expect.objectContaining({ ok: true, message: "Fetched 0 entities from Home Assistant." }));
  });

  it("returns a settings-oriented error when credentials are missing", async () => {
    const result = await createHomeAssistantStatesTool().execute({}, context({}));
    expect(result).toEqual({ ok: false, message: "Home Assistant URL not configured. Set HA_URL in Settings → API keys." });
  });
});
