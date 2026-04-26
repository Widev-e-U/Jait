import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { SchedulerService, ScheduledJobRecord } from "../scheduler/service.js";
import { requireAuth } from "../security/http-auth.js";

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
  triggered_by: "manual" | "schedule";
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

const MAX_RUNS_PER_JOB = 100;

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
    jobType: meta?.["jobType"] === "agent_task" || meta?.["jobType"] === "system_job"
      ? meta["jobType"] as JobType
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

function toRunResultText(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function registerJobRoutes(
  app: FastifyInstance,
  config: AppConfig,
  scheduler: SchedulerService,
) {
  const runsByJob = new Map<string, ApiJobRun[]>();

  const pushRun = (run: ApiJobRun) => {
    const runs = runsByJob.get(run.job_id) ?? [];
    runs.unshift(run);
    if (runs.length > MAX_RUNS_PER_JOB) runs.length = MAX_RUNS_PER_JOB;
    runsByJob.set(run.job_id, runs);
  };

  app.get("/jobs/providers/available", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    return {
      providers: {
        openai: {
          name: "OpenAI",
          models: ["gpt-5", "gpt-4.1"],
        },
        ollama: {
          name: "Ollama",
          models: ["local-model"],
        },
      },
    };
  });

  app.get("/jobs", async (request, reply) => {
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

  app.get("/jobs/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const job = scheduler.get(id, authUser.id);
    if (!job) {
      return reply.status(404).send({ detail: "Job not found" });
    }
    return mapJob(job);
  });

  app.post("/jobs", async (request, reply) => {
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
      workspaceRoot: process.cwd(),
    });

    return reply.status(201).send(mapJob(created));
  });

  app.patch("/jobs/:id", async (request, reply) => {
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

    let nextToolName = existing.toolName;
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
        workingDirectory: existing.workspaceRoot,
        start: true,
        detach: true,
      };
    }

    const updatedInput = {
      ...nextPayload,
      __jaitJobMeta: nextMeta,
    };

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

  app.delete("/jobs/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const removed = scheduler.remove(id, authUser.id);
    if (!removed) {
      return reply.status(404).send({ detail: "Job not found" });
    }
    return reply.status(204).send();
  });

  app.post("/jobs/:id/trigger", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const { id } = request.params as { id: string };
    const startedAt = new Date().toISOString();
    try {
      const execution = await scheduler.trigger(id, authUser.id);
      const run: ApiJobRun = {
        id: execution.actionId,
        job_id: id,
        status: execution.result.ok ? "completed" : "failed",
        triggered_by: "manual",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        result: execution.result.ok ? toRunResultText(execution.result.data) : null,
        error: execution.result.ok ? null : execution.result.message,
      };
      pushRun(run);
      return run;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const statusCode = /job not found/i.test(message) ? 404 : 500;
      return reply.status(statusCode).send({ detail: message });
    }
  });

  app.get("/jobs/:id/runs", async (request, reply) => {
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
    const allRuns = runsByJob.get(id) ?? [];
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
