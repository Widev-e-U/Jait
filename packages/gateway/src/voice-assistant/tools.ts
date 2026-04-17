/**
 * Voice-assistant tool definitions for OpenAI Realtime API function calling.
 *
 * Each tool is defined as an OpenAI-compatible function schema plus a local
 * executor that runs inside the gateway with full access to Jait services.
 */

import type { SessionService } from "../services/sessions.js";
import type { SessionStateService } from "../services/session-state.js";
import type { ThreadService } from "../services/threads.js";
import { resolveThreadSelectionDefaults } from "../services/thread-defaults.js";
import type { UserService } from "../services/users.js";
import type { WorkspaceService } from "../services/workspaces.js";
import type { MemoryService } from "../memory/contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { CliProviderAdapter, ProviderEvent, ProviderId, RuntimeMode } from "../providers/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { AppConfig } from "../config.js";
import { hostname, platform, cpus, totalmem, freemem } from "node:os";

export interface VoiceToolDeps {
  config: AppConfig;
  userId?: string;
  userService?: UserService;
  sessionService?: SessionService;
  sessionState?: SessionStateService;
  threadService?: ThreadService;
  workspaceService?: WorkspaceService;
  memoryService?: MemoryService;
  toolRegistry?: ToolRegistry;
  providerRegistry?: ProviderRegistry;
  toolExecutor?: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  /** Per-connection user API keys (from user settings). */
  userApiKeys?: Record<string, string>;
  /** Client IP from the voice WebSocket request, used only for coarse location lookup. */
  clientIp?: string;
}

/** OpenAI function-calling tool schema */
export interface RealtimeToolDef {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A voice-assistant tool: schema + executor */
export interface VoiceTool {
  schema: RealtimeToolDef;
  execute: (args: Record<string, unknown>, deps: VoiceToolDeps) => Promise<string>;
}

// ── Tool implementations ────────────────────────────────────────

const getTimeAndDate: VoiceTool = {
  schema: {
    type: "function",
    name: "get_time_and_date",
    description: "Get the current date, time, and day of the week. Use when the user asks what time or date it is.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async () => {
    const now = new Date();
    return `Current date and time: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${now.toLocaleTimeString("en-US")}`;
  },
};

const getSystemInfo: VoiceTool = {
  schema: {
    type: "function",
    name: "get_system_info",
    description: "Get host computer information: OS, CPU, memory usage. Use when the user asks about system resources.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async () => {
    const totalGB = (totalmem() / 1073741824).toFixed(1);
    const freeGB = (freemem() / 1073741824).toFixed(1);
    const usedGB = ((totalmem() - freemem()) / 1073741824).toFixed(1);
    return JSON.stringify({
      hostname: hostname(),
      platform: platform(),
      cpus: cpus().length,
      cpuModel: cpus()[0]?.model ?? "unknown",
      memoryTotalGB: totalGB,
      memoryUsedGB: usedGB,
      memoryFreeGB: freeGB,
    });
  },
};

interface ResolvedLocation {
  label: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  source: string;
}

function parseConfiguredLocation(value: string): ResolvedLocation {
  const label = value.trim();
  return { label, city: label, source: "configured" };
}

function locationFromGeoJson(data: Record<string, unknown>): ResolvedLocation | null {
  const city = String(data["city"] ?? "").trim();
  const region = String(data["region"] ?? data["regionName"] ?? "").trim();
  const country = String(data["country_name"] ?? data["country"] ?? "").trim();
  const latitude = Number(data["latitude"] ?? data["lat"]);
  const longitude = Number(data["longitude"] ?? data["lon"]);
  const parts = [city, region, country].filter(Boolean);
  if (parts.length === 0) return null;
  return {
    label: parts.join(", "),
    city: city || undefined,
    region: region || undefined,
    country: country || undefined,
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    source: "ip",
  };
}

async function resolveLocation(deps: VoiceToolDeps): Promise<ResolvedLocation | null> {
  const configured =
    deps.userApiKeys?.["JAIT_LOCATION"] ??
    deps.userApiKeys?.["LOCATION"] ??
    process.env["JAIT_LOCATION"] ??
    process.env["LOCATION"];
  if (configured?.trim()) return parseConfiguredLocation(configured);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const ip = deps.clientIp && !deps.clientIp.startsWith("127.") && deps.clientIp !== "::1"
      ? deps.clientIp.replace(/^::ffff:/, "")
      : "";
    const url = ip
      ? `https://ipapi.co/${encodeURIComponent(ip)}/json/`
      : "https://ipapi.co/json/";
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return locationFromGeoJson(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const PROVIDER_IDS: ProviderId[] = ["jait", "codex", "claude-code", "gemini", "opencode", "copilot"];
const DEFAULT_AGENT_TIMEOUT_MS = 45_000;

function normalizeProviderId(value: unknown): ProviderId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return PROVIDER_IDS.includes(normalized as ProviderId) ? normalized as ProviderId : null;
}

function resolveVoiceAgentProvider(
  deps: VoiceToolDeps,
  requestedProvider: unknown,
): { providerId?: ProviderId; model?: string; runtimeMode: RuntimeMode; error?: string } {
  const requested = normalizeProviderId(requestedProvider);
  if (requested) {
    if (!deps.providerRegistry?.get(requested)) {
      return { runtimeMode: "full-access", error: `Provider '${requested}' is not registered on this gateway.` };
    }
    return { providerId: requested, runtimeMode: "full-access" };
  }

  const defaults = resolveThreadSelectionDefaults({
    userId: deps.userId,
    sessionId: "voice-assistant",
    userService: deps.userService,
    sessionState: deps.sessionState,
  });
  const defaultProvider = normalizeProviderId(defaults.providerId);
  if (defaultProvider && deps.providerRegistry?.get(defaultProvider)) {
    return {
      providerId: defaultProvider,
      model: defaults.model,
      runtimeMode: defaults.runtimeMode ?? "full-access",
    };
  }

  for (const providerId of PROVIDER_IDS) {
    if (deps.providerRegistry?.get(providerId)) {
      return { providerId, runtimeMode: defaults.runtimeMode ?? "full-access" };
    }
  }

  return { runtimeMode: "full-access", error: "No regular agent provider is registered on this gateway." };
}

function formatAgentQuestion(question: string): string {
  return [
    "You are answering a voice assistant that is helping the user in Jait.",
    "Answer the user's question directly and clearly.",
    "Prefer plain text that works well for text-to-speech.",
    "Keep the answer concise, but include the key explanation the voice assistant is missing.",
    "If important context is missing, say exactly what is missing.",
    "",
    `User question: ${question.trim()}`,
  ].join("\n");
}

function clampVoiceTimeout(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_AGENT_TIMEOUT_MS;
  return Math.min(Math.max(Math.floor(parsed), 5_000), 120_000);
}

async function waitForDelegatedAgentAnswer(
  provider: CliProviderAdapter,
  sessionId: string,
  timeoutMs: number,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    let tokenBuffer = "";
    let latestAssistantMessage = "";

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Timed out after ${timeoutMs}ms waiting for the agent response.`)));
    }, timeoutMs);

    const unsubscribe = provider.onEvent((event: ProviderEvent) => {
      if (event.sessionId !== sessionId || settled) return;

      if (event.type === "token") {
        tokenBuffer += event.content;
        return;
      }

      if (event.type === "message" && event.role === "assistant") {
        latestAssistantMessage = event.content.trim();
        return;
      }

      if (event.type === "tool.approval-required") {
        finish(() => reject(new Error(`Agent requires approval for tool '${event.tool}', so the voice handoff could not finish automatically.`)));
        return;
      }

      if (event.type === "session.error") {
        finish(() => reject(new Error(event.error)));
        return;
      }

      if (event.type === "turn.completed" || event.type === "session.completed") {
        const content = latestAssistantMessage || tokenBuffer.trim();
        finish(() => {
          if (!content) {
            reject(new Error("The agent completed without returning a usable answer."));
            return;
          }
          resolve(content);
        });
      }
    });

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      callback();
    };
  });
}

const systemStatus: VoiceTool = {
  schema: {
    type: "function",
    name: "jait_system_status",
    description: "Get the Jait system status: active sessions, workspaces, running threads. Use when the user asks what's going on or the system state.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async (_args, deps) => {
    const sessions = deps.sessionService?.list?.(undefined, undefined, 10) ?? [];
    const threads = deps.threadService?.list?.(undefined, 50) ?? [];
    const running = deps.threadService?.listRunning?.() ?? [];
    return JSON.stringify({
      activeSessions: Array.isArray(sessions) ? sessions.length : 0,
      runningThreads: Array.isArray(running) ? running.length : 0,
      totalThreads: Array.isArray(threads) ? threads.length : 0,
    });
  },
};

const listSessions: VoiceTool = {
  schema: {
    type: "function",
    name: "list_sessions",
    description: "List recent Jait chat sessions with titles and IDs. Use when the user asks what conversations are open.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async (_args, deps) => {
    const sessions = deps.sessionService?.list?.(undefined, undefined, 10) ?? [];
    if (!Array.isArray(sessions) || sessions.length === 0) return "No active sessions found.";
    return sessions.map((s: any) => `- ${s.name ?? "Untitled"} (id: ${s.id})`).join("\n");
  },
};

const listWorkspaces: VoiceTool = {
  schema: {
    type: "function",
    name: "list_workspaces",
    description: "List configured Jait workspaces. Use when the user asks about their projects or workspaces.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async (_args, deps) => {
    const workspaces = deps.workspaceService?.list?.() ?? [];
    if (!Array.isArray(workspaces) || workspaces.length === 0) return "No workspaces configured.";
    return workspaces.map((w: any) => `- ${w.title ?? w.rootPath ?? "Unknown"} (id: ${w.id})`).join("\n");
  },
};

const listThreads: VoiceTool = {
  schema: {
    type: "function",
    name: "list_threads",
    description: "List agent threads (Claude Code, Codex, Gemini CLI, etc.) with status. Use when the user asks about running agents or tasks.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async (_args, deps) => {
    const threads = deps.threadService?.list?.(undefined, 10) ?? [];
    if (!Array.isArray(threads) || threads.length === 0) return "No agent threads found.";
    return threads.map((t: any) =>
      `- [${t.status}] ${t.title ?? "Untitled"} (${t.providerId})`,
    ).join("\n");
  },
};

const searchMemory: VoiceTool = {
  schema: {
    type: "function",
    name: "search_memory",
    description: "Search Jait's memory for relevant context about a topic. Use when the user asks you to recall something or when you need context about past interactions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The topic or question to search for" },
      },
      required: ["query"],
    },
  },
  execute: async (args, deps) => {
    if (!deps.memoryService) return "Memory service not available.";
    const query = String(args["query"] ?? "");
    if (!query) return "No search query provided.";
    try {
      const results = await deps.memoryService.search(query, 5);
      if (!results.length) return `No memories found about: ${query}`;
      return results.map((r) => `- ${r.content.slice(0, 200)}`).join("\n");
    } catch {
      return "Memory search failed.";
    }
  },
};

const saveMemory: VoiceTool = {
  schema: {
    type: "function",
    name: "save_memory",
    description: "Save information to Jait's long-term memory. Use when the user tells you something to remember (preferences, names, facts).",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The information to remember" },
      },
      required: ["content"],
    },
  },
  execute: async (args, deps) => {
    if (!deps.memoryService) return "Memory service not available.";
    const content = String(args["content"] ?? "");
    if (!content) return "Nothing to save.";
    try {
      await deps.memoryService.save({
        scope: "workspace",
        content,
        source: { type: "voice-assistant", id: "voice", surface: "voice" },
      });
      return "Saved to memory.";
    } catch {
      return "Failed to save memory.";
    }
  },
};

const askAgentAboutRequest: VoiceTool = {
  schema: {
    type: "function",
    name: "ask_agent_about_request",
    description:
      "Ask a regular Jait agent for the answer. Default to this for most non-trivial user questions. " +
      "Use it whenever the user asks what something is, how it works, why it happened, what an error means, " +
      "what Jait/threads/tools/providers/workspaces are doing, or wants a deeper explanation than the voice assistant should invent.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The exact question the normal agent should answer." },
        provider: {
          type: "string",
          description: "Optional provider override for the temporary helper agent.",
          enum: PROVIDER_IDS,
        },
        workingDirectory: {
          type: "string",
          description: "Optional working directory if the answer should be grounded in a specific workspace.",
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds for waiting on the agent answer. Defaults to 45000.",
        },
      },
      required: ["question"],
    },
  },
  execute: async (args, deps) => {
    if (!deps.threadService || !deps.providerRegistry) return "Agent handoff is not available.";

    const question = String(args["question"] ?? "").trim();
    if (!question) return "No question provided.";

    const providerResolution = resolveVoiceAgentProvider(deps, args["provider"]);
    if (!providerResolution.providerId) {
      return providerResolution.error ?? "No regular agent provider is available.";
    }

    const provider = deps.providerRegistry.get(providerResolution.providerId);
    if (!provider) return `Provider '${providerResolution.providerId}' is not available.`;

    const available = await provider.checkAvailability();
    if (!available) {
      return `Provider '${providerResolution.providerId}' is not available: ${provider.info.unavailableReason ?? "unknown reason"}`;
    }

    const workingDirectory = typeof args["workingDirectory"] === "string" && args["workingDirectory"].trim()
      ? args["workingDirectory"].trim()
      : process.cwd();
    const timeoutMs = clampVoiceTimeout(args["timeoutMs"]);

    const thread = deps.threadService.create({
      userId: deps.userId,
      sessionId: "voice-assistant",
      title: `Voice helper: ${question.slice(0, 60)}`,
      providerId: providerResolution.providerId,
      model: providerResolution.model,
      runtimeMode: providerResolution.runtimeMode,
      kind: "delegation",
      workingDirectory,
    });

    let sessionId: string | null = null;
    try {
      const session = await provider.startSession({
        threadId: thread.id,
        workingDirectory,
        mode: providerResolution.runtimeMode,
        model: providerResolution.model,
        mcpServers: [
          deps.providerRegistry.buildJaitMcpServerRef(
            { host: deps.config.host, port: deps.config.port },
            undefined,
            { sessionId: thread.id, workspaceRoot: workingDirectory },
          ),
        ],
      });
      sessionId = session.id;
      deps.threadService.markRunning(thread.id, session.id);
      deps.threadService.addActivity(thread.id, "message", question.slice(0, 500), {
        role: "user",
        content: question,
      });

      const answerPromise = waitForDelegatedAgentAnswer(provider, session.id, timeoutMs);
      await provider.sendTurn(session.id, formatAgentQuestion(question));
      const answer = await answerPromise;

      deps.threadService.addActivity(thread.id, "message", answer.slice(0, 500), {
        role: "assistant",
        content: answer,
      });
      deps.threadService.markCompletedAndClearSession(thread.id);
      return answer.slice(0, 4000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.threadService.markError(thread.id, message);
      return `Agent handoff failed: ${message}`;
    } finally {
      if (sessionId) {
        try {
          await provider.stopSession(sessionId);
        } catch {
          // Best effort cleanup for a temporary helper session.
        }
      }
      deps.threadService.delete(thread.id);
    }
  },
};

const sendToThread: VoiceTool = {
  schema: {
    type: "function",
    name: "send_to_agent",
    description: "Send a task to a CLI coding agent (Claude Code, Codex, Gemini CLI, Copilot). Creates a new thread. Use when the user wants to delegate a coding or automation task.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "The task description" },
        provider: {
          type: "string",
          description: "Which agent to use",
          enum: ["claude-code", "codex", "gemini", "copilot"],
        },
      },
      required: ["message"],
    },
  },
  execute: async (args, deps) => {
    if (!deps.threadService) return "Thread service not available.";
    const message = String(args["message"] ?? "");
    const provider = String(args["provider"] ?? "claude-code");
    if (!message) return "No task provided.";
    try {
      const thread = deps.threadService.create({
        title: message.slice(0, 80),
        providerId: provider as any,
      });
      return `Thread created: ${thread.id} with ${provider}. Task: "${message.slice(0, 100)}"`;
    } catch (e) {
      return `Failed to create thread: ${e}`;
    }
  },
};

const searchWeb: VoiceTool = {
  schema: {
    type: "function",
    name: "search_web",
    description: "Search the web for current information, news, or facts. You MUST provide a non-empty 'query' string.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query — must be a descriptive, non-empty string" },
      },
      required: ["query"],
    },
  },
  execute: async (args, deps) => {
    const raw = args["query"] ?? args["q"] ?? args["search"] ?? "";
    const query = String(raw).trim();
    if (!query) {
      console.warn("[voice] search_web called with empty query, raw args:", JSON.stringify(args));
      return "Search failed: no query provided. Please specify what to search for.";
    }
    if (!deps.toolExecutor) return "Tool executor not available.";
    try {
      const mergedKeys: Record<string, string> = { ...deps.userApiKeys };
      if (deps.config.openaiApiKey && !mergedKeys.OPENAI_API_KEY) {
        mergedKeys.OPENAI_API_KEY = deps.config.openaiApiKey;
      }
      const result = await Promise.race([
        deps.toolExecutor("web.search", { query }, {
          sessionId: "voice-assistant",
          actionId: `va-${Date.now()}`,
          workspaceRoot: "",
          requestedBy: "voice-assistant",
          apiKeys: mergedKeys,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), 15_000),
        ),
      ]);
      return result.ok ? String(result.data ?? result.message).slice(0, 3000) : `Search failed: ${result.message}`;
    } catch (e) {
      if (String(e).includes("TIMEOUT")) return "Search timed out after 15 seconds. Try a simpler query.";
      return `Web search failed: ${e}`;
    }
  },
};

const stopVoice: VoiceTool = {
  schema: {
    type: "function",
    name: "stop_voice",
    description: "Stop/end the voice assistant session. Use when the user says goodbye, asks you to stop, or says they're done talking.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async () => {
    return "__STOP_VOICE__";
  },
};

const getLocation: VoiceTool = {
  schema: {
    type: "function",
    name: "get_location",
    description:
      "Get the user's approximate current location for local questions and weather. " +
      "Use when the user asks where they are, asks for local info, or asks weather without naming a city.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  execute: async (_args, deps) => {
    const location = await resolveLocation(deps);
    if (!location) {
      return "Location unavailable. Set JAIT_LOCATION in settings or environment, or provide a city.";
    }
    return JSON.stringify(location);
  },
};

const getWeather: VoiceTool = {
  schema: {
    type: "function",
    name: "get_weather",
    description:
      "Get current weather. If the user names a city, pass it. If not, call this with no city and it will use get_location-style lookup.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "Optional city name. Leave empty to use the user's approximate current location." },
      },
      required: [],
    },
  },
  execute: async (args, deps) => {
    let city = String(args["city"] ?? "").trim();
    if (!city) {
      const location = await resolveLocation(deps);
      city = location?.city || location?.label || "";
    }
    if (!city) return "Weather location unavailable. Provide a city or set JAIT_LOCATION.";
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
      if (!res.ok) return `Could not fetch weather for ${city}.`;
      return (await res.text()).trim();
    } catch {
      return `Failed to get weather for ${city}.`;
    }
  },
};

// ── Registry ────────────────────────────────────────────────────

const ALL_TOOLS: VoiceTool[] = [
  getTimeAndDate,
  getSystemInfo,
  systemStatus,
  listSessions,
  listWorkspaces,
  listThreads,
  searchMemory,
  saveMemory,
  askAgentAboutRequest,
  sendToThread,
  searchWeb,
  getLocation,
  getWeather,
  stopVoice,
];

const toolMap = new Map<string, VoiceTool>(ALL_TOOLS.map((t) => [t.schema.name, t]));

/** Get all tool schemas (for session.update → tools). */
export function getVoiceToolSchemas(): RealtimeToolDef[] {
  return ALL_TOOLS.map((t) => t.schema);
}

/** Execute a tool by name. Returns the string result for the function_call_output. */
export async function executeVoiceTool(
  name: string,
  args: Record<string, unknown>,
  deps: VoiceToolDeps,
): Promise<string> {
  const tool = toolMap.get(name);
  if (!tool) return `Unknown tool: ${name}`;
  try {
    return await tool.execute(args, deps);
  } catch (e) {
    return `Tool error: ${e}`;
  }
}
