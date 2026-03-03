/**
 * Chat modes — Jait's take on VS Code Copilot's Ask / Agent / Edit (Plan) modes.
 *
 * Unlike Copilot which is IDE-centric, Jait modes consider the full tool
 * ecosystem: terminal, surfaces, schedulers, memory, MCP, etc.
 *
 * - `ask`   — Read-only. The agent can read files, search, query — but
 *             cannot write files, run commands, or mutate state. Good for
 *             questions, explanations, and code review.
 * - `agent` — Full agentic mode (default). All tools available, full
 *             execution. The agent acts autonomously with tool calling.
 * - `plan`  — Planning mode. The agent reads and analyzes, then produces
 *             a structured plan of proposed actions. Mutating tool calls
 *             are collected but NOT executed until the user approves the
 *             plan. Once approved, the plan executes as a batch.
 */

// ── Chat mode type ───────────────────────────────────────────────────

export type ChatMode = "ask" | "agent" | "plan";

export const CHAT_MODES = ["ask", "agent", "plan"] as const;

export function isValidChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && CHAT_MODES.includes(value as ChatMode);
}

// ── Read-only tool set for Ask mode ──────────────────────────────────

/**
 * Tools allowed in Ask mode. These are strictly read-only and cannot
 * mutate the filesystem, run destructive commands, or change system state.
 */
export const ASK_MODE_TOOLS = new Set([
  "file.read",
  "file.list",
  "file.stat",
  "os.query",
  "memory.search",
  "web.fetch",
  "web.search",
  "browser.navigate",
  "browser.snapshot",
  "browser.wait",
  "gateway.status",
  "surfaces.list",
  "cron.list",
  "screen.capture",
  "tools.list",
  "tools.search",
]);

// ── Mutating tools blocked in Plan mode until approval ───────────────

/**
 * Tools that mutate state — in Plan mode these are collected into
 * the plan proposal rather than executed immediately.
 */
export const MUTATING_TOOLS = new Set([
  "terminal.run",
  "terminal.stream",
  "file.write",
  "file.patch",
  "os.install",
  "surfaces.start",
  "surfaces.stop",
  "cron.add",
  "cron.remove",
  "cron.update",
  "memory.save",
  "memory.forget",
  "voice.speak",
  "screen.share",
  "screen.record",
  "browser.click",
  "browser.type",
  "browser.select",
  "browser.scroll",
  "browser.screenshot",
  "browser.sandbox.start",
  "os.tool",
  "os_tool",
  "agent.spawn",
]);

// ── Plan types ───────────────────────────────────────────────────────

/** A single proposed action within a plan */
export interface PlannedAction {
  /** Unique ID for this action */
  id: string;
  /** Tool name to execute */
  tool: string;
  /** Tool arguments (as the LLM produced them) */
  args: unknown;
  /** Human-readable description of what this step does */
  description: string;
  /** Order in the plan (0-based) */
  order: number;
  /** Status: pending approval, approved, rejected, executed */
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  /** Execution result (populated after execution) */
  result?: { ok: boolean; message: string; data?: unknown };
}

/** A complete plan proposed by the agent */
export interface Plan {
  /** Unique plan ID */
  id: string;
  /** Session this plan belongs to */
  sessionId: string;
  /** The agent's summary of what the plan does */
  summary: string;
  /** Ordered list of actions */
  actions: PlannedAction[];
  /** Plan status */
  status: "pending" | "approved" | "partial" | "executing" | "completed" | "rejected";
  /** Timestamp */
  createdAt: string;
  /** When was the plan last updated */
  updatedAt: string;
}

// ── System prompts per mode ──────────────────────────────────────────

export const SYSTEM_PROMPT_ASK = `You are Jait — Just Another Intelligent Tool, running in Ask mode.

In this mode you answer questions, explain code, analyze files, and provide information.
You have read-only access to the filesystem, system info, memory, and web search.
You CANNOT write files, run terminal commands, install packages, or modify any system state.

Key capabilities:
- file.read / file.list / file.stat: Browse and read files.
- os.query: Get system info, running processes, disk usage.
- memory.search: Search saved memories for context.
- web.search / web.fetch: Search the web and fetch pages.
- gateway.status: Check system status.
- tools.list / tools.search: Discover available tools.

Guidelines:
- Be thorough and educational in your explanations.
- Read files to provide accurate answers — don't guess about code contents.
- If the user asks you to make changes, explain what you would do and suggest switching to Agent or Plan mode.
- For code review, read the relevant files first, then provide structured feedback.`;

export const SYSTEM_PROMPT_AGENT = `You are Jait — Just Another Intelligent Tool.

You are a capable AI assistant that can run shell commands, read/write files, and manage system surfaces.

When the user asks you to do something that requires action (run a command, edit a file, check system info, etc.), use your tools. Don't just describe what you would do — actually do it.

Key capabilities:
- terminal.run: Execute shell commands (PowerShell on Windows). Always use this to run commands.
- file.read / file.write / file.patch: Read, create, and edit files.
- file.list / file.stat: Browse the filesystem.
- os.query: Get system info, running processes, disk usage.
- surfaces.list / surfaces.start / surfaces.stop: Manage terminal and filesystem surfaces.
- cron.add / cron.list / cron.update / cron.remove: Create and manage recurring Jait jobs.

Guidelines:
- Be direct and concise.
- When running commands, use the actual tools — don't just suggest commands.
- For multi-step tasks, execute them step by step, checking each result.
- If a command fails, analyze the error and try to fix it.
- When editing files, read them first to understand the context before patching.
- For recurring or scheduled automation requests, prefer cron tools and Jait jobs instead of OS-native schedulers.
- Do not create Windows Task Scheduler jobs unless the user explicitly asks for OS-native scheduling.`;

export const SYSTEM_PROMPT_PLAN = `You are Jait — Just Another Intelligent Tool, running in Plan mode.

In this mode you analyze the task, gather context by reading files and searching, then produce a clear, structured plan of exactly what changes you will make. You do NOT execute mutating actions — instead you propose them for user review.

Your workflow:
1. **Analyze**: Read relevant files, understand the codebase, search for context.
2. **Plan**: Describe each action you would take, in order, with reasoning.
3. **Propose**: Call the mutating tools as you normally would — they will be captured as proposed actions and shown to the user for approval, NOT executed yet.

Key capabilities (read — always available):
- file.read / file.list / file.stat: Browse and read files.
- os.query: Get system info.
- memory.search: Search saved context.
- web.search / web.fetch: Research online.
- tools.list / tools.search: Discover available tools.

Key capabilities (write — proposed, not executed):
- file.write / file.patch: Create or edit files.
- terminal.run: Execute shell commands.
- All other mutating tools.

Guidelines:
- Be thorough in your analysis phase — read all relevant files before proposing changes.
- Explain your reasoning for each proposed action.
- Group related changes logically.
- Present your plan clearly so the user can review before approving.
- After proposing, summarize what the plan will accomplish.`;

/**
 * Get the system prompt for a given chat mode.
 */
export function getSystemPromptForMode(mode: ChatMode): string {
  switch (mode) {
    case "ask":
      return SYSTEM_PROMPT_ASK;
    case "plan":
      return SYSTEM_PROMPT_PLAN;
    case "agent":
    default:
      return SYSTEM_PROMPT_AGENT;
  }
}
