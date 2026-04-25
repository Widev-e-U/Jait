/**
 * Automation Plan REST routes.
 *
 *   GET    /api/repos/:repoId/plans            — list plans for a repo
 *   POST   /api/repos/:repoId/plans            — create a plan
 *   GET    /api/plans/:id                       — get a plan
 *   PATCH  /api/plans/:id                       — update plan
 *   DELETE /api/plans/:id                       — delete a plan
 *   POST   /api/plans/:id/generate              — AI-generate tasks
 *   POST   /api/plans/:id/tasks/:taskId/start   — start a single task
 *   POST   /api/plans/:id/start                 — start all approved tasks
 */

import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { PlanService, PlanTask } from "../services/plans.js";
import { newTaskId } from "../services/plans.js";
import type { RepositoryService } from "../services/repositories.js";
import type { ThreadService } from "../services/threads.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { CliProviderAdapter, ProviderEvent, ProviderId } from "../providers/contracts.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import { assertOwnership } from "../security/ownership.js";
import type { WsEventType } from "@jait/shared";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface PlanRouteDeps {
  planService: PlanService;
  repoService: RepositoryService;
  threadService?: ThreadService;
  providerRegistry?: ProviderRegistry;
  userService?: UserService;
  ws?: WsControlPlane;
}

export function registerPlanRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: PlanRouteDeps,
): void {
  const { planService, repoService, userService, ws } = deps;

  function findRemoteNodeForCwd(cwd: string, providerId: ProviderId): string | null {
    if (!ws) return null;
    if (existsSync(cwd)) return null;
    const isWindowsPath = /^[A-Za-z]:[\\/]/.test(cwd);
    const expectedPlatform = isWindowsPath ? "windows" : null;
    for (const node of ws.getFsNodes()) {
      if (node.isGateway) continue;
      if (expectedPlatform && node.platform !== expectedPlatform) continue;
      if (!node.providers?.includes(providerId)) continue;
      return node.id;
    }
    return null;
  }

  async function runPromptWithCliProvider(
    provider: CliProviderAdapter,
    cwd: string,
    prompt: string,
    model?: string,
  ): Promise<string> {
    const session = await provider.startSession({
      threadId: `plan-generate-${randomUUID()}`,
      workingDirectory: cwd,
      mode: "full-access",
      ...(model ? { model } : {}),
    });

    let tokenContent = "";
    let messageContent = "";
    let sessionError: string | null = null;
    let turnCompleted = false;

    let resolveTurn: (() => void) | null = null;
    let rejectTurn: ((error: Error) => void) | null = null;

    const waitForTurn = new Promise<void>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });

    const unsubscribe = provider.onEvent((event: ProviderEvent) => {
      if (event.sessionId !== session.id) return;
      if (event.type === "token") tokenContent += event.content;
      if (event.type === "message" && event.role === "assistant") {
        messageContent += event.content;
      }
      if (event.type === "session.error") {
        sessionError = event.error;
        rejectTurn?.(new Error(event.error));
        return;
      }
      if (event.type === "turn.completed" || event.type === "session.completed") {
        turnCompleted = true;
        resolveTurn?.();
      }
    });

    try {
      await provider.sendTurn(session.id, prompt);
      await Promise.race([
        waitForTurn,
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for CLI provider response")), 60_000);
        }),
      ]);
      if (sessionError) throw new Error(sessionError);
      if (!turnCompleted && !sessionError) {
        throw new Error("CLI provider turn did not complete");
      }
      return (tokenContent || messageContent).trim();
    } finally {
      unsubscribe();
      try { await provider.stopSession(session.id); } catch { /* best effort */ }
    }
  }

  function broadcastPlanEvent(event: string, data: unknown): void {
    if (!ws) return;
    ws.broadcastAll({
      type: `plan.${event}` as WsEventType,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: data as Record<string, unknown>,
    });
  }

  function getOwnedRepo(repoId: string, userId: string) {
    const repo = repoService.getById(repoId);
    return repo?.userId === userId ? repo : null;
  }

  function getOwnedPlan(planId: string, userId: string) {
    const plan = planService.getById(planId);
    return plan?.userId === userId ? plan : null;
  }

  // ── LIST plans for a repo ────────────────────────────────────────

  app.get<{ Params: { repoId: string } }>("/api/repos/:repoId/plans", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;
    const plans = planService.listByRepo(request.params.repoId);
    return { plans };
  });

  // ── CREATE plan ──────────────────────────────────────────────────

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/plans", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as { title?: string; tasks?: PlanTask[] };
    const plan = planService.create({
      repoId: request.params.repoId,
      userId: user.id,
      title: body.title ?? "New Plan",
      tasks: body.tasks,
    });

    broadcastPlanEvent("created", { plan });
    return reply.status(201).send({ plan });
  });

  // ── GET plan ─────────────────────────────────────────────────────

  app.get<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const plan = getOwnedPlan(request.params.id, user.id);
    if (!assertOwnership(reply, plan, user.id, "Plan not found")) return;
    return { plan };
  });

  // ── UPDATE plan ──────────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = request.body as {
      title?: string;
      status?: string;
      tasks?: PlanTask[];
    };

    const existing = getOwnedPlan(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Plan not found")) return;

    const plan = planService.update(request.params.id, {
      title: body.title,
      status: body.status === "draft" || body.status === "active" || body.status === "completed" || body.status === "archived"
        ? body.status
        : undefined,
      tasks: body.tasks,
    });
    if (!plan) {
      return reply.status(404).send({ error: "Plan not found" });
    }

    broadcastPlanEvent("updated", { plan });
    return { plan };
  });

  // ── DELETE plan ──────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/api/plans/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const existing = getOwnedPlan(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Plan not found")) return;

    planService.delete(request.params.id);
    broadcastPlanEvent("deleted", { planId: request.params.id });
    return { ok: true };
  });

  // ── GENERATE tasks via LLM ───────────────────────────────────────

  app.post<{ Params: { id: string } }>("/api/plans/:id/generate", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const plan = getOwnedPlan(request.params.id, user.id);
    if (!assertOwnership(reply, plan, user.id, "Plan not found")) return;

    const repo = getOwnedRepo(plan.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as { prompt?: string; provider?: ProviderId; model?: string | null } | undefined;
    const userPromptHint = (body?.prompt ?? "").trim();
    const requestProvider = body?.provider ?? "jait";
    const requestModel = body?.model?.trim() || undefined;

    // Gather repo context
    let repoContext = "";
    if (existsSync(repo.localPath)) {
      repoContext = gatherRepoContext(repo.localPath);
    }

    // Include strategy if available
    const strategySection = repo.strategy?.trim()
      ? `\n\n### Repository Strategy\n${repo.strategy.trim()}`
      : "";

    const systemPrompt = [
      "You are a senior engineering manager planning work for an AI coding agent.",
      "Given a repository's context, generate a list of concrete, actionable tasks",
      "that can each be executed as an independent agent thread.",
      "Each task should be small enough to complete in one session (a few files at most).",
      "Tasks can run in parallel unless they have explicit dependencies.",
      "",
      "Respond with a JSON array of task objects. Each object must have:",
      '  { "title": "short title", "description": "detailed instruction for the agent" }',
      "",
      "Output ONLY the JSON array, no markdown fences, no explanation.",
    ].join("\n");

    const userContent = [
      userPromptHint ? `The user wants: ${userPromptHint}\n` : "",
      `Repository: ${repo.name}`,
      strategySection,
      repoContext ? `\n\nRepository files:\n${repoContext}` : "",
    ].join("\n");

    try {
      let rawJson: string;

      if (requestProvider === "jait") {
        const apiKeys = userService?.getSettings(user.id).apiKeys ?? {};
        const apiKey = apiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
        const baseUrl = (apiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl).replace(/\/+$/, "");
        const model = requestModel || apiKeys["OPENAI_MODEL"]?.trim() || config.openaiModel;

        if (!apiKey && config.llmProvider === "openai") {
          return reply.status(400).send({ error: "No API key configured." });
        }

        if (apiKey || config.llmProvider === "openai") {
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0.4,
              max_tokens: 3000,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
              ],
            }),
          });
          if (!response.ok) throw new Error(`LLM API returned ${response.status}`);
          const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          rawJson = data.choices?.[0]?.message?.content?.trim() ?? "[]";
        } else {
          const response = await fetch(`${config.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: requestModel || config.ollamaModel,
              stream: false,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
              ],
            }),
          });
          if (!response.ok) throw new Error(`Ollama API returned ${response.status}`);
          const data = await response.json() as { message?: { content?: string } };
          rawJson = data.message?.content?.trim() ?? "[]";
        }
      } else {
        if (!deps.providerRegistry) {
          return reply.status(501).send({ error: "CLI provider-backed task generation is not configured" });
        }

        let cliProvider: CliProviderAdapter | null = null;
        const remoteNodeId = findRemoteNodeForCwd(repo.localPath, requestProvider);
        if (remoteNodeId && ws) {
          cliProvider = new RemoteCliProvider(ws, remoteNodeId, requestProvider);
        }
        if (!cliProvider) {
          cliProvider = deps.providerRegistry.get(requestProvider) ?? null;
        }
        if (!cliProvider) {
          return reply.status(400).send({ error: `Unknown provider: ${requestProvider}` });
        }
        const available = await cliProvider.checkAvailability();
        if (!available) {
          return reply.status(400).send({ error: cliProvider.info.unavailableReason ?? `Provider ${requestProvider} is not available` });
        }

        const prompt = `${systemPrompt}\n\n${userContent}`.trim();
        rawJson = await runPromptWithCliProvider(cliProvider, repo.localPath, prompt, requestModel);
      }

      // Strip markdown fences if the model wrapped the output
      rawJson = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

      let generated: Array<{
        title?: string;
        description?: string;
        skillCandidate?: boolean;
        skillTitle?: string | null;
        skillRationale?: string;
      }>;
      try {
        generated = JSON.parse(rawJson);
      } catch {
        return reply.status(500).send({ error: "LLM returned invalid JSON", raw: rawJson });
      }

      if (!Array.isArray(generated)) {
        return reply.status(500).send({ error: "LLM did not return an array" });
      }

      const tasks: PlanTask[] = generated
        .filter((t) => t.title)
        .map((t) => ({
          id: newTaskId(),
          title: t.title ?? "Untitled task",
          description: t.description ?? "",
          status: "proposed" as const,
          skillCandidate: t.skillCandidate === true,
          skillTitle: typeof t.skillTitle === "string" && t.skillTitle.trim() ? t.skillTitle.trim() : undefined,
          skillRationale: typeof t.skillRationale === "string" && t.skillRationale.trim() ? t.skillRationale.trim() : undefined,
        }));

      // Merge with existing tasks (append generated ones)
      const allTasks = [...plan.tasks, ...tasks];
      const updated = planService.update(plan.id, { tasks: allTasks });

      if (updated) broadcastPlanEvent("updated", { plan: updated });
      return { plan: updated, generated: tasks.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Task generation failed: ${msg}` });
    }
  });

  // ── START a single task ──────────────────────────────────────────

  app.post<{ Params: { id: string; taskId: string } }>(
    "/api/plans/:id/tasks/:taskId/start",
    async (request, reply) => {
      const user = await requireAuth(request, reply, config.jwtSecret);
      if (!user) return;

      const plan = getOwnedPlan(request.params.id, user.id);
      if (!assertOwnership(reply, plan, user.id, "Plan not found")) return;

      const task = plan.tasks.find((t) => t.id === request.params.taskId);
      if (!task) return reply.status(404).send({ error: "Task not found in plan" });

      if (task.threadId) {
        return reply.status(409).send({ error: "Task already has a thread" });
      }

      const repo = getOwnedRepo(plan.repoId, user.id);
      if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

      // The actual thread creation and start is handled by the frontend
      // the task info — the frontend will create the thread using the
      // existing agentsApi.createThread + startThread flow, then PATCH
      // the plan task with the threadId. This keeps the plan routes simple
      // and avoids duplicating the complex thread start logic.

      // Mark task as approved if still proposed
      if (task.status === "proposed") {
        planService.updateTask(plan.id, task.id, { status: "approved" });
      }

      const updatedPlan = planService.getById(plan.id);
      if (updatedPlan) broadcastPlanEvent("updated", { plan: updatedPlan });

      return {
        task,
        repo: {
          id: repo.id,
          name: repo.name,
          localPath: repo.localPath,
          defaultBranch: repo.defaultBranch,
          githubUrl: repo.githubUrl,
        },
      };
    },
  );

  // ── START all approved tasks ─────────────────────────────────────

  app.post<{ Params: { id: string } }>("/api/plans/:id/start", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const plan = getOwnedPlan(request.params.id, user.id);
    if (!assertOwnership(reply, plan, user.id, "Plan not found")) return;

    const approved = plan.tasks.filter((t) => t.status === "approved" && !t.threadId);
    if (approved.length === 0) {
      return reply.status(400).send({ error: "No approved tasks to start" });
    }

    // Mark plan as active
    planService.update(plan.id, { status: "active" });

    const repo = getOwnedRepo(plan.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    // Return the list of tasks to start — the frontend handles
    // thread creation for each one (parallelizing as it sees fit).
    const updatedPlan = planService.getById(plan.id);
    if (updatedPlan) broadcastPlanEvent("updated", { plan: updatedPlan });

    return {
      tasks: approved,
      repo: {
        id: repo.id,
        name: repo.name,
        localPath: repo.localPath,
        defaultBranch: repo.defaultBranch,
        githubUrl: repo.githubUrl,
      },
    };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function gatherRepoContext(repoPath: string): string {
  const sections: string[] = [];
  const MAX_FILE_SIZE = 8000;
  const keyFiles = [
    "package.json", "README.md", "AGENTS.md", "CLAUDE.md",
    ".github/copilot-instructions.md",
    "Cargo.toml", "pyproject.toml", "go.mod",
    "Makefile", "Dockerfile", "docker-compose.yml",
    "tsconfig.json",
  ];

  for (const file of keyFiles) {
    const fullPath = join(repoPath, file);
    try {
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const content = readFileSync(fullPath, "utf-8").slice(0, MAX_FILE_SIZE);
        sections.push(`### ${file}\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch { /* skip */ }
  }

  try {
    const entries = readdirSync(repoPath, { withFileTypes: true })
      .slice(0, 50)
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    sections.unshift(`### Directory listing\n\`\`\`\n${entries}\n\`\`\``);
  } catch { /* skip */ }

  return sections.join("\n\n");
}
