import { describe, expect, it } from "vitest";
import { extendProfile, getProfile, listProfiles, serializeProfile, type ProfileName } from "./tool-profiles.js";

describe("tool profiles", () => {
  it("lists exactly the shipped profile names", () => {
    expect(listProfiles()).toEqual(["minimal", "coding", "full"]);
  });

  it("rejects an unknown profile name instead of returning an empty map", () => {
    // A typo in settings must fail loudly: an empty permission map would look
    // like a profile that allows nothing and silently block every tool.
    expect(() => getProfile("yolo" as ProfileName)).toThrow("Unknown profile: yolo");
    expect(() => serializeProfile("nope" as ProfileName)).toThrow("Unknown profile: nope");
  });

  it("serializes a profile into ordered permissions that survive a round trip", () => {
    const serialized = serializeProfile("minimal");

    expect(serialized.name).toBe("minimal");
    expect(serialized.permissions.length).toBeGreaterThan(0);
    expect(serialized.permissions).toEqual([...getProfile("minimal").values()]);
  });

  it("lets overrides change permissions on a copy of the base profile", () => {
    const before = getProfile("minimal").size;
    const extended = extendProfile("minimal", [{ toolName: "custom.tool", permission: "allow", risk: "low" }]);

    expect(extended.get("custom.tool")).toMatchObject({ toolName: "custom.tool", permission: "allow" });
    expect(getProfile("minimal").size).toBe(before);
  });
});
