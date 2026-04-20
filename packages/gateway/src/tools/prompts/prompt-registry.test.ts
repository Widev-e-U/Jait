import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt-registry.js";
import "./index.js";
import type { Skill } from "../../skills/index.js";

describe("buildSystemPrompt", () => {
  it("includes the shared Jait external provider instructions", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      workspaceRoot: "/tmp/project",
    });

    expect(prompt).toContain("<jaitExternalProvider>");
    expect(prompt).toContain("You are operating inside Jait, a tool-centric coding workspace and gateway.");
    expect(prompt).toContain("Respect Jait workspace boundaries");
    expect(prompt).toContain("use the todo tool even if you are operating through an external or CLI provider");
    expect(prompt).toContain("If the user asks to open, switch, or use a workspace, project, or repo");
    expect(prompt).toContain("attach to an existing local target when available");
    expect(prompt).toContain("If `preview.start` fails, then fall back to opening the localhost URL directly in the browser surface.");
    expect(prompt).toContain("This guidance still applies when you are operating through an external or CLI provider inside Jait.");
    expect(prompt).toContain("You are working in the workspace: /tmp/project");
  });

  it("injects enabled skills into the system prompt", () => {
    const skills: Skill[] = [
      {
        id: "word-docx",
        name: "Word / DOCX",
        description: "Handle DOCX files without formatting drift.",
        filePath: "C:/skills/word-docx/SKILL.md",
        source: "user",
        enabled: true,
      },
    ];

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      workspaceRoot: "/tmp/project",
      skills,
    });

    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("<name>Word / DOCX</name>");
    expect(prompt).toContain("<location>C:/skills/word-docx/SKILL.md</location>");
    expect(prompt).toContain("Use the file.read tool to load a skill's content");
  });

  it("injects response style instructions when requested", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      responseStyle: "caveman",
    });

    expect(prompt).toContain("<responseStyle>");
    expect(prompt).toContain("Write in concise caveman style.");
    expect(prompt).toContain("If the topic is risky, subtle, or confusing, fall back to normal precise prose.");
  });
});
