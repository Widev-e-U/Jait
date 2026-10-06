import { z } from "zod";

const ids = z.array(z.string().max(200)).max(100);
/** Shared validation for the Agents page API and harness tools. */
export const personaAgentProfileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  role: z.string().max(200).optional(),
  reportsToId: z.string().min(1).max(100).nullable().optional(),
  persona: z.string().max(10_000),
  avatar: z.string().max(40),
  providerId: z.string().min(1).max(100),
  model: z.string().max(200).nullable().optional(),
  repositoryIds: ids,
  skillIds: ids,
  usesAllSkills: z.boolean().optional(),
  allowedTools: ids,
  requiresApproval: z.boolean(),
  paused: z.boolean(),
  schedule: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("adaptive"), rules: z.string().max(10_000) }),
    z.object({ kind: z.literal("cron"), cron: z.string().min(1).max(200) }),
  ]),
  notificationChannels: ids,
  notificationEvents: z.array(z.enum(["task_done", "blocked", "question"])).max(3),
  tasks: z.array(z.object({
    id: z.string().min(1).max(100), name: z.string().max(200), prompt: z.string().max(10_000),
    cron: z.string().max(200), jobId: z.string().max(100).optional(), repositoryId: z.string().max(200).optional(),
  })).max(100).optional(),
}).passthrough().refine((profile) => JSON.stringify(profile).length <= 30_000, "Agent profile is too large");

export type PersonaAgentProfile = z.infer<typeof personaAgentProfileSchema>;
