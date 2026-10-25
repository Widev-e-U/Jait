import { describe, expect, it } from "vitest";
import { resolveToolPermission, type ToolPermission } from "./tool-permissions.js";

describe("browser permission aliases", () => {
  const legacy: ToolPermission = { toolName: "preview.open", consentLevel: "always", risk: "high", description: "Require approval" };
  it("preserves legacy policy for canonical browser calls", () => {
    expect(resolveToolPermission("browser.open", new Map([[legacy.toolName, legacy]]))).toEqual({ ...legacy, toolName: "browser.open", knownTool: true, source: "profile" });
  });
  it("prefers the canonical policy even for a legacy call", () => {
    const canonical = { ...legacy, toolName: "browser.open", consentLevel: "dangerous" as const };
    expect(resolveToolPermission("preview.open", new Map([[legacy.toolName, legacy], [canonical.toolName, canonical]]))).toEqual({ ...canonical, toolName: "preview.open", knownTool: true, source: "profile" });
  });
  it("keeps ordinary and unknown tools scoped to their exact names", () => {
    const permission = { ...legacy, toolName: "file.read" };
    const permissions = new Map([[permission.toolName, permission]]);
    expect(resolveToolPermission("file.read", permissions)).toEqual({ ...permission, knownTool: true, source: "profile" });
    expect(resolveToolPermission("browser.open", permissions)).toMatchObject({ knownTool: false, consentLevel: "dangerous" });
  });
});
