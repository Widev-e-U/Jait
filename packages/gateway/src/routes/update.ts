/**
 * Update REST routes — check for new versions and trigger self-update.
 *
 *   GET    /api/update/check          — compare running version against npm latest
 *   POST   /api/update/apply          — install the new version and restart
 *   GET    /api/mobile-update/check   — compare installed Android APK (and paired Wear OS APK,
 *                                        if a release asset for it exists) against latest GitHub release
 */

const GITHUB_REPO = "Widev-e-U/Jait";

import type { FastifyInstance } from "fastify";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";

const require = createRequire(import.meta.url);
const { version: CURRENT_VERSION } = require("../../package.json") as { version: string };

/** Patch-note metadata for a single GitHub release. */
export interface ReleaseNote {
  version: string;
  name: string;
  publishedAt: string;
  url: string;
  /** Semver of the release directly before this one (used as the compare base). */
  previousVersion: string;
  /** Commit messages describing what changed in this release. */
  commits: Array<{ message: string; sha: string; date: string }>;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  published_at?: string;
  html_url?: string;
}

let releasesCache: { data: GitHubRelease[]; fetchedAt: number } | null = null;
const RELEASES_TTL_MS = 10 * 60 * 1000;

/** Compare results are cached per (base,head) pair to respect GitHub rate limits. */
const compareCache = new Map<string, Array<{ message: string; sha: string; date: string }>>();
const COMPARE_TTL_MS = 30 * 60 * 1000;

/** Test-only helper: drop the in-memory GitHub caches between tests. */
export function __resetUpdateCaches(): void {
  releasesCache = null;
  compareCache.clear();
}

/** Fetch the list of GitHub releases (newest first), cached briefly. */
async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  if (releasesCache && Date.now() - releasesCache.fetchedAt < RELEASES_TTL_MS) {
    return releasesCache.data;
  }
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "jait-gateway" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  const data = (await res.json()) as GitHubRelease[];
  releasesCache = { data, fetchedAt: Date.now() };
  return data;
}

/** Fetch commit messages between two semver tags (e.g. v0.1.665...v0.1.666), cached. */
async function fetchCommitsBetween(base: string, head: string): Promise<Array<{ message: string; sha: string; date: string }>> {
  const key = `${base}...${head}`;
  const cached = compareCache.get(key);
  if (cached) return cached;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/compare/v${base}...v${head}`,
    {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "jait-gateway" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`GitHub compare responded ${res.status}`);
  const data = (await res.json()) as { commits?: Array<{ sha: string; commit?: { message?: string; author?: { date?: string } } }> };
  const commits = (data.commits ?? []).map((c) => ({
    message: c.commit?.message ?? "",
    sha: c.sha ?? "",
    date: c.commit?.author?.date ?? "",
  }));
  compareCache.set(key, commits);
  // Best-effort expiry to avoid unbounded growth.
  setTimeout(() => compareCache.delete(key), COMPARE_TTL_MS);
  return commits;
}

/**
 * Build per-release patch notes for every release newer than `from` (inclusive
 * of `to` when given). Notes are derived from the commit diff between each
 * release and the one immediately before it.
 */
async function buildChangelog(from: string, to?: string): Promise<ReleaseNote[]> {
  const releases = await fetchGitHubReleases();
  const semverReleases = releases
    .filter((r) => r.tag_name && /^v?\d+\.\d+\.\d+$/.test((r.tag_name ?? "").replace(/^v/, "")))
    .sort((a, b) => compareVersions(b.tag_name!.replace(/^v/, ""), a.tag_name!.replace(/^v/, "")));

  const notes: ReleaseNote[] = [];
  for (let i = 0; i < semverReleases.length; i++) {
    const release = semverReleases[i];
    if (!release?.tag_name) continue;
    const version = release.tag_name.replace(/^v/, "");
    if (from && compareVersions(version, from) <= 0) break; // list is newest-first; stop at current
    if (to && compareVersions(version, to) > 0) continue;
    const previous = semverReleases[i + 1];
    const previousVersion = previous?.tag_name ? previous.tag_name.replace(/^v/, "") : "";
    let commits: Array<{ message: string; sha: string; date: string }> = [];
    if (previousVersion) {
      try {
        commits = await fetchCommitsBetween(previousVersion, version);
      } catch {
        commits = [];
      }
    }
    notes.push({
      version,
      name: release.name ?? release.tag_name,
      publishedAt: release.published_at ?? "",
      url: release.html_url ?? `https://github.com/${GITHUB_REPO}/releases/tag/v${version}`,
      previousVersion,
      commits,
    });
  }
  return notes;
}

export function registerUpdateRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: { shutdown: () => Promise<void>; port: number },
): void {
  /** Check for a newer version on npm. */
  app.get("/api/update/check", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    try {
      const latest = execSync("npm view @jait/gateway version", {
        encoding: "utf8",
        timeout: 15_000,
        windowsHide: true,
      }).trim();

      const hasUpdate = latest !== CURRENT_VERSION && compareVersions(latest, CURRENT_VERSION) > 0;

      return {
        currentVersion: CURRENT_VERSION,
        latestVersion: latest,
        hasUpdate,
      };
    } catch (err) {
      return reply.status(502).send({
        error: "Failed to check for updates",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /** Check for a newer Android APK release on GitHub. */
  app.get("/api/mobile-update/check", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const query = (request.query as Record<string, unknown>) ?? {};
    const currentVersion = typeof query["currentVersion"] === "string" ? query["currentVersion"] : "";

    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "jait-gateway" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return reply.status(502).send({
          error: "Failed to check for updates",
          detail: `GitHub responded ${res.status}`,
        });
      }

      const release = await res.json() as {
        tag_name?: string;
        assets?: Array<{ name: string; browser_download_url: string }>;
      };
      const latestVersion = (release.tag_name ?? "").replace(/^v/, "");
      const apkAssets = (release.assets ?? []).filter((asset) => {
        const assetName = asset.name.toLowerCase();
        return assetName.endsWith(".apk") && !assetName.includes("unsigned");
      });
      const apkAsset = apkAssets.find((asset) => asset.name.toLowerCase().includes("android")) ?? apkAssets[0];
      const wearAsset = apkAssets.find((asset) => asset.name.toLowerCase().includes("wear"));
      const hasUpdate = !!currentVersion && !!latestVersion && !!apkAsset && compareVersions(latestVersion, currentVersion) > 0;

      return {
        currentVersion,
        latestVersion,
        hasUpdate,
        downloadUrl: apkAsset?.browser_download_url ?? null,
        assetName: apkAsset?.name ?? null,
        wearDownloadUrl: wearAsset?.browser_download_url ?? null,
        wearAssetName: wearAsset?.name ?? null,
      };
    } catch (err) {
      return reply.status(502).send({
        error: "Failed to check for updates",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * Fetch patch notes (per-release commit changelog) for the versions newer than
   * the running one. Used by the Settings changelog page and the hover tooltip
   * on the update button.
   *
   *   GET /api/update/changelog?from=0.1.660&to=0.1.666
   */
  app.get("/api/update/changelog", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const query = (request.query as Record<string, unknown>) ?? {};
    const from = typeof query["from"] === "string" ? query["from"] : "";
    const to = typeof query["to"] === "string" ? query["to"] : "";

    try {
      const releases = await buildChangelog(from, to || undefined);
      return { from, to, releases };
    } catch (err) {
      return reply.status(502).send({
        error: "Failed to fetch release notes",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /** Install a new version and restart the gateway. */
  app.post("/api/update/apply", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = (request.body as Record<string, unknown>) ?? {};
    const raw = typeof body["version"] === "string" ? body["version"] : "latest";
    // Sanitise: only allow semver-ish or "latest"
    const version = /^[0-9a-zA-Z._-]+$/.test(raw) ? raw : "latest";
    const pkg = `@jait/gateway@${version}`;

    try {
      // 1. Install new version
      execSync(`npm install -g ${pkg}`, {
        encoding: "utf8",
        timeout: 120_000,
        stdio: "pipe",
        windowsHide: true,
      });

      // 2. Read newly installed version
      let newVersion = version;
      try {
        const raw = execSync(
          "npm list -g @jait/gateway --depth=0 --json",
          { encoding: "utf8", timeout: 10_000, windowsHide: true, stdio: "pipe" },
        );
        newVersion = (JSON.parse(raw) as { dependencies?: Record<string, { version?: string }> }).dependencies?.["@jait/gateway"]?.version ?? version;
      } catch { /* best effort */ }

      // 3. Schedule restart after response is sent
      const isSystemdEnv = !!process.env.INVOCATION_ID;
      setTimeout(async () => {
        if (isSystemdEnv) {
          const unit = process.env.JAIT_UNIT ?? "jait-gateway";
          try {
            const { spawn } = await import("node:child_process");
            const child = spawn("systemctl", ["--user", "restart", unit], {
              stdio: "ignore",
              detached: true,
              windowsHide: true,
            });
            child.unref();
          } catch { /* fall through */ }
          setTimeout(() => process.exit(0), 1_000);
        } else {
          await deps.shutdown();
        }
      }, 500);

      return {
        ok: true,
        previousVersion: CURRENT_VERSION,
        newVersion,
        message: `Updated to ${newVersion}. Restarting...`,
      };
    } catch (err) {
      return reply.status(500).send({
        error: "Update failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/** Simple semver comparison: returns >0 if a > b, <0 if a < b, 0 if equal. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
