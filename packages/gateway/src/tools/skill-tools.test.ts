import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

describe("skills.manage create", () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "jait-skill-tool-"));
    previousHome = process.env["HOME"];
    process.env["HOME"] = home;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    await rm(home, { recursive: true, force: true });
  });

  it("writes a skill the assistant authored itself", async () => {
    const reg = new SkillRegistry();
    const tool = createSkillsManageTool({ skillRegistry: reg });

    const res = await tool.execute({
      action: "create",
      id: "weather-warnings",
      name: "Weather Warnings",
      description: "Use when monitoring Austrian weather warnings.",
      body: "Call the GeoSphere API and report the active warnings.",
    }, ctx);

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/wrote skill 'weather-warnings'/i);
    expect(reg.get("weather-warnings")?.enabled).toBe(true);
  });

  it("names the skill after its display name when no id is given", async () => {
    const reg = new SkillRegistry();
    const tool = createSkillsManageTool({ skillRegistry: reg });

    await tool.execute({
      action: "create",
      name: "Fire Department Instagram",
      description: "Use when drafting Instagram posts for the fire department.",
      body: "Write in German, present tense.",
    }, ctx);

    expect(reg.get("fire-department-instagram")).toBeDefined();
  });

  it("insists on the fields that make a skill findable later", async () => {
    const tool = createSkillsManageTool({ skillRegistry: new SkillRegistry() });

    expect((await tool.execute({ action: "create", name: "X", body: "b" }, ctx)).message)
      .toMatch(/description. is required/i);
    expect((await tool.execute({ action: "create", name: "X", description: "d" }, ctx)).message)
      .toMatch(/body. is required/i);
    expect((await tool.execute({ action: "create", description: "d", body: "b" }, ctx)).message)
      .toMatch(/name. is required/i);
  });

  it("reports the refusal to overwrite instead of throwing", async () => {
    const reg = new SkillRegistry();
    const tool = createSkillsManageTool({ skillRegistry: reg });
    const input = { action: "create" as const, id: "notes", name: "Notes", description: "d", body: "b" };
    await tool.execute(input, ctx);

    const second = await tool.execute(input, ctx);

    expect(second.ok).toBe(false);
    expect(second.message).toMatch(/already exists/);
  });
});
