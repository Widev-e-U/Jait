import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { AssistantProfileService } from "../services/assistant-profiles.js";
import { requireAuth } from "../security/http-auth.js";

export function registerAssistantProfileRoutes(
  app: FastifyInstance,
  config: AppConfig,
  assistantProfileService: AssistantProfileService,
): void {
  app.get("/api/assistants/profiles", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    return { profiles: assistantProfileService.list(user.id) };
  });

  app.post("/api/assistants/profiles", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    if (!name) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", details: "name is required" });
    }
    const profile = assistantProfileService.create(user.id, {
      name,
      description: typeof body["description"] === "string" ? body["description"] : null,
      systemPrompt: typeof body["systemPrompt"] === "string" ? body["systemPrompt"] : null,
      runtimeMode: body["runtimeMode"] === "full-access" || body["runtimeMode"] === "supervised" ? body["runtimeMode"] : null,
      toolProfile: typeof body["toolProfile"] === "string" ? body["toolProfile"] : null,
      enabledSkills: Array.isArray(body["enabledSkills"]) ? body["enabledSkills"].filter((item): item is string => typeof item === "string") : [],
      enabledPlugins: Array.isArray(body["enabledPlugins"]) ? body["enabledPlugins"].filter((item): item is string => typeof item === "string") : [],
      isDefault: body["isDefault"] === true,
    });
    return reply.status(201).send({ profile });
  });

  app.get<{ Params: { id: string } }>("/api/assistants/profiles/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const profile = assistantProfileService.getById(request.params.id, user.id);
    if (!profile) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Assistant profile not found" });
    }
    return { profile };
  });

  app.patch<{ Params: { id: string } }>("/api/assistants/profiles/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const profile = assistantProfileService.update(request.params.id, user.id, {
      name: typeof body["name"] === "string" ? body["name"] : undefined,
      description: typeof body["description"] === "string" ? body["description"] : body["description"] === null ? null : undefined,
      systemPrompt: typeof body["systemPrompt"] === "string" ? body["systemPrompt"] : body["systemPrompt"] === null ? null : undefined,
      runtimeMode:
        body["runtimeMode"] === "full-access" || body["runtimeMode"] === "supervised"
          ? body["runtimeMode"]
          : body["runtimeMode"] === null
            ? null
            : undefined,
      toolProfile: typeof body["toolProfile"] === "string" ? body["toolProfile"] : body["toolProfile"] === null ? null : undefined,
      enabledSkills: Array.isArray(body["enabledSkills"]) ? body["enabledSkills"].filter((item): item is string => typeof item === "string") : undefined,
      enabledPlugins: Array.isArray(body["enabledPlugins"]) ? body["enabledPlugins"].filter((item): item is string => typeof item === "string") : undefined,
      isDefault: typeof body["isDefault"] === "boolean" ? body["isDefault"] : undefined,
    });
    if (!profile) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Assistant profile not found" });
    }
    return { profile };
  });

  app.delete<{ Params: { id: string } }>("/api/assistants/profiles/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const deleted = assistantProfileService.delete(request.params.id, user.id);
    if (!deleted) {
      return reply.status(404).send({ error: "NOT_FOUND", details: "Assistant profile not found" });
    }
    return reply.status(204).send();
  });
}
