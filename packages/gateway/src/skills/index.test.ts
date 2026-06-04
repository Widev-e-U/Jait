import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./index.js";

describe("parseFrontmatter", () => {
  it("extracts name and description from simple frontmatter", () => {
    const fm = parseFrontmatter(["---", "name: Word / DOCX", "description: Handle DOCX files.", "---", "body"].join("\n"));
    expect(fm.name).toBe("Word / DOCX");
    expect(fm.description).toBe("Handle DOCX files.");
  });

  it("extracts requires/install from nested openclaw-style metadata", () => {
    const content = [
      "---",
      "name: coding-agent",
      'description: "Delegate coding work to background workers."',
      "metadata:",
      "  openclaw:",
      "    requires:",
      '      anyBins: ["claude", "codex"]',
      "    install:",
      "      - id: node-claude",
      "        kind: node",
      "        package: \"@anthropic-ai/claude-code\"",
      '        bins: ["claude"]',
      "        label: Install Claude Code CLI",
      "---",
      "body",
    ].join("\n");

    const fm = parseFrontmatter(content);
    expect(fm.name).toBe("coding-agent");
    expect(fm.requires?.anyBins).toEqual(["claude", "codex"]);
    expect(fm.install?.[0]).toMatchObject({
      id: "node-claude",
      kind: "node",
      package: "@anthropic-ai/claude-code",
      bins: ["claude"],
      label: "Install Claude Code CLI",
    });
  });

  it("falls back to line parsing on malformed YAML", () => {
    const fm = parseFrontmatter(["---", "name: Plain", "description: A skill", "  : broken", "---"].join("\n"));
    expect(fm.name).toBe("Plain");
    expect(fm.description).toBe("A skill");
  });
});
