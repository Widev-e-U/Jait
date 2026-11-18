import { describe, expect, it } from "vitest";
import { formatSkillsForPrompt } from "../skills/index.js";
import { mapCodexNotification } from "../providers/codex-event-mapper.js";
import { mcpContentForToolResult } from "../routes/mcp-server.js";
import { createJaitCatalogTool } from "./catalog-tools.js";
import { ToolRegistry } from "./registry.js";

describe("discovery-first context overhead regressions", () => {
  it("does not paste the installed skill catalog into the bootstrap", () => {
    const skills = Array.from({ length: 72 }, (_, i) => ({
      id: `skill-${i}`, name: `Installed skill ${i}`, description: "Unrelated installed instructions".repeat(8),
      filePath: `/private/installed/skill-${i}/SKILL.md`, source: "user" as const, enabled: true,
    }));
    const prompt = formatSkillsForPrompt(skills);
    expect(prompt).toContain("skills.search");
    expect(prompt.length).toBeLessThan(700);
    expect(prompt).not.toContain("/private/installed");
    expect(prompt).not.toContain("Installed skill 71");
  });

  it("keeps the catalog overview small without loading schemas", async () => {
    const registry = new ToolRegistry();
    const catalog = createJaitCatalogTool(registry);
    registry.register(catalog);
    const result = await catalog.execute({}, { sessionId: "audit", actionId: "overview", projectRoot: ".", requestedBy: "test" });
    expect(JSON.stringify(result).length).toBeLessThan(5000);
    expect((result.data as any).matches).toEqual([]);
  });

  it("does not send terminal UI echoes to MCP model context", () => {
    const result = { ok: true, message: "Command completed", data: {
      output: "one canonical result", terminalOutput: "plain UI echo", terminalOutputAnsi: "\u001b[31mANSI UI echo",
      exitCode: 0, terminalId: "terminal-1",
    } };
    const text = (mcpContentForToolResult(result)[0] as { text: string }).text;
    expect(text).toContain("one canonical result");
    expect(text).not.toContain("UI echo");
    expect(result.data.terminalOutputAnsi).toContain("ANSI");
  });

  it("keeps oversized MCP envelopes valid JSON with an explicit truncation signal", () => {
    const text = (mcpContentForToolResult({ ok: true, message: "Large result", data: {
      evidence: '🦀"\\'.repeat(30_000), exitCode: 0,
    } })[0] as { text: string }).text;
    expect(text.length).toBeLessThanOrEqual(30_000);
    const data = JSON.parse(text.slice(text.indexOf("{")));
    expect(data.truncated).toBe(true);
  });

  it("captures actual input and cache counters instead of ignoring Codex usage", () => {
    const events = mapCodexNotification("thread/tokenUsage/updated", { threadId: "provider-session", tokenUsage: {
      total: { inputTokens: 188328, cachedInputTokens: 157184, outputTokens: 797, totalTokens: 189125 },
      last: { inputTokens: 26210, cachedInputTokens: 7168, outputTokens: 62, totalTokens: 26272 },
    } }, "provider-session");
    expect(events).toEqual([expect.objectContaining({ type: "usage", usage: expect.objectContaining({
      inputTokens: 188328, cachedInputTokens: 157184, outputTokens: 797, scope: "session",
    }) })]);
  });
});
