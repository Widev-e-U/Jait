/**
 * Voice-assistant tool definitions for OpenAI Realtime API function calling.
 *
 * Each tool is defined as an OpenAI-compatible function schema plus a local
 * executor that runs inside the gateway with full access to Jait services.
 */

import type { SessionService } from "../services/sessions.js";
import type { ThreadService } from "../services/threads.js";
import type { WorkspaceService } from "../services/workspaces.js";
import type { MemoryService } from "../memory/contracts.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolResult } from "../tools/contracts.js";
import type { ProviderRegistry } from "../providers/registry.js";
import type { AppConfig } from "../config.js";
import { hostname, platform, cpus, totalmem, freemem } from "node:os";

export interface VoiceToolDeps {
  config: AppConfig;
  sessionService?: SessionService;
  threadService?: ThreadService;
  workspaceService?: WorkspaceService;
  memoryService?: MemoryService;
  toolRegistry?: ToolRegistry;
  providerRegistry?: ProviderRegistry;
  toolExecutor?: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult>;
  /** Per-connection user API keys (from user settings). */
  userApiKeys?: Record<string, string>;
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

const getWeather: VoiceTool = {
  schema: {
    type: "function",
    name: "get_weather",
    description: "Get current weather for a city. Use when the user asks about the weather.",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
  },
  execute: async (args) => {
    const city = String(args["city"] ?? "");
    if (!city) return "No city provided.";
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
  sendToThread,
  searchWeb,
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
