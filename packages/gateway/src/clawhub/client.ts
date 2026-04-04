/**
 * ClawHub API client.
 *
 * Talks to the public ClawHub v1 API (clawhub.ai) to browse,
 * search, and download skills and packages.
 *
 * All read endpoints are public — no auth required.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_REGISTRY = "https://clawhub.ai";
const USER_AGENT = "Jait/1.0";

/* ------------------------------------------------------------------ */
/*  Response types (kept loose to tolerate API drift)                   */
/* ------------------------------------------------------------------ */

export interface ClawHubSearchResult {
  slug?: string;
  displayName?: string;
  summary?: string | null;
  version?: string | null;
  score: number;
  updatedAt?: number;
}

export interface ClawHubSkillListItem {
  slug: string;
  displayName: string;
  summary?: string | null;
  tags?: unknown;
  stats?: {
    downloads?: number;
    stars?: number;
    versions?: number;
    comments?: number;
  };
  createdAt: number;
  updatedAt: number;
  latestVersion?: {
    version: string;
    createdAt: number;
    changelog: string;
  };
}

export interface ClawHubSkillDetail {
  skill: {
    slug: string;
    displayName: string;
    summary?: string | null;
    stats?: { downloads?: number; stars?: number };
  } | null;
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
  } | null;
  owner: {
    handle: string | null;
    displayName?: string | null;
    image?: string | null;
  } | null;
}

export interface ClawHubPackageListItem {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  type?: string;
  author?: string;
  downloads?: number;
}

/* ------------------------------------------------------------------ */
/*  Client                                                              */
/* ------------------------------------------------------------------ */

export class ClawHubClient {
  private baseUrl: string;

  constructor(registryUrl?: string) {
    this.baseUrl = (registryUrl ?? DEFAULT_REGISTRY).replace(/\/+$/, "");
  }

  // ── Skills ──────────────────────────────────────────────────────────

  /** Vector search for skills. */
  async searchSkills(
    query: string,
    limit = 20,
  ): Promise<ClawHubSearchResult[]> {
    const url = new URL("/api/v1/search", this.baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    const res = await this.get(url);
    const data = (await res.json()) as { results?: ClawHubSearchResult[] };
    return data.results ?? [];
  }

  /** Browse skills with sorting. */
  async listSkills(opts?: {
    sort?:
      | "newest"
      | "downloads"
      | "installs"
      | "installsAllTime"
      | "trending";
    limit?: number;
    cursor?: string;
  }): Promise<{ items: ClawHubSkillListItem[]; nextCursor: string | null }> {
    const url = new URL("/api/v1/skills", this.baseUrl);
    if (opts?.sort) url.searchParams.set("sort", opts.sort);
    if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
    if (opts?.cursor) url.searchParams.set("cursor", opts.cursor);
    const res = await this.get(url);
    return res.json() as Promise<{
      items: ClawHubSkillListItem[];
      nextCursor: string | null;
    }>;
  }

  /** Get a single skill detail. */
  async getSkill(slug: string): Promise<ClawHubSkillDetail> {
    const url = new URL(
      `/api/v1/skills/${encodeURIComponent(slug)}`,
      this.baseUrl,
    );
    const res = await this.get(url);
    return res.json() as Promise<ClawHubSkillDetail>;
  }

  /** Download skill zip. Returns raw bytes. */
  async downloadSkill(
    slug: string,
    version?: string,
  ): Promise<ArrayBuffer> {
    const url = new URL("/api/v1/download", this.baseUrl);
    url.searchParams.set("slug", slug);
    if (version) url.searchParams.set("version", version);
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(
        `Download failed for '${slug}' (HTTP ${res.status})`,
      );
    }
    return res.arrayBuffer();
  }

  // ── Packages / Plugins ──────────────────────────────────────────────

  /** List packages (plugins). */
  async listPackages(opts?: {
    limit?: number;
  }): Promise<ClawHubPackageListItem[]> {
    const url = new URL("/api/v1/plugins", this.baseUrl);
    if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
    const res = await this.get(url);
    const data = (await res.json()) as
      | ClawHubPackageListItem[]
      | { items?: ClawHubPackageListItem[] };
    return Array.isArray(data) ? data : (data.items ?? []);
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private async get(url: URL): Promise<Response> {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(
        `ClawHub API error: ${res.status} ${res.statusText} (${url.pathname})`,
      );
    }
    return res;
  }
}

/* ------------------------------------------------------------------ */
/*  Install helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Extract a zip buffer into a destination directory.
 * Uses platform-native tools (tar on Windows, unzip on *nix).
 */
export async function extractZip(
  zipBuffer: ArrayBuffer,
  destDir: string,
): Promise<void> {
  await mkdir(destDir, { recursive: true });

  const tmpFile = join(
    tmpdir(),
    `clawhub-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
  );
  await writeFile(tmpFile, Buffer.from(zipBuffer));

  try {
    if (process.platform === "win32") {
      await execFileAsync("tar", ["-xf", tmpFile, "-C", destDir]);
    } else {
      await execFileAsync("unzip", ["-o", tmpFile, "-d", destDir]);
    }
  } finally {
    await rm(tmpFile, { force: true });
  }
}

/**
 * Write origin metadata for a ClawHub-installed skill.
 * Stored as `<skillDir>/.clawhub/origin.json` to match ClawHub CLI convention.
 */
export async function writeOrigin(
  skillDir: string,
  meta: {
    slug: string;
    version: string;
    registry: string;
    installedAt: number;
  },
): Promise<void> {
  const dir = join(skillDir, ".clawhub");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "origin.json"), JSON.stringify(meta, null, 2));
}
