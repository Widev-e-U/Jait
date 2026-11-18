import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Skill, SkillRegistry } from "../skills/index.js";
import type { ToolDefinition } from "./contracts.js";

/** Search installed, enabled skills. Marketplace search remains a separate operation. */
export function searchInstalledSkills(skills: Skill[], query: string, limit = 3) {
  const normalized = query.trim().replace(/^\//, "").toLowerCase();
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return skills.filter(skill => skill.enabled).map(skill => {
    const exact = [skill.id, skill.name].some(s => s.toLowerCase() === normalized);
    const text = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase();
    const score = exact ? 10000 : words.filter(word => text.includes(word)).length;
    return { skill, score };
  }).filter(match => match.score > 0).sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, Math.max(1, Math.min(10, Math.floor(limit) || 3)))
    .map(({ skill }) => ({ id: skill.id, name: skill.name, description: skill.description.slice(0, 180) }));
}

export function createSkillDiscoveryTools(registry: SkillRegistry): ToolDefinition[] {
  return [{
    name: "skills.search", description: "Find installed enabled skills by task or exact skill ID/name. Returns short matches; load selected instructions with skills.read. Does not search the marketplace.",
    category: "meta", tier: "standard", source: "builtin", risk: "low", defaultConsentLevel: "none",
    discovery: { aliases: ["installed skills", "skill instructions", "SKILL.md"] },
    parameters: { type: "object", properties: {
      query: { type: "string", description: "Task description, or exact skill ID/name (slash commands accepted)." },
      limit: { type: "number", description: "Maximum results, default 3, maximum 10." },
    }, required: ["query"] },
    async execute(input: { query: string; limit?: number }) {
      const matches = searchInstalledSkills(registry.listEnabled(), input.query, input.limit);
      return { ok: true, message: `${matches.length} installed skill matches. Use skills.read with an id.`, data: { matches } };
    },
  }, {
    name: "skills.read", description: "Load one installed enabled skill by ID, including its base directory for relative references. Search with skills.search first.",
    category: "meta", tier: "standard", source: "builtin", risk: "low", defaultConsentLevel: "none",
    parameters: { type: "object", properties: { id: { type: "string", description: "Installed skill ID." } }, required: ["id"] },
    async execute(input: { id: string }) {
      const skill = registry.get(input.id);
      if (!skill?.enabled) return { ok: false, message: "Installed enabled skill not found." };
      // The caller supplies an ID, never a filesystem path. Keep path ownership in the registry.
      try {
        const content = await readFile(skill.filePath, "utf8");
        return { ok: true, message: `Loaded skill: ${skill.name}`, data: {
          id: skill.id, baseDirectory: dirname(skill.filePath), content,
        } };
      } catch { return { ok: false, message: "Unable to read the installed skill." }; }
    },
  }];
}
