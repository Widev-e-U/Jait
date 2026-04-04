/**
 * Skill management REST routes.
 *
 * GET    /api/skills          — list all discovered skills
 * PATCH  /api/skills/:id      — update skill (enable/disable)
 * POST   /api/skills/scan     — re-scan skill directories
 */

import type { FastifyInstance } from "fastify";
import type { SkillRegistry } from "../skills/index.js";

export function registerSkillRoutes(app: FastifyInstance, skillRegistry: SkillRegistry) {

  /** List all discovered skills. */
  app.get("/api/skills", async () => {
    return skillRegistry.list().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      source: s.source,
      enabled: s.enabled,
    }));
  });

  /** Toggle a skill's enabled state. */
  app.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    "/api/skills/:id",
    async (req, reply) => {
      const skill = skillRegistry.get(req.params.id);
      if (!skill) return reply.status(404).send({ error: "Skill not found" });

      const body = req.body as { enabled?: boolean } | null;
      if (body && typeof body.enabled === "boolean") {
        skillRegistry.setEnabled(req.params.id, body.enabled);
      }

      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        source: skill.source,
        enabled: skill.enabled,
      };
    },
  );
}
