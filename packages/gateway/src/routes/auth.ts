import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { UserService, ThemeMode } from "../services/users.js";
import { requireAuth, signAuthToken } from "../security/http-auth.js";

const THEME_VALUES = new Set<ThemeMode>(["light", "dark", "system"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function sanitizeApiKeys(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    out[key] = value.trim();
  }
  return out;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  config: AppConfig,
  users: UserService,
) {
  app.post("/auth/register", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return reply.status(400).send({ detail: "username and password are required" });
    }
    if (password.length < 8) {
      return reply.status(400).send({ detail: "password must be at least 8 characters" });
    }

    if (users.findByUsername(username)) {
      return reply.status(409).send({ detail: "username already exists" });
    }

    const created = users.createUser(username, password);
    const token = await signAuthToken({ id: created.id, username: created.username }, config.jwtSecret);
    return reply.send({
      access_token: token,
      user: {
        id: created.id,
        username: created.username,
      },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const body = (request.body as Record<string, unknown>) ?? {};
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      return reply.status(400).send({ detail: "username and password are required" });
    }

    const user = users.verifyCredentials(username, password);
    if (!user) {
      return reply.status(401).send({ detail: "invalid_credentials" });
    }

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    return reply.send({
      access_token: token,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  });

  app.get("/auth/me", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const user = users.findById(authUser.id);
    if (!user) {
      return reply.status(401).send({ detail: "login_required" });
    }
    return {
      id: user.id,
      username: user.username,
    };
  });

  app.get("/auth/settings", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const settings = users.getSettings(authUser.id);
    return {
      theme: settings.theme,
      api_keys: settings.apiKeys,
      updated_at: settings.updatedAt,
    };
  });

  app.patch("/auth/settings", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const patch: { theme?: ThemeMode; apiKeys?: Record<string, string> } = {};

    if (typeof body.theme === "string" && THEME_VALUES.has(body.theme as ThemeMode)) {
      patch.theme = body.theme as ThemeMode;
    }

    const apiKeysInput = asRecord(body.api_keys);
    if (apiKeysInput) {
      patch.apiKeys = sanitizeApiKeys(apiKeysInput);
    }

    const updated = users.updateSettings(authUser.id, patch);
    return {
      theme: updated.theme,
      api_keys: updated.apiKeys,
      updated_at: updated.updatedAt,
    };
  });

  app.delete("/auth/settings/archive", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const removed = users.clearArchivedSessions(authUser.id);
    return { ok: true, removed };
  });

  // Returns which API key fields have values set via environment variables
  // (without exposing the actual values)
  app.get("/auth/settings/env-status", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;

    const ENV_KEY_MAP: Record<string, string> = {
      OPENAI_API_KEY: "OPENAI_API_KEY",
      OPENAI_BASE_URL: "OPENAI_BASE_URL",
      OPENAI_MODEL: "OPENAI_MODEL",
      OPENAI_WEB_SEARCH_MODEL: "OPENAI_WEB_SEARCH_MODEL",
      BRAVE_API_KEY: "BRAVE_API_KEY",
      PERPLEXITY_API_KEY: "PERPLEXITY_API_KEY",
      OPENROUTER_API_KEY: "OPENROUTER_API_KEY",
      XAI_API_KEY: "XAI_API_KEY",
      GEMINI_API_KEY: "GEMINI_API_KEY",
      MOONSHOT_API_KEY: "MOONSHOT_API_KEY",
      KIMI_BASE_URL: "KIMI_BASE_URL",
      KIMI_MODEL: "KIMI_MODEL",
      PERPLEXITY_MODEL: "PERPLEXITY_MODEL",
      PERPLEXITY_OPENROUTER_MODEL: "PERPLEXITY_OPENROUTER_MODEL",
      GROK_MODEL: "GROK_MODEL",
      GEMINI_MODEL: "GEMINI_MODEL",
    };

    const env_set: Record<string, boolean> = {};
    for (const [field, envVar] of Object.entries(ENV_KEY_MAP)) {
      env_set[field] = !!process.env[envVar];
    }

    return { env_set };
  });

  app.post("/auth/session/bind", async (request, reply) => {
    const authUser = await requireAuth(request, reply, config.jwtSecret);
    if (!authUser) return;
    const body = (request.body as Record<string, unknown>) ?? {};
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return reply.status(400).send({ detail: "session_id is required" });
    }
    const bound = users.bindSessionToUser(authUser.id, sessionId);
    if (!bound) {
      return reply.status(404).send({ detail: "session not found" });
    }
    return { ok: true };
  });
}

