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
import { installClawHubSkill, uninstallClawHubSkill } from "../skills/install.js";

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
      const skill = await installClawHubSkill({
        clawhub,
        skillRegistry,
        slug,
        version: body.version,
      });
      return { ok: true, skill };
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
      try {
        await uninstallClawHubSkill({ skillRegistry, slug });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = /not a ClawHub-installed skill/.test(msg) ? 400 : 500;
        return reply.status(status).send({ error: msg });
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
