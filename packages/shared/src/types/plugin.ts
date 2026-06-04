/** Shared plugin/extension types used by both gateway and frontend. */

export type PluginStatus = "installed" | "enabled" | "disabled" | "error";

export interface PluginInfo {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
  status: PluginStatus;
  config: Record<string, unknown>;
  error?: string;
  installedAt: string;
  updatedAt: string;
}

/** Shared skill types used by both gateway and frontend. */

/** A CLI tool / dependency a skill can install. */
export interface SkillInstallSpec {
  id?: string;
  kind?: string;
  package?: string;
  bins?: string[];
  label?: string;
}

/** Tools a skill requires to be present on the host. */
export interface SkillRequirements {
  bins?: string[];
  anyBins?: string[];
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  filePath: string;
  source: "bundled" | "user" | "project" | "plugin";
  enabled: boolean;
  /** Tools this skill requires (from frontmatter metadata). */
  requires?: SkillRequirements;
  /** Installable tool options declared by the skill. */
  install?: SkillInstallSpec[];
  /** Whether all required tools are present on the host. */
  toolsSatisfied?: boolean;
  /** Required tools that are missing from the host. */
  missingTools?: string[];
}

/** ClawHub marketplace — skill listing returned by browse/search. */

export interface ClawHubSkillListing {
  slug: string;
  displayName: string;
  summary?: string | null;
  version?: string | null;
  author?: string | null;
  stars?: number;
  downloads?: number;
  updatedAt?: number;
  highlighted?: boolean;
  official?: boolean;
  installed?: boolean;
}

/** ClawHub marketplace — package (plugin) listing. */

export interface ClawHubPackageListing {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  type?: string;
  author?: string;
  downloads?: number;
}
