/**
 * Plugin manifest schema — mirrors `jait.plugin.json`.
 *
 * Every extension must ship a manifest at the root of its package.
 * The loader resolves the manifest first and only imports the entry
 * module when the plugin is enabled.
 */

import type { ToolParametersSchema } from "../tools/contracts.js";

/* ------------------------------------------------------------------ */
/*  Manifest types                                                     */
/* ------------------------------------------------------------------ */

/** Activation event that triggers lazy plugin load. */
export type PluginActivationEvent =
  | "*"                        // always active
  | `onTool:${string}`        // when a specific tool is executed
  | `onProvider:${string}`    // when a provider is requested
  | `onCommand:${string}`;   // when a command is invoked

/** Manifest tool declaration (what goes in the JSON file). */
export interface ManifestToolDeclaration {
  name: string;
  description: string;
  parameters?: ToolParametersSchema;
  tier?: "core" | "standard" | "external";
  category?: string;
  risk?: "low" | "medium" | "high";
  consent?: "none" | "once" | "always" | "dangerous";
}

/** Manifest provider declaration. */
export interface ManifestProviderDeclaration {
  id: string;
  displayName: string;
  description?: string;
}

/** The jait.plugin.json file schema. */
export interface PluginManifest {
  /** Unique plugin identifier (npm-style scope ok: `@org/name`). */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** Semver version string. */
  version: string;
  /** Short description shown in the extension store. */
  description?: string;
  /** Author name or org. */
  author?: string;
  /** SPDX license id. */
  license?: string;
  /** Relative path to the ES module entry (default: `index.js`). */
  main?: string;
  /** Minimum gateway version required (semver range). */
  engines?: { gateway?: string };
  /** Activation events — when should this plugin be loaded? */
  activationEvents?: PluginActivationEvent[];
  /** Tools declared by this plugin (statically listed in manifest). */
  contributes?: {
    tools?: ManifestToolDeclaration[];
    providers?: ManifestProviderDeclaration[];
  };
  /** JSON-schema for user-facing configuration. */
  configSchema?: ToolParametersSchema;
  /** Categories for the extension store. */
  categories?: string[];
  /** Keywords for search. */
  keywords?: string[];
  /** URL to a square icon (relative path or https). */
  icon?: string;
  /** Homepage / docs URL. */
  homepage?: string;
  /** Repository URL. */
  repository?: string;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Minimal validation — returns error string or null. */
export function validateManifest(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return "Manifest must be a JSON object";
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id) return "Manifest must have a non-empty 'id'";
  if (typeof m.displayName !== "string" || !m.displayName) return "Manifest must have a non-empty 'displayName'";
  if (typeof m.version !== "string" || !m.version) return "Manifest must have a non-empty 'version'";
  // id format: lowercase alphanumeric, hyphens, dots, and scoped (@org/name)
  if (!/^(@[\w-]+\/)?[\w][\w.-]*$/.test(m.id)) {
    return `Invalid plugin id '${m.id}' — use alphanumeric, hyphens, dots, and optional @scope/`;
  }
  return null;
}
