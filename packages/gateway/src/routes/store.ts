/**
 * ClawHub store proxy routes.
 *
 * Proxies the public ClawHub API for the web frontend and handles
 * local install/uninstall of skills from the registry.
 *
 * GET    /api/store/skills                — browse or search ClawHub skills
 * GET    /api/store/skills/:slug          — get skill detail from ClawHub
 * POST   /api/store/skills/:slug/install  — download + install skill locally
 * DELETE /api/store/skills/:slug          — uninstall a ClawHub-installed skill
 * GET    /api/store/packages              — browse ClawHub packages (plugins)
 */

import type { FastifyInstance } from "fastify";
import type { ClawHubClient } from "../clawhub/client.js";
import type { SkillRegistry } from "../skills/index.js";
import { extractZip, writeOrigin } from "../clawhub/client.js";
import { join } from "node:path";
import { rm, readFile } from "node:fs/promises";
import { userSkillsDir } from "../skills/index.js";

export interface StoreDeps {
  clawhub: ClawHubClient;
  skillRegistry: SkillRegistry;
}

export function registerStoreRoutes(
  app: FastifyInstance,
  deps: StoreDeps,
) {
  const { clawhub, skillRegistry } = deps;

  /* ── Browse / search skills ──────────────────────────────────────── */

  app.get<{
    Querystring: {
      q?: string;
      sort?: string;
      limit?: string;
      cursor?: string;
    };
  }>("/api/store/skills", async (req) => {
    const { q, sort, limit } = req.query;
    const parsedLimit = limit ? Math.min(Number(limit) || 25, 100) : 25;

    const installedIds = new Set(skillRegistry.list().map((s) => s.id));

    // ClawHub's list endpoint may return empty; always prefer search.
    // Use a broad default query when no explicit query is provided.
    const searchQuery = q || sort || "tool workflow agent";
    const results = await clawhub.searchSkills(searchQuery, parsedLimit);

    // Enrich results with stats (downloads, stars) from detail endpoint.
    // Fetch in parallel with a short timeout so slow lookups don't block.
    const enriched = await Promise.all(
      results.map(async (r) => {
        const slug = r.slug ?? "";
        let stats: { downloads?: number; stars?: number } | undefined;
        let latestVersion: { version: string } | undefined;
        try {
          const detail = await Promise.race([
            clawhub.getSkill(slug),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
          ]);
          if (detail?.skill?.stats) {
            stats = {
              downloads: detail.skill.stats.downloads,
              stars: detail.skill.stats.stars,
            };
          }
          if (detail?.latestVersion?.version) {
            latestVersion = { version: detail.latestVersion.version };
          }
        } catch {
          // Stats are optional — skip on error
        }
        return {
          ...r,
          installed: installedIds.has(slug),
          ...(stats ? { stats } : {}),
          ...(latestVersion ? { latestVersion } : {}),
        };
      }),
    );

    return { results: enriched };
  });

  /* ── Skill detail ────────────────────────────────────────────────── */

  app.get<{ Params: { slug: string } }>(
    "/api/store/skills/:slug",
    async (req) => {
      const detail = await clawhub.getSkill(req.params.slug);
      const isInstalled = skillRegistry.get(req.params.slug) !== undefined;
      return { ...detail, installed: isInstalled };
    },
  );

  /* ── Install skill from ClawHub ──────────────────────────────────── */

  app.post<{
    Params: { slug: string };
    Body: { version?: string };
  }>("/api/store/skills/:slug/install", async (req, reply) => {
    const { slug } = req.params;
    const body = (req.body as { version?: string } | null) ?? {};

    try {
      // 1. Resolve version
      const detail = await clawhub.getSkill(slug);
      const version = body.version ?? detail.latestVersion?.version;
      if (!version) {
        return reply
          .status(404)
          .send({ error: "No version found for skill" });
      }

      // 2. Download zip
      const zipBuffer = await clawhub.downloadSkill(slug, version);

      // 3. Extract to user skills directory
      const skillDir = join(userSkillsDir(), slug);
      await extractZip(zipBuffer, skillDir);

      // 4. Write origin metadata (matches ClawHub CLI convention)
      await writeOrigin(skillDir, {
        slug,
        version,
        registry: "https://clawhub.ai",
        installedAt: Date.now(),
      });

      // 5. Re-discover skills so the new one appears
      await skillRegistry.discover([
        { path: userSkillsDir(), source: "user" },
      ]);

      const installed = skillRegistry.get(slug);
      return {
        ok: true,
        skill: installed
          ? {
              id: installed.id,
              name: installed.name,
              description: installed.description,
              source: installed.source,
              enabled: installed.enabled,
            }
          : { id: slug, name: detail.skill?.displayName ?? slug },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  /* ── Uninstall ClawHub skill ─────────────────────────────────────── */

  app.delete<{ Params: { slug: string } }>(
    "/api/store/skills/:slug",
    async (req, reply) => {
      const { slug } = req.params;
      const skillDir = join(userSkillsDir(), slug);

      try {
        // Verify this is a ClawHub-installed skill
        const originPath = join(skillDir, ".clawhub", "origin.json");
        try {
          await readFile(originPath, "utf-8");
        } catch {
          return reply.status(400).send({
            error:
              "Skill is not a ClawHub-installed skill (no origin metadata)",
          });
        }

        // Remove the skill directory
        await rm(skillDir, { recursive: true, force: true });

        // Remove from registry
        skillRegistry.remove(slug);

        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    },
  );

  /* ── Browse ClawHub packages (plugins) ───────────────────────────── */

  app.get<{
    Querystring: { limit?: string };
  }>("/api/store/packages", async (req) => {
    const { limit } = req.query;
    const parsedLimit = limit ? Math.min(Number(limit) || 25, 100) : 25;
    const packages = await clawhub.listPackages({ limit: parsedLimit });
    return { items: packages };
  });
}
