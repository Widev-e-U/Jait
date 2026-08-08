/**
 * Agent-callable tools for managing skills and extensions (plugins).
 *
 * These let the assistant install/enable/disable skills, install the CLI tools
 * a skill needs, and manage extensions — the same operations available in the
 * Settings UI, exposed to the agent (and over MCP as `mcp__jait__skills_manage`
 * / `mcp__jait__extensions_manage`).
 */

import type { ToolDefinition } from "./contracts.js";
import type { SkillRegistry } from "../skills/index.js";
import { checkSkillTools } from "../skills/index.js";
import {
  installClawHubSkill,
  uninstallClawHubSkill,
  installSkillTool,
  writeUserSkill,
} from "../skills/install.js";
import type { ClawHubClient } from "../clawhub/client.js";
import type { PluginManager } from "../plugins/manager.js";

/* ------------------------------------------------------------------ */
/*  skills.manage                                                       */
/* ------------------------------------------------------------------ */

type SkillsAction =
  | "list"
  | "search"
  | "install"
  | "uninstall"
  | "enable"
  | "disable"
  | "install_tool"
  | "create";

interface SkillsManageInput {
  action: SkillsAction;
  /** Skill id/slug for install/uninstall/enable/disable/install_tool/create. */
  id?: string;
  /** Search query for the `search` action. */
  query?: string;
  /** Optional version for `install`. */
  version?: string;
  /** Optional install-option id for `install_tool`. */
  installId?: string;
  /** Result limit for `search`/`list`. */
  limit?: number;
  /** Display name for `create`. */
  name?: string;
  /** One-line "use this when …" summary for `create`. */
  description?: string;
  /** Markdown instructions for `create`. */
  body?: string;
  /** Allow `create` to replace an existing skill of the same id. */
  overwrite?: boolean;
}

export interface SkillsManageDeps {
  skillRegistry: SkillRegistry;
  clawhub?: ClawHubClient;
}

export function createSkillsManageTool(deps: SkillsManageDeps): ToolDefinition<SkillsManageInput> {
  const { skillRegistry, clawhub } = deps;
  return {
    name: "skills.manage",
    description:
      "Manage skills (specialized instruction sets). Actions: " +
      "`list` installed skills; `search` the ClawHub marketplace; " +
      "`install`/`uninstall` a ClawHub skill by id; `enable`/`disable` an installed skill; " +
      "`install_tool` to install a CLI tool a skill requires (npm); " +
      "`create` to write a new skill yourself from what you just worked out — pass `id`, " +
      "`name`, `description` (a \"use this when …\" line) and `body` (markdown instructions). " +
      "Use this to set up skills the user asks for, and to record know-how worth reusing.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "always",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The operation to perform.",
          enum: ["list", "search", "install", "uninstall", "enable", "disable", "install_tool", "create"],
        },
        id: { type: "string", description: "Skill id/slug (for install/uninstall/enable/disable/install_tool/create)." },
        query: { type: "string", description: "Search query (for `search`)." },
        version: { type: "string", description: "Optional version to install." },
        installId: { type: "string", description: "Optional install-option id (for `install_tool`)." },
        limit: { type: "number", description: "Max results for search/list (default 25)." },
        name: { type: "string", description: "Display name (for `create`)." },
        description: { type: "string", description: "One-line \"use this when …\" summary (for `create`)." },
        body: { type: "string", description: "Markdown instructions the skill teaches (for `create`)." },
        overwrite: { type: "boolean", description: "Replace an existing skill of the same id (for `create`)." },
      },
      required: ["action"],
    },
    async execute(input) {
      const action = input.action;
      try {
        switch (action) {
          case "list": {
            const skills = skillRegistry.list().map((s) => {
              const tools = checkSkillTools(s);
              return {
                id: s.id,
                name: s.name,
                enabled: s.enabled,
                source: s.source,
                description: s.description,
                ...(s.requires ? { requires: s.requires } : {}),
                toolsSatisfied: tools.satisfied,
                ...(tools.missing.length ? { missingTools: tools.missing } : {}),
              };
            });
            return {
              ok: true,
              message: `${skills.length} skill(s) installed, ${skills.filter((s) => s.enabled).length} enabled.`,
              data: { skills },
            };
          }

          case "search": {
            if (!clawhub) return { ok: false, message: "ClawHub marketplace is not available." };
            if (!input.query?.trim()) return { ok: false, message: "A `query` is required for search." };
            const installed = new Set(skillRegistry.list().map((s) => s.id));
            const results = (await clawhub.searchSkills(input.query, Math.min(input.limit ?? 25, 100)))
              .map((r) => ({
                slug: r.slug,
                name: r.displayName ?? r.slug,
                summary: r.summary ?? undefined,
                installed: installed.has(r.slug ?? ""),
              }));
            return { ok: true, message: `Found ${results.length} skill(s) on ClawHub.`, data: { results } };
          }

          case "install": {
            if (!clawhub) return { ok: false, message: "ClawHub marketplace is not available." };
            if (!input.id?.trim()) return { ok: false, message: "An `id` (skill slug) is required." };
            const skill = await installClawHubSkill({ clawhub, skillRegistry, slug: input.id, version: input.version });
            return { ok: true, message: `Installed skill '${skill.name}'. Enable it to make it active.`, data: { skill } };
          }

          case "uninstall": {
            if (!input.id?.trim()) return { ok: false, message: "An `id` (skill slug) is required." };
            await uninstallClawHubSkill({ skillRegistry, slug: input.id });
            return { ok: true, message: `Uninstalled skill '${input.id}'.` };
          }

          case "enable":
          case "disable": {
            if (!input.id?.trim()) return { ok: false, message: "An `id` is required." };
            const skill = skillRegistry.get(input.id);
            if (!skill) return { ok: false, message: `Skill '${input.id}' not found.` };
            skillRegistry.setEnabled(input.id, action === "enable");
            return { ok: true, message: `${action === "enable" ? "Enabled" : "Disabled"} skill '${skill.name}'.` };
          }

          case "create": {
            const name = input.name?.trim();
            const description = input.description?.trim();
            const body = input.body?.trim();
            if (!name) return { ok: false, message: "A `name` is required." };
            if (!description) return { ok: false, message: "A `description` is required — it is how you find the skill later." };
            if (!body) return { ok: false, message: "A `body` is required — the instructions the skill teaches." };

            const written = await writeUserSkill({
              skillRegistry,
              id: input.id?.trim() || name,
              name,
              description,
              body,
              overwrite: input.overwrite === true,
            });
            return {
              ok: true,
              message: `${written.created ? "Wrote" : "Replaced"} skill '${written.id}' — active from the next turn.`,
              data: written,
            };
          }

          case "install_tool": {
            if (!input.id?.trim()) return { ok: false, message: "An `id` (skill id) is required." };
            const skill = skillRegistry.get(input.id);
            if (!skill) return { ok: false, message: `Skill '${input.id}' not found.` };
            const result = await installSkillTool({ skill, installId: input.installId });
            return {
              ok: true,
              message: `Installed tool '${result.package}' for skill '${skill.name}'.`,
              data: { package: result.package, output: result.output },
            };
          }

          default:
            return { ok: false, message: `Unknown action '${action as string}'.` };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `skills.${action} failed: ${msg}` };
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/*  extensions.manage                                                   */
/* ------------------------------------------------------------------ */

type ExtensionsAction = "list" | "enable" | "disable" | "uninstall" | "scan" | "search";

interface ExtensionsManageInput {
  action: ExtensionsAction;
  /** Plugin id (for enable/disable/uninstall). */
  id?: string;
  /** Result limit for `search`. */
  limit?: number;
}

export interface ExtensionsManageDeps {
  pluginManager: PluginManager;
  clawhub?: ClawHubClient;
}

export function createExtensionsManageTool(deps: ExtensionsManageDeps): ToolDefinition<ExtensionsManageInput> {
  const { pluginManager, clawhub } = deps;
  return {
    name: "extensions.manage",
    description:
      "Manage extensions (plugins, including OpenClaw-format channel/tool plugins). Actions: " +
      "`list` installed extensions; `scan` the extensions directory for new ones; " +
      "`enable`/`disable`/`uninstall` an extension by id; `search` the ClawHub plugin marketplace. " +
      "Note: extensions are installed by placing them in ~/.jait/extensions/ then running `scan`.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    risk: "high",
    defaultConsentLevel: "always",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "The operation to perform.",
          enum: ["list", "enable", "disable", "uninstall", "scan", "search"],
        },
        id: { type: "string", description: "Extension/plugin id (for enable/disable/uninstall)." },
        limit: { type: "number", description: "Max results for `search` (default 25)." },
      },
      required: ["action"],
    },
    async execute(input) {
      const action = input.action;
      try {
        switch (action) {
          case "list": {
            const plugins = pluginManager.listInstalled().map((p) => ({
              id: p.id,
              displayName: p.displayName,
              version: p.version,
              status: p.status,
              ...(p.error ? { error: p.error } : {}),
            }));
            return { ok: true, message: `${plugins.length} extension(s) installed.`, data: { plugins } };
          }

          case "scan": {
            await pluginManager.syncAndLoad();
            const plugins = pluginManager.listInstalled();
            return { ok: true, message: `Scan complete — ${plugins.length} extension(s) known.`, data: { plugins } };
          }

          case "enable": {
            if (!input.id?.trim()) return { ok: false, message: "An `id` is required." };
            const result = await pluginManager.enable(input.id);
            const msg = result.status === "error"
              ? `Extension '${input.id}' enabled but failed to load: ${result.error ?? "unknown error"}`
              : `Enabled extension '${result.displayName}'.`;
            return { ok: result.status !== "error", message: msg, data: { plugin: result } };
          }

          case "disable": {
            if (!input.id?.trim()) return { ok: false, message: "An `id` is required." };
            const result = await pluginManager.disable(input.id);
            return { ok: true, message: `Disabled extension '${result.displayName}'.`, data: { plugin: result } };
          }

          case "uninstall": {
            if (!input.id?.trim()) return { ok: false, message: "An `id` is required." };
            await pluginManager.uninstall(input.id);
            return { ok: true, message: `Uninstalled extension '${input.id}'.` };
          }

          case "search": {
            if (!clawhub) return { ok: false, message: "ClawHub marketplace is not available." };
            const items = await clawhub.listPackages({ limit: Math.min(input.limit ?? 25, 100) });
            return { ok: true, message: `Found ${items.length} plugin(s) on ClawHub.`, data: { items } };
          }

          default:
            return { ok: false, message: `Unknown action '${action as string}'.` };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, message: `extensions.${action} failed: ${msg}` };
      }
    },
  };
}
