import { personaAgentProfileSchema } from "@jait/shared";
import { uuidv7 } from "../db/uuidv7.js";
import type { ThreadService } from "../services/threads.js";
import type { ToolDefinition, ToolPropertySchema } from "./contracts.js";

interface ProfileInput {
  action: "list" | "get" | "create" | "update" | "delete";
  id?: string;
  profile?: Record<string, unknown>;
}
export function createPersonaAgentInspectTool(deps: Parameters<typeof createPersonaAgentTool>[0]): ToolDefinition<ProfileInput> {
  const tool = createPersonaAgentTool(deps);
  return { ...tool, name: "agent.profiles.inspect", displayName: "Inspect Jait agents",
    description: "List or inspect the current user's persistent Agents-page profiles, roles, and reporting relationships. Read-only; use agent.profiles to change a team.",
    risk: "low", defaultConsentLevel: "none",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["list", "get"] }, id: { type: "string" },
    }, required: ["action"] },
    async execute(input, context) {
      if (input.action !== "list" && input.action !== "get") return { ok: false, message: "Inspection supports only list and get." };
      return tool.execute(input, context);
    },
  };
}
const strings: ToolPropertySchema = { type: "array", items: { type: "string" } };

export function createPersonaAgentTool(deps: {
  threadService: ThreadService;
  providerAvailable: (providerId: string, userId: string) => boolean;
}): ToolDefinition<ProfileInput> {
  return {
    name: "agent.profiles", displayName: "Manage Jait agents", page: "agents",
    description: "Manage persistent people and teams on Jait's Agents page. List/get/create/update/delete saved profiles, roles, reporting lines, personas, provider/model, skills, repositories, tool preferences, notifications, and pause state. This does not spawn temporary workers. Updates preserve omitted fields. Saving schedule/task preferences does not create executable jobs: use cron tools and thread.control with personaAgentId for execution.",
    tier: "standard", category: "agent", source: "builtin", risk: "medium", defaultConsentLevel: "once",
    discovery: { aliases: ["Agents page", "team", "Scrum", "organization", "persistent agents", "manager", "reports to"],
      examples: ["Set up a Scrum team", "Create a developer who reports to my lead", "Pause my agent"] },
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["list", "get", "create", "update", "delete"] },
      id: { type: "string", description: "Profile ID required for get/update/delete; generated on create." },
      profile: { type: "object", description: "Fields to create or change. Create requires name and providerId. reportsToId may be null to clear the manager.", properties: {
        name: { type: "string" }, role: { type: "string" }, persona: { type: "string" }, avatar: { type: "string" },
        reportsToId: { type: ["string", "null"] },
        providerId: { type: "string" }, model: { type: ["string", "null"] },
        repositoryIds: strings, skillIds: strings, usesAllSkills: { type: "boolean" }, allowedTools: strings,
        requiresApproval: { type: "boolean" }, paused: { type: "boolean" },
        schedule: { type: "object", properties: { kind: { type: "string", enum: ["adaptive", "cron"] }, rules: { type: "string" }, cron: { type: "string" } }, required: ["kind"] },
        notificationChannels: strings, notificationEvents: strings,
        tasks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" },
          prompt: { type: "string" }, cron: { type: "string" }, jobId: { type: "string" }, repositoryId: { type: "string" } }, required: ["id", "name", "prompt", "cron"] } },
      } },
    }, required: ["action"] },
    async execute(input, context) {
      const userId = context.userId;
      if (!userId) return { ok: false, message: "Authenticated user required to manage agent profiles." };
      const service = deps.threadService;
      if (input.action === "list") return { ok: true, message: "Persistent Jait agents.", data: { agents: service.listPersonaAgents(userId) } };
      if (input.action !== "create" && (!input.id || input.id.length > 100)) return { ok: false, message: "A valid agent profile id is required." };
      const existing = input.id ? service.getPersonaAgent(input.id, userId) : null;
      if (input.action !== "create" && !existing) return { ok: false, message: "Agent profile not found." };
      if (input.action === "get") return { ok: true, message: `Agent: ${existing!.name}`, data: { agent: existing } };
      if (input.action === "delete") {
        service.deletePersonaAgent(input.id!, userId);
        return { ok: true, message: "Agent deleted; direct reports and thread references were detached.", data: { id: input.id } };
      }
      if (!input.profile || Array.isArray(input.profile)) return { ok: false, message: "Profile fields are required." };
      const id = input.action === "create" ? uuidv7() : input.id!;
      const defaults = { persona: "", avatar: "Nova", role: "", reportsToId: null, repositoryIds: [], skillIds: [],
        allowedTools: [], requiresApproval: true, paused: false, schedule: { kind: "adaptive", rules: "" },
        notificationChannels: [], notificationEvents: ["task_done", "blocked", "question"] };
      const parsed = personaAgentProfileSchema.safeParse({ ...defaults, ...existing, ...input.profile, id });
      if (!parsed.success) return { ok: false, message: "Invalid agent profile: " + parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
      if (!deps.providerAvailable(parsed.data.providerId, userId)) return { ok: false, message: "Provider unavailable for this user." };
      try {
        const agent = service.savePersonaAgent(userId, parsed.data);
        return { ok: true, message: `Agent ${input.action === "create" ? "created" : "updated"}: ${agent.name}`, data: { agent } };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Unable to save agent profile." };
      }
    },
  };
}
