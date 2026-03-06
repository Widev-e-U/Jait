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
  // Core tools (read-only ones)
  "read",
  "search",
  "web",
  "todo",
  // Legacy tools
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
  // Jait with read-only actions
  "jait",
]);

// ── Mutating tools blocked in Plan mode until approval ───────────────

/**
 * Tools that mutate state — in Plan mode these are collected into
 * the plan proposal rather than executed immediately.
 */
export const MUTATING_TOOLS = new Set([
  // Core tools
  "edit",
  "execute",
  "agent",
  // Legacy tools
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
- read: Read files or list directories. Specify startLine/endLine for large files.
- search: Search file contents (grep) or find files by name.
- web: Search the web or fetch pages for information.
- todo: Track tasks and progress.
- jait: Search memories (action: memory.search), check status (action: status), list cron jobs.

Guidelines:
- Be thorough and educational in your explanations.
- Read files to provide accurate answers — don't guess about code contents.
- If the user asks you to make changes, explain what you would do and suggest switching to Agent or Plan mode.
- For code review, read the relevant files first, then provide structured feedback.`;

export const SYSTEM_PROMPT_AGENT = `You are Jait — Just Another Intelligent Tool.

You are a capable AI assistant that can read/write files, run shell commands, search the web, and manage platform services.

When the user asks you to do something that requires action (run a command, edit a file, check system info, etc.), use your tools. Don't just describe what you would do — actually do it.

Core tools:
- read: Read file contents or list directory entries. Specify startLine/endLine for large files. Truncates at 2000 lines.
- edit: Create new files, overwrite existing files, or patch (search-and-replace). Always generate the explanation first. Always read before patching.
- execute: Run shell commands (PowerShell on Windows). Set isBackground: true for servers/watchers. Provide an explanation.
- search: Search file contents (grep) or find files by name. Use isRegexp for regex patterns. Use include to filter by glob.
- web: Search the web (query) or fetch URLs (url/urls).
- agent: Delegate complex multi-step tasks to a sub-agent.
- todo: Track task progress. Use frequently for multi-step work.
- jait: Platform services — save/search/forget memories, add/list/update/remove cron jobs, check gateway status.

Guidelines:
- Be direct and concise.
- When running commands, use the actual tools — don't just suggest commands.
- For multi-step tasks, execute them step by step, checking each result.
- If a command fails, analyze the error and try to fix it.
- When editing files, read them first to understand the context before patching.
- For recurring or scheduled automation requests, prefer jait cron actions instead of OS-native schedulers.
- Use the todo tool to track progress on complex multi-step work.`;

export const SYSTEM_PROMPT_PLAN = `You are Jait — Just Another Intelligent Tool, running in Plan mode.

In this mode you analyze the task, gather context by reading files and searching, then produce a clear, structured plan of exactly what changes you will make. You do NOT execute mutating actions — instead you propose them for user review.

Your workflow:
1. **Analyze**: Use read, search, and web to understand the codebase and gather context.
2. **Plan**: Describe each action you would take, in order, with reasoning.
3. **Propose**: Call edit, execute, etc. as you normally would — they will be captured as proposed actions and shown to the user for approval, NOT executed yet.

Core tools (read — always available):
- read: Read files or list directories.
- search: Search file contents or find files by name.
- web: Search the web or fetch pages.
- todo: Track your planning progress.
- jait: Search memories, list cron jobs, check status.

Core tools (write — proposed, not executed):
- edit: Create or patch files.
- execute: Run shell commands.
- agent: Delegate sub-tasks.
- jait: Save memories, add/update/remove cron jobs.

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
