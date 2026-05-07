import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import type { CliProviderAdapter, ProviderEvent, ProviderId, RuntimeMode } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { RemoteCliProvider } from "../providers/remote-cli-provider.js";
import type { RepositoryService } from "../services/repositories.js";
import type { RepoProposalService } from "../services/repo-proposals.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import { assertOwnership } from "../security/ownership.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RepoProposalRouteDeps {
  repoService: RepositoryService;
  repoProposalService: RepoProposalService;
  userService?: UserService;
  providerRegistry?: ProviderRegistry;
  ws?: WsControlPlane;
}

export function registerRepoProposalRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: RepoProposalRouteDeps,
): void {
  const { repoService, repoProposalService, userService, providerRegistry, ws } = deps;
  const validStatuses = new Set(["open", "in_progress", "done"]);
  const validPriorities = new Set(["low", "normal", "high"]);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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
    runtimeMode: RuntimeMode,
    model?: string,
  ): Promise<string> {
    const session = await provider.startSession({
      threadId: `todo-generate-${randomUUID()}`,
      workingDirectory: cwd,
      mode: runtimeMode,
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
      if (!turnCompleted && !sessionError) throw new Error("CLI provider turn did not complete");
      return (tokenContent || messageContent).trim();
    } finally {
      unsubscribe();
      try { await provider.stopSession(session.id); } catch { /* best effort */ }
    }
  }

  function normalizeTags(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];
    return [...new Set(value
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean))]
      .slice(0, 12);
  }

  function normalizeDueDate(value: unknown): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    return typeof value === "string" && datePattern.test(value) ? value : null;
  }

  function getOwnedRepo(repoId: string, userId: string) {
    const repo = repoService.getById(repoId);
    return repo?.userId === userId ? repo : null;
  }

  function getOwnedProposal(id: string, userId: string) {
    const proposal = repoProposalService.getById(id);
    return proposal?.userId === userId ? proposal : null;
  }

  app.get<{ Params: { repoId: string } }>("/api/repos/:repoId/proposals", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;
    return { proposals: repoProposalService.listByRepo(repo.id) };
  });

  app.get<{ Params: { repoId: string } }>("/api/repos/:repoId/todos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;
    return { todos: repoProposalService.listByRepo(repo.id) };
  });

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/proposals", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as {
      message?: string;
      status?: string;
      priority?: string;
      dueDate?: string | null;
      tags?: string[];
      sourceThreadId?: string | null;
      sourceThreadTitle?: string | null;
    };
    const message = body.message?.trim() ?? "";
    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }

    const proposal = repoProposalService.create({
      repoId: repo.id,
      userId: user.id,
      message,
      status: validStatuses.has(body.status ?? "") ? body.status : undefined,
      priority: validPriorities.has(body.priority ?? "") ? body.priority : undefined,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
      sourceThreadId: body.sourceThreadId,
      sourceThreadTitle: body.sourceThreadTitle,
    });
    return reply.status(201).send({ proposal });
  });

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/todos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as {
      message?: string;
      status?: string;
      priority?: string;
      dueDate?: string | null;
      tags?: string[];
      sourceThreadId?: string | null;
      sourceThreadTitle?: string | null;
    };
    const message = body.message?.trim() ?? "";
    if (!message) {
      return reply.status(400).send({ error: "message is required" });
    }

    const todo = repoProposalService.create({
      repoId: repo.id,
      userId: user.id,
      message,
      status: validStatuses.has(body.status ?? "") ? body.status : undefined,
      priority: validPriorities.has(body.priority ?? "") ? body.priority : undefined,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
      sourceThreadId: body.sourceThreadId,
      sourceThreadTitle: body.sourceThreadTitle,
    });
    return reply.status(201).send({ todo });
  });

  app.post<{ Params: { repoId: string } }>("/api/repos/:repoId/todos/generate", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repo = getOwnedRepo(request.params.repoId, user.id);
    if (!assertOwnership(reply, repo, user.id, "Repository not found")) return;

    const body = request.body as { prompt?: string; provider?: ProviderId; model?: string | null; runtimeMode?: RuntimeMode } | undefined;
    const userPromptHint = body?.prompt?.trim() ?? "";
    const requestProvider = body?.provider ?? "jait";
    const requestModel = body?.model?.trim() || undefined;
    const requestRuntimeMode: RuntimeMode = body?.runtimeMode === "supervised" ? "supervised" : "full-access";
    const existingTodos = repoProposalService.listByRepo(repo.id);
    const existingMessages = new Set(existingTodos.map((todo) => todo.message.trim().toLowerCase()));

    let repoContext = "";
    if (existsSync(repo.localPath)) {
      repoContext = gatherRepoContext(repo.localPath);
    }

    const strategySection = repo.strategy?.trim()
      ? `\n\n### Repository Strategy\n${repo.strategy.trim()}`
      : "";

    const systemPrompt = [
      "You are a senior software engineer reviewing a workspace for useful future todo items.",
      "Generate concrete, actionable follow-up tasks that an AI coding agent could later run.",
      "Prefer high-signal items: tests, bugs, cleanup, missing docs, UX polish, reliability, and developer workflow improvements.",
      "Do not include vague tasks, duplicates, or work that is already represented by existing todos.",
      "",
      "Respond with a JSON array of objects. Each object must have:",
      '  { "message": "clear agent prompt", "priority": "low|normal|high", "tags": ["short-tag"], "dueDate": null }',
      "",
      "Generate 3 to 8 items. dueDate should almost always be null unless a real deadline is obvious.",
      "Output ONLY the JSON array, no markdown fences, no explanation.",
    ].join("\n");

    const userContent = [
      userPromptHint ? `User guidance: ${userPromptHint}\n` : "",
      `Repository: ${repo.name}`,
      existingTodos.length > 0
        ? `\nExisting todos:\n${existingTodos.slice(0, 30).map((todo) => `- ${todo.message}`).join("\n")}`
        : "",
      strategySection,
      repoContext ? `\n\nRepository context:\n${repoContext}` : "",
    ].join("\n");

    try {
      let rawJson: string;
      if (requestProvider === "jait") {
        rawJson = await generateTodoJson({
          config,
          userService,
          userId: user.id,
          systemPrompt,
          userContent,
          model: requestModel,
        });
      } else {
        if (!providerRegistry) {
          return reply.status(501).send({ error: "CLI provider-backed todo generation is not configured" });
        }
        let cliProvider: CliProviderAdapter | null = null;
        const remoteNodeId = findRemoteNodeForCwd(repo.localPath, requestProvider);
        if (remoteNodeId && ws) {
          cliProvider = new RemoteCliProvider(ws, remoteNodeId, requestProvider);
        }
        if (!cliProvider) {
          cliProvider = providerRegistry.get(requestProvider) ?? null;
        }
        if (!cliProvider) {
          return reply.status(400).send({ error: `Unknown provider: ${requestProvider}` });
        }
        const available = await cliProvider.checkAvailability();
        if (!available) {
          return reply.status(400).send({ error: cliProvider.info.unavailableReason ?? `Provider ${requestProvider} is not available` });
        }

        const prompt = `${systemPrompt}\n\n${userContent}`.trim();
        rawJson = await runPromptWithCliProvider(cliProvider, repo.localPath, prompt, requestRuntimeMode, requestModel);
      }
      const generated = parseGeneratedTodos(rawJson);
      const todos = generated
        .filter((item) => item.message && !existingMessages.has(item.message.trim().toLowerCase()))
        .slice(0, 8)
        .map((item) => repoProposalService.create({
          repoId: repo.id,
          userId: user.id,
          message: item.message.trim(),
          priority: validPriorities.has(item.priority ?? "") ? item.priority : undefined,
          dueDate: normalizeDueDate(item.dueDate),
          tags: normalizeTags(item.tags),
        }));

      return { todos, generated: todos.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Todo generation failed: ${message}` });
    }
  });

  app.patch<{ Params: { id: string } }>("/api/repo-proposals/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;

    const body = request.body as { message?: string; status?: string; priority?: string; dueDate?: string | null; tags?: string[] };
    const message = body.message?.trim();
    if (message !== undefined && !message) {
      return reply.status(400).send({ error: "message must not be empty" });
    }
    if (body.status !== undefined && !validStatuses.has(body.status)) {
      return reply.status(400).send({ error: "invalid status" });
    }
    if (body.priority !== undefined && !validPriorities.has(body.priority)) {
      return reply.status(400).send({ error: "invalid priority" });
    }

    const proposal = repoProposalService.update(existing.id, {
      message,
      status: body.status,
      priority: body.priority,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
    });
    return { proposal };
  });

  app.patch<{ Params: { id: string } }>("/api/jait-todos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;

    const body = request.body as { message?: string; status?: string; priority?: string; dueDate?: string | null; tags?: string[] };
    const message = body.message?.trim();
    if (message !== undefined && !message) {
      return reply.status(400).send({ error: "message must not be empty" });
    }
    if (body.status !== undefined && !validStatuses.has(body.status)) {
      return reply.status(400).send({ error: "invalid status" });
    }
    if (body.priority !== undefined && !validPriorities.has(body.priority)) {
      return reply.status(400).send({ error: "invalid priority" });
    }

    const todo = repoProposalService.update(existing.id, {
      message,
      status: body.status,
      priority: body.priority,
      dueDate: normalizeDueDate(body.dueDate),
      tags: normalizeTags(body.tags),
    });
    return { todo };
  });

  app.delete<{ Params: { id: string } }>("/api/repo-proposals/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;
    repoProposalService.delete(existing.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/jait-todos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const existing = getOwnedProposal(request.params.id, user.id);
    if (!assertOwnership(reply, existing, user.id, "Todo not found")) return;
    repoProposalService.delete(existing.id);
    return { ok: true };
  });
}

interface GeneratedTodo {
  message: string;
  priority?: string;
  dueDate?: string | null;
  tags?: string[];
}

async function generateTodoJson(options: {
  config: AppConfig;
  userService?: UserService;
  userId: string;
  systemPrompt: string;
  userContent: string;
  model?: string;
}): Promise<string> {
  const { config, userService, userId, systemPrompt, userContent } = options;
  const apiKeys = userService?.getSettings(userId).apiKeys ?? {};
  const apiKey = apiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
  const baseUrl = (apiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl).replace(/\/+$/, "");
  const model = options.model || apiKeys["OPENAI_MODEL"]?.trim() || config.openaiModel;

  if (!apiKey && config.llmProvider === "openai") {
    throw new Error("No API key configured. Set an OpenAI API key in settings.");
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
        temperature: 0.35,
        max_tokens: 2500,
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
    return data.choices?.[0]?.message?.content?.trim() ?? "[]";
  }

  const response = await fetch(`${config.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama API returned ${response.status}`);
  const data = await response.json() as { message?: { content?: string } };
  return data.message?.content?.trim() ?? "[]";
}

function parseGeneratedTodos(rawJson: string): GeneratedTodo[] {
  const stripped = rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = JSON.parse(stripped) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("LLM did not return an array");
  }
  return parsed
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      message: typeof item.message === "string"
        ? item.message
        : typeof item.title === "string"
          ? item.title
          : "",
      priority: typeof item.priority === "string" ? item.priority : undefined,
      dueDate: typeof item.dueDate === "string" || item.dueDate === null ? item.dueDate : null,
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
    }));
}

function gatherRepoContext(repoPath: string): string {
  const sections: string[] = [];
  const maxFileSize = 8000;
  const keyFiles = [
    "package.json", "README.md", "AGENTS.md", "CLAUDE.md",
    ".github/copilot-instructions.md", "Cargo.toml", "pyproject.toml", "go.mod",
    "Makefile", "Dockerfile", "docker-compose.yml", "tsconfig.json",
  ];

  for (const file of keyFiles) {
    const fullPath = join(repoPath, file);
    try {
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const content = readFileSync(fullPath, "utf-8").slice(0, maxFileSize);
        sections.push(`### ${file}\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch { /* skip unreadable files */ }
  }

  try {
    const entries = readdirSync(repoPath, { withFileTypes: true })
      .slice(0, 50)
      .map((entry) => `${entry.isDirectory() ? "dir" : "file"} ${entry.name}`)
      .join("\n");
    sections.unshift(`### Directory listing\n\`\`\`\n${entries}\n\`\`\``);
  } catch { /* skip unreadable directories */ }

  return sections.join("\n\n");
}
