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
import { join, basename, delimiter } from "node:path";
import { homedir } from "node:os";
import { accessSync, constants } from "node:fs";
import { parse as parseYaml } from "yaml";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A CLI tool / dependency a skill needs in order to run. */
export interface SkillInstallSpec {
  /** Stable id for the install option. */
  id?: string;
  /** Install mechanism, e.g. "node" (npm), "brew", "pip". */
  kind?: string;
  /** Package name to install. */
  package?: string;
  /** Executables this install provides. */
  bins?: string[];
  /** Human-readable label for the install action. */
  label?: string;
}

/** Tools a skill requires to be present on the host. */
export interface SkillRequirements {
  /** All of these binaries must be present. */
  bins?: string[];
  /** At least one of these binaries must be present. */
  anyBins?: string[];
}

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
  source: "bundled" | "user" | "project" | "plugin";
  /** Whether the skill is enabled. */
  enabled: boolean;
  /** Tools this skill requires (from frontmatter metadata). */
  requires?: SkillRequirements;
  /** Installable tool options declared by the skill. */
  install?: SkillInstallSpec[];
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  homepage?: string;
  metadata?: Record<string, unknown>;
  requires?: SkillRequirements;
  install?: SkillInstallSpec[];
}

/* ------------------------------------------------------------------ */
/*  Frontmatter parser (minimal YAML subset)                           */
/* ------------------------------------------------------------------ */

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  return out.length > 0 ? out : undefined;
}

/** Recursively locate `requires`/`install` blocks (may be nested under `openclaw`/`jait`). */
function findToolMetadata(node: unknown, depth = 0): { requires?: SkillRequirements; install?: SkillInstallSpec[] } {
  if (!node || typeof node !== "object" || depth > 4) return {};
  const obj = node as Record<string, unknown>;
  const result: { requires?: SkillRequirements; install?: SkillInstallSpec[] } = {};

  const req = obj.requires as Record<string, unknown> | undefined;
  if (req && typeof req === "object") {
    const bins = asStringArray(req.bins);
    const anyBins = asStringArray(req.anyBins);
    if (bins || anyBins) result.requires = { ...(bins ? { bins } : {}), ...(anyBins ? { anyBins } : {}) };
  }

  if (Array.isArray(obj.install)) {
    const specs = obj.install
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
      .map((s) => ({
        ...(typeof s.id === "string" ? { id: s.id } : {}),
        ...(typeof s.kind === "string" ? { kind: s.kind } : {}),
        ...(typeof s.package === "string" ? { package: s.package } : {}),
        ...(asStringArray(s.bins) ? { bins: asStringArray(s.bins) } : {}),
        ...(typeof s.label === "string" ? { label: s.label } : {}),
      }));
    if (specs.length > 0) result.install = specs;
  }

  // Recurse into common wrapper keys (openclaw/jait namespaces) if not yet found.
  if (!result.requires || !result.install) {
    for (const key of Object.keys(obj)) {
      const nested = findToolMetadata(obj[key], depth + 1);
      if (!result.requires && nested.requires) result.requires = nested.requires;
      if (!result.install && nested.install) result.install = nested.install;
    }
  }
  return result;
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Handles the `---` delimited block at the start of the file and extracts
 * name/description/homepage plus any tool `requires`/`install` metadata.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) return {};

  const block = match[1];

  // Prefer a real YAML parse (handles nested metadata, flow + block styles).
  try {
    const parsed = parseYaml(block) as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object") {
      const result: SkillFrontmatter = {};
      if (typeof parsed.name === "string") result.name = parsed.name;
      if (typeof parsed.description === "string") result.description = parsed.description;
      if (typeof parsed.homepage === "string") result.homepage = parsed.homepage;
      if (parsed.metadata && typeof parsed.metadata === "object") {
        result.metadata = parsed.metadata as Record<string, unknown>;
      }
      const tools = findToolMetadata(parsed);
      if (tools.requires) result.requires = tools.requires;
      if (tools.install) result.install = tools.install;
      if (result.name && result.description) return result;
    }
  } catch {
    // Malformed YAML — fall back to the line-based extractor below.
  }

  // Fallback: line-by-line extraction for top-level scalar fields.
  const result: SkillFrontmatter = {};
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
        ...(fm.requires ? { requires: fm.requires } : {}),
        ...(fm.install ? { install: fm.install } : {}),
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
/*  Tool/bin availability                                              */
/* ------------------------------------------------------------------ */

const binCache = new Map<string, boolean>();

/** Drop cached availability for a bin (or all bins) — call after installing tools. */
export function invalidateBinCache(bin?: string): void {
  if (bin) binCache.delete(bin.trim());
  else binCache.clear();
}

/** Whether an executable named `bin` is resolvable on the host PATH. */
export function binExists(bin: string): boolean {
  const name = bin.trim();
  if (!name) return false;
  const cached = binCache.get(name);
  if (cached !== undefined) return cached;

  const isWin = process.platform === "win32";
  const exts = isWin ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  let found = false;
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        accessSync(join(dir, name + ext), constants.X_OK);
        found = true;
        break;
      } catch {
        // not here — keep looking
      }
    }
    if (found) break;
  }
  binCache.set(name, found);
  return found;
}

export interface SkillToolStatus {
  /** True when all required tools are present (or none are required). */
  satisfied: boolean;
  /** Required bins that are missing from the host. */
  missing: string[];
}

/** Resolve which of a skill's required tools are missing on the host. */
export function checkSkillTools(skill: Skill): SkillToolStatus {
  const missing: string[] = [];
  const bins = skill.requires?.bins ?? [];
  for (const bin of bins) {
    if (!binExists(bin)) missing.push(bin);
  }
  const anyBins = skill.requires?.anyBins ?? [];
  if (anyBins.length > 0 && !anyBins.some((b) => binExists(b))) {
    missing.push(...anyBins.filter((b) => !missing.includes(b)));
  }
  return { satisfied: missing.length === 0, missing };
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
    "If the user explicitly invokes a skill by typing a slash command like `/skill-id`, treat that as a request to load and follow that skill's instructions for the turn.",
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
