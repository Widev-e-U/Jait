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

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  filePath: string;
  source: "bundled" | "user" | "workspace" | "plugin";
  enabled: boolean;
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
