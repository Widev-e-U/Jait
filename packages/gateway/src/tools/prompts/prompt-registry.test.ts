import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
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
      projectRoot: "/tmp/project",
    });

    expect(prompt).toContain("<jaitExternalProvider>");
    expect(prompt).toContain("You are operating inside Jait, a tool-centric coding project and gateway.");
    expect(prompt).toContain("Prefer Jait tools as the primary way to act.");
    expect(prompt).toContain("use that tool before falling back to provider-native shell commands or generic tools");
    expect(prompt).toContain("discover it first with the available tool discovery mechanism");
    expect(prompt).toContain("Respect Jait project boundaries");
    expect(prompt).toContain("use the todo tool even if you are operating through an external or CLI provider");
    expect(prompt).toContain("first discover and use Jait memory or prior session search tools");
    expect(prompt).toContain("If the user asks to open, switch, or use a project or repo");
    expect(prompt).toContain("attach to an existing local target when available");
    expect(prompt).toContain("The live preview is a controllable browser session.");
    expect(prompt).toContain("use `preview.inspect`, `preview.status`, and `browser.*` tools");
    expect(prompt).toContain("Do not tell the user that browser tools cannot control the previewed browser unless a tool call fails");
    expect(prompt).toContain("If `preview.open` fails, then fall back to opening the localhost URL directly in the browser surface.");
    expect(prompt).toContain("This guidance still applies when you are operating through an external or CLI provider inside Jait.");
    expect(prompt).toContain("You are working in the project: /tmp/project");
  });

  it("keeps local model prompts compact", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      backend: "ollama",
    }, {
      projectRoot: "/tmp/project",
      backend: "ollama",
    });

    expect(prompt).not.toContain("<jaitExternalProvider>");
    expect(prompt).not.toContain("You are operating inside Jait, a tool-centric coding project.");
    expect(prompt).toContain("Use Markdown in responses. Wrap filenames and symbols in backticks.");
    expect(prompt).toContain("Project: /tmp/project");
  });


  it("includes structured user-question guidance", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    });

    expect(prompt).toContain("<userQuestionInstructions>");
    expect(prompt).toContain("user.ask tool");
    expect(prompt).toContain("instead of ending your turn with a plain-text question");
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
      projectRoot: "/tmp/project",
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

  it("injects global SOUL instructions from JAIT_SOUL_PATH", () => {
    const originalSoulPath = process.env["JAIT_SOUL_PATH"];
    const originalGlobalPath = process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"];
    const dir = mkdtempSync(join(tmpdir(), "jait-soul-"));
    const soulPath = join(dir, "SOUL.md");
    writeFileSync(soulPath, "Always use chat.traces before memory.search for Jait chat IDs.");

    try {
      process.env["JAIT_SOUL_PATH"] = soulPath;
      delete process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"];

      const prompt = buildSystemPrompt("agent", {
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
      });

      expect(prompt).toContain("<globalJaitInstructions>");
      expect(prompt).toContain("Always use chat.traces before memory.search for Jait chat IDs.");
    } finally {
      if (originalSoulPath === undefined) delete process.env["JAIT_SOUL_PATH"];
      else process.env["JAIT_SOUL_PATH"] = originalSoulPath;

      if (originalGlobalPath === undefined) delete process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"];
      else process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"] = originalGlobalPath;

      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not inject the skill evaluation appendix", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
    });

    expect(prompt).not.toContain("<skill-evaluation>");
    expect(prompt).not.toContain("Always evaluate whether the requested work should become a reusable skill.");
  });

  it("gives GLM (internal Jait provider) the full tool-rich prompt WITHOUT the external-provider block", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "zhipu/glm-4.6",
      baseUrl: "https://openrouter.ai/api/v1",
    }, {
      projectRoot: "/tmp/project",
    });

    // GLM runs natively inside Jait's agent loop (Jait tools registered
    // directly) — it is NOT an external CLI provider, so it must NOT get the
    // <jaitExternalProvider> steering block.
    expect(prompt).not.toContain("<jaitExternalProvider>");
    expect(prompt).not.toContain("You are operating inside Jait, a tool-centric coding project and gateway.");
    expect(prompt).not.toContain("Prefer Jait tools as the primary way to act.");
    // It still gets identity + safety (internal provider keeps the wrapper shell).
    expect(prompt).toContain("Your name is Jait");
    expect(prompt).toContain("Follow the user's requirements carefully");
    // Core instructions + keep-going contract
    expect(prompt).toContain("You are a highly sophisticated automated coding agent");
    expect(prompt).toContain("keep going until the user's query is completely resolved");
    // Explicit tool-call format discipline (GLM-specific block)
    expect(prompt).toContain("<toolCallFormat>");
    expect(prompt).toContain("NEVER write tool names, function signatures, or JSON arguments as plain text");
    // Shared sections — including the tools.search discovery mechanism so the
    // model can find the search tool and other Jait tools.
    expect(prompt).toContain("<toolUseInstructions>");
    expect(prompt).toContain("Additional tools (browser, preview, memory, prior session search, cron, SSH, screen sharing, network scanning, and more) can be discovered at any time by calling tools.search with a keyword");
    expect(prompt).toContain("<searchInstructions>");
    expect(prompt).toContain("<editingInstructions>");
    expect(prompt).toContain("<taskTracking>");
    // Project context injection
    expect(prompt).toContain("You are working in the project: /tmp/project");
  });


  it("GLM prompt includes structured user-question guidance", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "zhipu/glm-4.6",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    expect(prompt).toContain("<userQuestionInstructions>");
    expect(prompt).toContain("Use user.ask when:");
  });

  it("resolves bare glm-* model ids (BigModel OpenAI-compatible API)", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "glm-4.5",
      baseUrl: "https://open.bigmodel.cn/api/v1",
    });

    // Same internal-provider treatment: tool-rich prompt, no external block.
    expect(prompt).not.toContain("<jaitExternalProvider>");
    expect(prompt).toContain("<toolCallFormat>");
    expect(prompt).toContain("keep going until the user's query is completely resolved");
    expect(prompt).toContain("calling tools.search with a keyword");
  });
});
