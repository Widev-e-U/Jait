import { describe, expect, it } from "vitest";
import { SkillRegistry } from "../skills/index.js";
import { createSkillsManageTool, createExtensionsManageTool } from "./skill-tools.js";
import type { PluginManager } from "../plugins/manager.js";
import type { ToolContext } from "./contracts.js";

const ctx = {} as ToolContext;

function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}

describe("skills.manage tool", () => {
  it("lists installed skills", async () => {
    const tool = createSkillsManageTool({ skillRegistry: registryWithOneSkill() });
    const res = await tool.execute({ action: "list" }, ctx);
    expect(res.ok).toBe(true);
    expect((res.data as { skills: unknown[] }).skills).toHaveLength(1);
  });

  it("enables and disables a skill", async () => {
    const reg = registryWithOneSkill();
    const tool = createSkillsManageTool({ skillRegistry: reg });
    const enabled = await tool.execute({ action: "enable", id: "deep-research" }, ctx);
    expect(enabled.ok).toBe(true);
    expect(reg.get("deep-research")?.enabled).toBe(true);
    await tool.execute({ action: "disable", id: "deep-research" }, ctx);
    expect(reg.get("deep-research")?.enabled).toBe(false);
  });

  it("reports a clear error for an unknown skill", async () => {
    const tool = createSkillsManageTool({ skillRegistry: registryWithOneSkill() });
    const res = await tool.execute({ action: "enable", id: "nope" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("not found");
  });

  it("requires a query for search and a marketplace client", async () => {
    const tool = createSkillsManageTool({ skillRegistry: registryWithOneSkill() });
    const res = await tool.execute({ action: "search" }, ctx);
    expect(res.ok).toBe(false);
  });
});

describe("extensions.manage tool", () => {
  it("lists installed extensions via the plugin manager", async () => {
    const fakeManager = {
      listInstalled: () => [
        { id: "openclaw:whatsapp", displayName: "whatsapp", version: "0.0.0", status: "installed" },
      ],
    } as unknown as PluginManager;
    const tool = createExtensionsManageTool({ pluginManager: fakeManager });
    const res = await tool.execute({ action: "list" }, ctx);
    expect(res.ok).toBe(true);
    expect((res.data as { plugins: unknown[] }).plugins).toHaveLength(1);
  });

  it("surfaces load errors when enabling fails", async () => {
    const fakeManager = {
      enable: async () => ({ id: "x", displayName: "X", status: "error", error: "missing dep" }),
    } as unknown as PluginManager;
    const tool = createExtensionsManageTool({ pluginManager: fakeManager });
    const res = await tool.execute({ action: "enable", id: "x" }, ctx);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("missing dep");
  });
});
