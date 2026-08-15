import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { SchedulerService, ScheduledJobRecord } from "../scheduler/service.js";
import { requireAuth } from "../security/http-auth.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { ProviderAccountService } from "../services/provider-accounts.js";
import type { UserService } from "../services/users.js";
import { listJaitModels } from "../services/jait-models.js";

type JobType = "agent_task" | "system_job";

interface ApiScheduledJob {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  cron_expression: string;
  job_type: JobType;
  tool_name: string;
  payload: Record<string, unknown> | null;
  prompt: string | null;
  provider: string | null;
  model: string | null;
  enabled: boolean;
  temporal_schedule_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiJobRun {
  id: string;
  job_id: string;
  status: "pending" | "running" | "completed" | "failed";
  triggered_by: "manual" | "schedule" | "maintenance";
  started_at: string;
  completed_at: string | null;
  result: string | null;
  error: string | null;
}

interface JobMeta {
  jobType?: JobType;
  description?: string;
  prompt?: string;
  provider?: string;
  model?: string;
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const firstUnderscore = trimmed.indexOf("_");
  if (firstUnderscore === -1) return trimmed;
  return `${trimmed.slice(0, firstUnderscore)}.${trimmed.slice(firstUnderscore + 1)}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function withoutThreadTitle(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  const { title: _title, ...rest } = payload ?? {};
  return rest;
}

function getJobMeta(input: unknown): JobMeta {
  const record = asRecord(input);
  const meta = asRecord(record?.["__jaitJobMeta"]);
  return {
    jobType: meta?.["jobType"] === "agent_task" || meta?.["jobType"] === "agent_thread_job"
      ? "agent_task"
      : meta?.["jobType"] === "system_job"
        ? "system_job"
      : undefined,
    description: typeof meta?.["description"] === "string" ? meta["description"] : undefined,
    prompt: typeof meta?.["prompt"] === "string" ? meta["prompt"] : undefined,
    provider: typeof meta?.["provider"] === "string" ? meta["provider"] : undefined,
    model: typeof meta?.["model"] === "string" ? meta["model"] : undefined,
  };
}

function mapJob(job: ScheduledJobRecord): ApiScheduledJob {
  const meta = getJobMeta(job.input);
  const jobType = meta.jobType ?? "system_job";
  const baseInput = asRecord(job.input) ?? {};
  const { __jaitJobMeta: _ignored, ...payloadInput } = baseInput;
  const agentPayload = withoutThreadTitle(payloadInput);
  const payload = jobType === "system_job"
    ? {
        command: job.toolName,
        args: payloadInput,
      }
    : (Object.keys(agentPayload).length > 0 ? agentPayload : null);
  return {
    id: job.id,
    user_id: job.userId,
    name: job.name,
    description: meta.description ?? null,
    cron_expression: job.cron,
    job_type: jobType,
    tool_name: job.toolName,
    payload,
    prompt: meta.prompt ?? null,
    provider: meta.provider ?? null,
    model: meta.model ?? null,
    enabled: job.enabled,
    temporal_schedule_id: null,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function parsePrompt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mapRun(run: ReturnType<SchedulerService["listRuns"]>[number]): ApiJobRun {
  return {
    id: run.id,
    job_id: run.jobId,
    status: run.status as ApiJobRun["status"],
    triggered_by: run.triggeredBy as ApiJobRun["triggered_by"],
    started_at: run.startedAt,
    completed_at: run.completedAt,
    result: run.output,
    error: run.error,
  };
}

export function registerJobRoutes(
  app: FastifyInstance,
  config: AppConfig,
  scheduler: SchedulerService,
  deps: {
    providerRegistry?: ProviderRegistry;
    providerAccountService?: ProviderAccountService;
    userService?: UserService;
  } = {},
) {
  app.get("/api/jobs/providers/available", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const providers: Record<string, { name: string; models: string[] }> = {};
    const registry = deps.providerRegistry;
    if (registry) {
      for (const provider of registry.list()) {
        if (!registry.isVisibleTo(provider.id, authUser.id)) continue;
        try {
          let models = provider.listModels ? await provider.listModels() : [];
          // For the jait provider, expand models from all configured backends
          // (mirrors the /api/providers/:id/models route).
          if (provider.id === "jait" && deps.userService) {
            const settings = deps.userService.getSettings(authUser.id);
            models = await listJaitModels({
              config,
              apiKeys: settings.apiKeys ?? {},
              fallbackModels: models,
            });
          }
          providers[provider.id] = { name: provider.info.name, models: models.map((m) => m.id) };
        } catch {
          // Never fail the whole endpoint because one provider's catalogue is
          // unreachable; fall back to an empty model list for it.
          providers[provider.id] = { name: provider.info.name, models: [] };
        }
      }
    }
    return { providers };
  });

  app.get("/api/jobs", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const query = (request.query as Record<string, unknown>) ?? {};
    const includeDisabled = parseBool(query["include_disabled"], true);
    const page = Math.max(1, Number.parseInt(String(query["page"] ?? "1"), 10) || 1);
    const size = Math.max(1, Math.min(500, Number.parseInt(String(query["size"] ?? "100"), 10) || 100));

    const all = scheduler
      .list(authUser.id)
      .filter((job) => includeDisabled || job.enabled)
      .map(mapJob);
    const start = (page - 1) * size;
    const items = all.slice(start, start + size);

    return {
      items,
      total: all.length,
      page,
      size,
    };
  });

  app.get("/api/jobs/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const job = scheduler.get(id, authUser.id);
    if (!job) {
      return reply.status(404).send({ detail: "Job not found" });
    }
    return mapJob(job);
  });

  app.post("/api/jobs", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const name = typeof body["name"] === "string" ? body["name"].trim() : "";
    const cron = typeof body["cron_expression"] === "string" ? body["cron_expression"].trim() : "";
    if (!name || !cron) {
      return reply.status(400).send({ detail: "name and cron_expression are required" });
    }

    const jobType = body["job_type"] === "agent_task" || body["job_type"] === "system_job"
      ? body["job_type"] as JobType
      : "system_job";
    const description = typeof body["description"] === "string" ? body["description"] : undefined;
    const prompt = parsePrompt(body["prompt"]);
    const provider = typeof body["provider"] === "string" ? body["provider"] : undefined;
    const model = typeof body["model"] === "string" ? body["model"] : undefined;
    const payload = asRecord(body["payload"]);

    let toolName = "gateway.status";
    let input: Record<string, unknown> = {};

    if (jobType === "system_job") {
      const payloadCommand = typeof payload?.["command"] === "string" ? payload["command"] : undefined;
      const args = asRecord(payload?.["args"]);
      if (payloadCommand) {
        toolName = normalizeToolName(payloadCommand);
      } else if (typeof body["tool_name"] === "string") {
        toolName = normalizeToolName(String(body["tool_name"]));
      }
      input = args ?? {};
    } else {
      if (!prompt) {
        return reply.status(400).send({ detail: "prompt is required for agent_task" });
      }
      toolName = "thread.control";
      input = {
        ...withoutThreadTitle(payload),
        action: "create",
        kind: "delivery",
        prompt,
        providerId: provider,
        model,
        workingDirectory: process.cwd(),
        start: true,
        detach: true,
      };
    }

    input = {
      ...input,
      __jaitJobMeta: {
        jobType,
        description,
        prompt,
        provider,
        model,
      },
    };

    const created = scheduler.create({
      userId: authUser.id,
      name,
      cron,
      toolName,
      input,
      enabled: parseBool(body["enabled"], true),
      sessionId: "default",
      projectRoot: process.cwd(),
    });

    return reply.status(201).send(mapJob(created));
  });

  app.patch("/api/jobs/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) ?? {};
    const existing = scheduler.get(id, authUser.id);
    if (!existing) {
      return reply.status(404).send({ detail: "Job not found" });
    }

    const existingInput = asRecord(existing.input) ?? {};
    const existingMeta = getJobMeta(existingInput);
    const { __jaitJobMeta: _ignored, ...existingPayload } = existingInput;

    const semanticKeys = ["job_type", "tool_name", "payload", "prompt", "description", "provider", "model"] as const;
    const hasSemanticChange = semanticKeys.some((key) => body[key] !== undefined);

    let nextToolName: string | undefined;
    let updatedInput: Record<string, unknown> | undefined;

    if (hasSemanticChange) {
      const requestedJobType = body["job_type"] === "agent_task" || body["job_type"] === "system_job"
        ? body["job_type"] as JobType
        : (existingMeta.jobType ?? "system_job");
      const nextMeta: JobMeta = {
        jobType: requestedJobType,
        description: typeof body["description"] === "string" ? body["description"] : existingMeta.description,
        prompt: parsePrompt(body["prompt"]) ?? existingMeta.prompt,
        provider: typeof body["provider"] === "string" ? body["provider"] : existingMeta.provider,
        model: typeof body["model"] === "string" ? body["model"] : existingMeta.model,
      };

      nextToolName = existing.toolName;
      let nextPayload: Record<string, unknown> = existingPayload;

      if (requestedJobType === "system_job") {
        const payload = asRecord(body["payload"]);
        const payloadCommand = typeof payload?.["command"] === "string" ? payload["command"] : undefined;
        const payloadArgs = asRecord(payload?.["args"]);
        if (payloadCommand) {
          nextToolName = normalizeToolName(payloadCommand);
        } else if (typeof body["tool_name"] === "string") {
          nextToolName = normalizeToolName(String(body["tool_name"]));
        }
        if (payload) {
          nextPayload = payloadArgs ?? {};
        }
      } else {
        const payload = asRecord(body["payload"]);
        const nextPrompt = parsePrompt(body["prompt"]) ?? existingMeta.prompt;
        if (!nextPrompt) {
          return reply.status(400).send({ detail: "prompt is required for agent_task" });
        }
        nextToolName = "thread.control";
        nextPayload = {
          ...withoutThreadTitle(payload ?? existingPayload),
          action: "create",
          kind: "delivery",
          prompt: nextPrompt,
          providerId: nextMeta.provider,
          model: nextMeta.model,
          workingDirectory: existing.projectRoot,
          start: true,
          detach: true,
        };
      }

      updatedInput = {
        ...nextPayload,
        __jaitJobMeta: nextMeta,
      };
    }

    const updated = scheduler.update(id, {
      name: typeof body["name"] === "string" ? body["name"] : undefined,
      cron: typeof body["cron_expression"] === "string" ? body["cron_expression"] : undefined,
      enabled: typeof body["enabled"] === "boolean" ? body["enabled"] : undefined,
      toolName: nextToolName,
      input: updatedInput,
    }, authUser.id);

    if (!updated) {
      return reply.status(404).send({ detail: "Job not found" });
    }
    return mapJob(updated);
  });

  app.delete("/api/jobs/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const removed = scheduler.remove(id, authUser.id);
    if (!removed) {
      return reply.status(404).send({ detail: "Job not found" });
    }
    return reply.status(204).send();
  });

  app.post("/api/jobs/:id/trigger", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    try {
      const execution = await scheduler.trigger(id, authUser.id);
      const run = scheduler.listRuns(id).find((item) => item.id === execution.actionId);
      if (!run) {
        return reply.status(500).send({ detail: "Job run was not persisted" });
      }
      return mapRun(run);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = /job not found/i.test(message) ? 404 : 500;
      return reply.status(statusCode).send({ detail: message });
    }
  });

  app.get("/api/jobs/:id/runs", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const job = scheduler.get(id, authUser.id);
    if (!job) {
      return reply.status(404).send({ detail: "Job not found" });
    }
    const query = (request.query as Record<string, unknown>) ?? {};
    const page = Math.max(1, Number.parseInt(String(query["page"] ?? "1"), 10) || 1);
    const size = Math.max(1, Math.min(500, Number.parseInt(String(query["size"] ?? "20"), 10) || 20));
    const allRuns = scheduler.listRuns(id).map(mapRun);
    const start = (page - 1) * size;
    const items = allRuns.slice(start, start + size);
    return {
      items,
      total: allRuns.length,
      page,
      size,
    };
  });
}
