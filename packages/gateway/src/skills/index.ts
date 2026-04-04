/**
 * Skill system — discovery, loading, and prompt injection.
 *
 * Skills are markdown files (SKILL.md) with YAML frontmatter that contain
 * specialized instructions for the LLM. They are injected into the system
 * prompt as an `<available_skills>` block, and the LLM reads the full file
 * via file.read when the task matches the skill's description.
 *
 * Compatible with OpenClaw skill format.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Skill {
  /** Skill identifier (directory name). */
  id: string;
  /** Human-readable name from frontmatter. */
  name: string;
  /** Description from frontmatter — used by LLM to decide when to use it. */
  description: string;
  /** Absolute path to the SKILL.md file. */
  filePath: string;
  /** Source directory. */
  source: "bundled" | "user" | "workspace" | "plugin";
  /** Whether the skill is enabled. */
  enabled: boolean;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  homepage?: string;
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Frontmatter parser (minimal YAML subset)                           */
/* ------------------------------------------------------------------ */

/**
 * Parse YAML frontmatter from a markdown file.
 * Handles the `---` delimited block at the start of the file.
 * Only extracts top-level string fields — enough for name + description.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) return {};

  const block = match[1];
  const result: SkillFrontmatter = {};

  // Simple line-by-line YAML extraction for top-level scalar fields
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
    if (!kv) continue;
    const [, key, value] = kv;
    if (key === "name") result.name = value;
    else if (key === "description") result.description = value;
    else if (key === "homepage") result.homepage = value;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Discovery — scan a directory for SKILL.md files                    */
/* ------------------------------------------------------------------ */

async function scanSkillDir(
  dir: string,
  source: Skill["source"],
): Promise<Skill[]> {
  const skills: Skill[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const skillDir = join(dir, entry);
    const dirStat = await stat(skillDir).catch(() => null);
    if (!dirStat?.isDirectory()) continue;

    const skillPath = join(skillDir, "SKILL.md");
    try {
      const content = await readFile(skillPath, "utf-8");
      const fm = parseFrontmatter(content);

      // Require at least a name and description
      if (!fm.name || !fm.description) continue;

      skills.push({
        id: basename(skillDir),
        name: fm.name,
        description: fm.description,
        filePath: skillPath,
        source,
        enabled: true,
      });
    } catch {
      // No SKILL.md — skip
    }
  }
  return skills;
}

/* ------------------------------------------------------------------ */
/*  Default paths                                                      */
/* ------------------------------------------------------------------ */

/** User-level skills directory: ~/.jait/skills/ */
export function userSkillsDir(): string {
  return join(homedir(), ".jait", "skills");
}

/* ------------------------------------------------------------------ */
/*  Skill Registry (in-memory)                                         */
/* ------------------------------------------------------------------ */

export class SkillRegistry {
  private skills = new Map<string, Skill>();

  /** Discover skills from multiple directories. Later sources override earlier. */
  async discover(dirs: { path: string; source: Skill["source"] }[]): Promise<void> {
    for (const { path, source } of dirs) {
      const found = await scanSkillDir(path, source);
      for (const skill of found) {
        this.skills.set(skill.id, skill);
      }
    }
  }

  /** Add a single skill (e.g., from a plugin). */
  add(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /** List all discovered skills. */
  list(): Skill[] {
    return [...this.skills.values()];
  }

  /** List only enabled skills. */
  listEnabled(): Skill[] {
    return this.list().filter((s) => s.enabled);
  }

  /** Get a specific skill. */
  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  /** Remove a skill from the registry (e.g., after uninstall). */
  remove(id: string): void {
    this.skills.delete(id);
  }

  /** Enable/disable a skill. */
  setEnabled(id: string, enabled: boolean): void {
    const skill = this.skills.get(id);
    if (skill) skill.enabled = enabled;
  }

  /** Apply an allow-list of enabled skill ids (disable everything else). */
  applyAllowList(enabledIds: string[]): void {
    const allowed = new Set(enabledIds);
    for (const skill of this.skills.values()) {
      skill.enabled = allowed.has(skill.id);
    }
  }

  /** Get the count. */
  get size(): number {
    return this.skills.size;
  }
}

/* ------------------------------------------------------------------ */
/*  Prompt formatting — builds the XML block for the system prompt     */
/* ------------------------------------------------------------------ */

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format skills into an XML block for the system prompt.
 * Compatible with OpenClaw's `<available_skills>` format.
 */
export interface SkillPromptFormatOptions {
  readToolInstruction?: string;
}

export function formatSkillsForPrompt(skills: Skill[], options: SkillPromptFormatOptions = {}): string {
  if (skills.length === 0) return "";

  const readToolInstruction = options.readToolInstruction
    ?? "Use the file.read tool to load a skill's content when the task matches its description.";

  const lines = [
    "",
    "",
    "The following skills provide specialized instructions for specific tasks.",
    readToolInstruction,
    "When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.",
    "",
    "<available_skills>",
  ];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
