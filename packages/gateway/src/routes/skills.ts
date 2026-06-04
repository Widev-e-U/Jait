/**
 * Skill management REST routes.
 *
 * GET    /api/skills              — list all discovered skills
 * PATCH  /api/skills/:id          — update skill (enable/disable)
 * POST   /api/skills/:id/install-tool — install a tool a skill requires
 */

import type { FastifyInstance } from "fastify";
import type { Skill, SkillRegistry } from "../skills/index.js";
import { checkSkillTools } from "../skills/index.js";
import { installSkillTool } from "../skills/install.js";

function serializeSkill(s: Skill) {
  const tools = checkSkillTools(s);
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    filePath: s.filePath,
    source: s.source,
    enabled: s.enabled,
    ...(s.requires ? { requires: s.requires } : {}),
    ...(s.install ? { install: s.install } : {}),
    toolsSatisfied: tools.satisfied,
    missingTools: tools.missing,
  };
}

export function registerSkillRoutes(app: FastifyInstance, skillRegistry: SkillRegistry) {

  /** List all discovered skills. */
  app.get("/api/skills", async () => {
    return skillRegistry.list().map(serializeSkill);
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

      return serializeSkill(skill);
    },
  );

  /**
   * Install a tool that a skill declares it needs.
   * Currently supports `kind: "node"` specs via `npm install -g <package>`.
   */
  app.post<{ Params: { id: string }; Body: { installId?: string } }>(
    "/api/skills/:id/install-tool",
    async (req, reply) => {
      const skill = skillRegistry.get(req.params.id);
      if (!skill) return reply.status(404).send({ error: "Skill not found" });

      const body = (req.body as { installId?: string } | null) ?? {};
      try {
        const result = await installSkillTool({ skill, installId: body.installId });
        return { ...result, skill: serializeSkill(skill) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Unsupported install kind / no matching option → 400; runtime failure → 500.
        const status = /Unsupported install kind|No matching install option/.test(msg) ? 400 : 500;
        return reply.status(status).send({ error: msg });
      }
    },
  );
}
