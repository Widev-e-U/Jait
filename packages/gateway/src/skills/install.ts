/**
 * Shared skill install/uninstall + tool-install logic.
 *
 * Used by both the REST routes (routes/store.ts, routes/skills.ts) and the
 * agent-callable tools (tools/skill-tools.ts) so there is a single source of
 * truth for "install a skill" and "install the tools a skill needs".
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { rm, readFile, mkdir, writeFile } from "node:fs/promises";
import type { ClawHubClient } from "../clawhub/client.js";
import { extractZip, writeOrigin } from "../clawhub/client.js";
import type { Skill, SkillRegistry } from "./index.js";
import { userSkillsDir, invalidateBinCache } from "./index.js";

const REGISTRY_URL = process.env.CLAWHUB_REGISTRY ?? "https://clawhub.ai";

export interface InstalledSkillSummary {
  id: string;
  name: string;
  description?: string;
  source: string;
  enabled: boolean;
}

/** Download a ClawHub skill, extract it to the user skills dir, and register it. */
export async function installClawHubSkill(params: {
  clawhub: ClawHubClient;
  skillRegistry: SkillRegistry;
  slug: string;
  version?: string;
}): Promise<InstalledSkillSummary> {
  const { clawhub, skillRegistry, slug } = params;

  const detail = await clawhub.getSkill(slug);
  const version = params.version ?? detail.latestVersion?.version;
  if (!version) throw new Error(`No version found for skill '${slug}'`);

  const zipBuffer = await clawhub.downloadSkill(slug, version);
  const skillDir = join(userSkillsDir(), slug);
  await extractZip(zipBuffer, skillDir);
  await writeOrigin(skillDir, {
    slug,
    version,
    registry: REGISTRY_URL,
    installedAt: Date.now(),
  });

  // Re-discover so the new skill appears in the registry.
  await skillRegistry.discover([{ path: userSkillsDir(), source: "user" }]);

  const installed = skillRegistry.get(slug);
  return installed
    ? {
        id: installed.id,
        name: installed.name,
        description: installed.description,
        source: installed.source,
        enabled: installed.enabled,
      }
    : { id: slug, name: detail.skill?.displayName ?? slug, source: "user", enabled: true };
}

/** Remove a ClawHub-installed skill (verifies origin metadata first). */
export async function uninstallClawHubSkill(params: {
  skillRegistry: SkillRegistry;
  slug: string;
}): Promise<void> {
  const { skillRegistry, slug } = params;
  const skillDir = join(userSkillsDir(), slug);

  const originPath = join(skillDir, ".clawhub", "origin.json");
  try {
    await readFile(originPath, "utf-8");
  } catch {
    throw new Error("Skill is not a ClawHub-installed skill (no origin metadata)");
  }

  await rm(skillDir, { recursive: true, force: true });
  skillRegistry.remove(slug);
}

/**
 * Slug a skill id into something safe to use as a directory name.
 *
 * The id becomes a path under the user's skills directory, so anything that
 * could climb out of it (slashes, dots, absolute paths) is stripped rather than
 * escaped — a skill called "../../etc" is a bug, not a filename to honour.
 */
export function slugifySkillId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Render a SKILL.md with the frontmatter the discovery scanner requires. */
export function renderSkillMarkdown(params: { name: string; description: string; body: string }): string {
  // Quoted scalars: a description ending in a colon or containing one would
  // otherwise be read as a nested mapping and the skill would be skipped for
  // having no description.
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
  return [
    "---",
    `name: "${escape(params.name)}"`,
    `description: "${escape(params.description)}"`,
    "---",
    "",
    params.body.trim(),
    "",
  ].join("\n");
}

export interface WrittenSkillSummary {
  id: string;
  name: string;
  filePath: string;
  created: boolean;
}

/**
 * Write a skill the assistant authored itself into the user's skills directory
 * and re-discover so it is usable in the very next turn.
 *
 * Refuses to clobber by default: skills accumulate knowledge, and silently
 * replacing one that took a conversation to get right is a real loss.
 */
export async function writeUserSkill(params: {
  skillRegistry: SkillRegistry;
  id: string;
  name: string;
  description: string;
  body: string;
  overwrite?: boolean;
}): Promise<WrittenSkillSummary> {
  const id = slugifySkillId(params.id);
  if (!id) throw new Error(`'${params.id}' does not make a usable skill id`);

  const skillDir = join(userSkillsDir(), id);
  const filePath = join(skillDir, "SKILL.md");
  const existed = await readFile(filePath, "utf-8").then(() => true).catch(() => false);
  if (existed && !params.overwrite) {
    throw new Error(`Skill '${id}' already exists — pass overwrite to replace it`);
  }

  await mkdir(skillDir, { recursive: true });
  await writeFile(
    filePath,
    renderSkillMarkdown({ name: params.name, description: params.description, body: params.body }),
    "utf-8",
  );

  await params.skillRegistry.discover([{ path: userSkillsDir(), source: "user" }]);
  return { id, name: params.name, filePath, created: !existed };
}

export interface SkillToolInstallResult {
  ok: true;
  package: string;
  output: string;
}

/**
 * Install a tool a skill declares it needs.
 * Currently supports `kind: "node"` specs via `npm install -g <package>`.
 */
export async function installSkillTool(params: {
  skill: Skill;
  installId?: string;
}): Promise<SkillToolInstallResult> {
  const specs = params.skill.install ?? [];
  const spec = params.installId
    ? specs.find((s) => s.id === params.installId)
    : specs[0];
  if (!spec) throw new Error("No matching install option for this skill");

  if (spec.kind !== "node" || !spec.package) {
    throw new Error(
      `Unsupported install kind "${spec.kind ?? "unknown"}". Install required tools manually: ${
        (spec.bins ?? []).join(", ") || spec.package || "see skill docs"
      }`,
    );
  }

  const pkg = spec.package;
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("npm", ["install", "-g", pkg], { shell: false });
    let out = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("npm install timed out after 180s"));
    }, 180_000);
    child.stdout?.on("data", (d) => { out += d.toString(); });
    child.stderr?.on("data", (d) => { out += d.toString(); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`npm install exited with code ${code}\n${out.slice(-2000)}`));
    });
  });

  // Drop cached bin availability so the new tool is re-detected.
  invalidateBinCache();
  return { ok: true, package: pkg, output: output.slice(-4000) };
}
