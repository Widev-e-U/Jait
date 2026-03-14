/**
 * Automation Repository REST routes.
 *
 *   GET    /api/repos       — list repositories for the authenticated user
 *   POST   /api/repos       — create a repository
 *   PATCH  /api/repos/:id   — update a repository
 *   DELETE /api/repos/:id   — delete a repository
 */

import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { RepositoryService } from "../services/repositories.js";
import type { UserService } from "../services/users.js";
import type { WsControlPlane } from "../ws.js";
import { requireAuth } from "../security/http-auth.js";
import type { WsEventType } from "@jait/shared";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface RepoRouteDeps {
  repoService: RepositoryService;
  userService?: UserService;
  ws?: WsControlPlane;
}

export function registerRepoRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: RepoRouteDeps,
): void {
  const { repoService, userService, ws } = deps;

  /** Broadcast a repo event over WS to all clients */
  function broadcastRepoEvent(event: string, data: unknown): void {
    if (!ws) return;
    ws.broadcastAll({
      type: `repo.${event}` as WsEventType,
      sessionId: "",
      timestamp: new Date().toISOString(),
      payload: data as Record<string, unknown>,
    });
  }

  // ── LIST ─────────────────────────────────────────────────────────

  app.get("/api/repos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;
    const repos = repoService.list(user.id);
    return { repos };
  });

  // ── CREATE ───────────────────────────────────────────────────────

  app.post("/api/repos", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = request.body as {
      name: string;
      defaultBranch?: string;
      localPath: string;
      deviceId?: string;
      githubUrl?: string;
    };

    if (!body.name || !body.localPath) {
      return reply.status(400).send({ error: "name and localPath are required" });
    }

    // Prevent duplicate path for same user
    const existing = repoService.findByPath(body.localPath, user.id);
    if (existing) {
      // If re-registered from a different device, update deviceId
      if (body.deviceId && existing.deviceId !== body.deviceId) {
        const updated = repoService.update(existing.id, { deviceId: body.deviceId });
        if (updated) {
          broadcastRepoEvent("updated", { repo: updated });
          return { repo: updated };
        }
      }
      return { repo: existing };
    }

    const repo = repoService.create({
      userId: user.id,
      deviceId: body.deviceId,
      name: body.name,
      defaultBranch: body.defaultBranch,
      localPath: body.localPath,
      githubUrl: body.githubUrl,
    });

    broadcastRepoEvent("created", { repo });
    return { repo };
  });

  // ── UPDATE ───────────────────────────────────────────────────────

  app.patch<{ Params: { id: string } }>("/api/repos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = request.body as {
      name?: string;
      defaultBranch?: string;
      localPath?: string;
      githubUrl?: string;
      deviceId?: string;
      strategy?: string | null;
    };

    const repo = repoService.update(request.params.id, body);
    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    broadcastRepoEvent("updated", { repo });
    return { repo };
  });

  // ── STRATEGY ─────────────────────────────────────────────────────

  /** Get strategy markdown for a repo */
  app.get<{ Params: { id: string } }>("/api/repos/:id/strategy", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const repo = repoService.getById(request.params.id);
    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    return { strategy: repo.strategy ?? "" };
  });

  /** Update strategy markdown for a repo */
  app.put<{ Params: { id: string } }>("/api/repos/:id/strategy", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = request.body as { strategy: string };
    if (typeof body.strategy !== "string") {
      return reply.status(400).send({ error: "strategy must be a string" });
    }

    const repo = repoService.update(request.params.id, { strategy: body.strategy });
    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    broadcastRepoEvent("updated", { repo });
    return { strategy: repo.strategy ?? "" };
  });

  /** Generate a strategy by analyzing the repo with an LLM */
  app.post<{ Params: { id: string } }>("/api/repos/:id/strategy/generate", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const repo = repoService.getById(request.params.id);
    if (!repo) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    // Gather context from the repo if locally accessible
    let repoContext = "";
    if (existsSync(repo.localPath)) {
      repoContext = gatherRepoContext(repo.localPath);
    }

    // Build LLM prompt
    const systemPrompt = [
      "You are a senior developer writing a strategy document for an AI coding agent.",
      "The strategy tells the agent how to work in this repository — build commands,",
      "test commands, coding conventions, project structure, workflow guidelines, etc.",
      "Output ONLY markdown, no wrapping code fences. Be concise and practical.",
    ].join(" ");

    const userPrompt = repoContext
      ? `Generate a strategy document for the repository "${repo.name}".\n\nHere is context from the repo:\n\n${repoContext}`
      : `Generate a strategy document for a repository named "${repo.name}". Since the repo isn't accessible locally, generate a sensible default template.`;

    // Resolve API keys
    const apiKeys = userService?.getSettings(user.id).apiKeys ?? {};
    const apiKey = apiKeys["OPENAI_API_KEY"]?.trim() || config.openaiApiKey;
    const baseUrl = (apiKeys["OPENAI_BASE_URL"]?.trim() || config.openaiBaseUrl).replace(/\/+$/, "");
    const model = apiKeys["OPENAI_MODEL"]?.trim() || config.openaiModel;

    if (!apiKey && config.llmProvider === "openai") {
      return reply.status(400).send({ error: "No API key configured. Set an OpenAI API key in settings." });
    }

    try {
      let generated: string;

      if (apiKey || config.llmProvider === "openai") {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 2000,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`LLM API returned ${response.status}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        generated = data.choices?.[0]?.message?.content?.trim() ?? "";
      } else {
        // Ollama fallback
        const response = await fetch(`${config.ollamaUrl.replace(/\/+$/, "")}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.ollamaModel,
            stream: false,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama API returned ${response.status}`);
        }

        const data = await response.json() as { message?: { content?: string } };
        generated = data.message?.content?.trim() ?? "";
      }

      if (!generated) {
        return reply.status(500).send({ error: "LLM returned empty strategy" });
      }

      return { strategy: generated };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Strategy generation failed: ${msg}` });
    }
  });

  // ── DELETE ───────────────────────────────────────────────────────

  app.delete<{ Params: { id: string } }>("/api/repos/:id", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const existing = repoService.getById(request.params.id);
    if (!existing) {
      return reply.status(404).send({ error: "Repository not found" });
    }

    repoService.delete(request.params.id);
    broadcastRepoEvent("deleted", { repoId: request.params.id });
    return { ok: true };
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Read key files from a repo to build context for strategy generation. */
function gatherRepoContext(repoPath: string): string {
  const sections: string[] = [];
  const MAX_FILE_SIZE = 8000; // bytes

  // Key files to look for
  const keyFiles = [
    "package.json",
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".github/copilot-instructions.md",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "Makefile",
    "Dockerfile",
    "docker-compose.yml",
    "tsconfig.json",
    ".eslintrc.json",
    "biome.json",
  ];

  for (const file of keyFiles) {
    const fullPath = join(repoPath, file);
    try {
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const content = readFileSync(fullPath, "utf-8").slice(0, MAX_FILE_SIZE);
        sections.push(`### ${file}\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch { /* skip unreadable files */ }
  }

  // Add top-level directory listing
  try {
    const entries = readdirSync(repoPath, { withFileTypes: true })
      .slice(0, 50)
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    sections.unshift(`### Directory listing\n\`\`\`\n${entries}\n\`\`\``);
  } catch { /* skip */ }

  return sections.join("\n\n");
}
