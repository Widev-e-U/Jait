/**
 * Claude Code CLI Provider — wraps Anthropic's Claude Code CLI as a Jait provider.
 *
 * Spawns `claude --print --output-format stream-json --include-partial-messages --verbose`
 * and parses newline-delimited JSON events from stdout.
 *
 * Event types from Claude Code stream-json:
 *   { type: "system",       subtype: "init", model, tools, ... }
 *   { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } }
 *   { type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", ... } } }
 *   { type: "assistant",    message: { content: [...blocks...] } }   — partial/full message snapshots
 *   { type: "user",         message: { content: [{ type: "tool_result", ... }] } }
 *   { type: "result",       result: "...", usage: {...} }
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { uuidv7 } from "../db/uuidv7.js";
import type {
  CliProviderAdapter,
  ProviderInfo,
  ProviderAuthStatus,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";
import {
  DEVICE_PROVIDER_AUTH,
  killChildTree as killAuthChildTree,
  runAuthCommand,
  startDeviceLoginCommand,
} from "./provider-auth.js";

// ── Internal session state ───────────────────────────────────────────

interface ClaudeSessionState {
  session: ProviderSession;
  process: ChildProcess | null;
  buffer: string;
  workingDirectory: string;
  env: Record<string, string>;
  model?: string;
  mcpConfigPath?: string;
  exitMode: "normal" | "interrupt" | "stop";
  pendingToolCalls: ClaudePendingToolCall[];
  /** Whether any stream_event text_delta tokens were emitted this turn */
  hasStreamedTokens: boolean;
  /** Whether the first turn has been sent (determines --session-id vs --resume) */
  hasSentFirstTurn: boolean;
  /** Promise tracking in-flight drip-feed token emissions */
  pendingDrip: Promise<void> | null;
}

interface ClaudePendingToolCall {
  callId: string;
  rawTool: string;
  normalizedTool: string;
  args: Record<string, unknown>;
  providerCallId?: string;
}

// ── Provider implementation ──────────────────────────────────────────

export class ClaudeCodeProvider implements CliProviderAdapter {
  readonly id = "claude-code" as const;
  readonly info: ProviderInfo = {
    id: "claude-code",
    name: "Claude Code",
    description: "Anthropic Claude Code CLI agent with agentic coding and MCP support",
    available: false,
    modes: ["full-access", "supervised"],
    auth: DEVICE_PROVIDER_AUTH,
  };

  private sessions = new Map<string, ClaudeSessionState>();
  private emitter = new EventEmitter();
  private claudePath: string | null = null;
  private authLoginProcess: ChildProcess | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      const paths = ["claude"];
      for (const cmd of paths) {
        const available = await this.testCommand(cmd);
        if (available) {
          this.claudePath = cmd;
          this.info.available = true;
          return true;
        }
      }
      if (!this.claudePath) {
        this.info.available = false;
        this.info.unavailableReason = "Claude Code CLI not found. Install from https://docs.anthropic.com/en/docs/claude-code";
        return false;
      }

      const hasApiKey = !!process.env.ANTHROPIC_API_KEY?.trim();
      const hasClaudeConfig = this.hasClaudeConfig();
      if (!hasApiKey && !hasClaudeConfig) {
        this.info.available = false;
        this.info.unavailableReason = "Claude Code is not configured. Run `claude` once or set ANTHROPIC_API_KEY.";
        return false;
      }

      this.info.available = true;
      this.info.unavailableReason = undefined;
      return true;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check Claude Code CLI availability";
      return false;
    }
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    const status = await runAuthCommand(this.id, this.claudePath ?? "claude", ["auth", "status"], 10_000);
    const envConfigured = !!process.env.ANTHROPIC_API_KEY?.trim();
    const authenticated = envConfigured || status.ok;
    return {
      ...DEVICE_PROVIDER_AUTH,
      authenticated,
      detail: authenticated ? "Claude Code credentials are configured." : status.rawOutput ?? "Claude Code is not authenticated.",
    };
  }

  async startLogin(): Promise<ProviderLoginResult> {
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }
    const { result, child } = await startDeviceLoginCommand({
      providerId: this.id,
      label: "Claude Code",
      commandLine: this.claudePath ?? "claude",
      args: ["auth", "login", "--claudeai"],
      timeoutMs: 30_000,
    });
    if (child) {
      this.authLoginProcess = child;
      child.on("exit", () => {
        if (this.authLoginProcess === child) this.authLoginProcess = null;
        void this.checkAvailability();
      });
    }
    return result;
  }

  async logout(): Promise<ProviderLogoutResult> {
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }
    const result = await runAuthCommand(this.id, this.claudePath ?? "claude", ["auth", "logout"]);
    await this.checkAvailability().catch(() => false);
    return {
      ...result,
      message: result.ok ? "Claude Code logout completed." : result.message,
    };
  }

  /**
   * Dynamically discover available models by probing the Claude CLI.
   *
   * Spawns a short-lived `claude --print` for each candidate alias in parallel,
   * reads the `system` init event to get the resolved model name, and deduplicates
   * so that aliases pointing to the same underlying model only appear once.
   */
  async listModels(): Promise<ProviderModelInfo[]> {
    // Candidate aliases to probe — short aliases first (preferred for display)
    const candidates = ["sonnet", "opus", "haiku"];

    // Also parse --help for any additional aliases we might not know about
    try {
      const helpAliases = await this.parseAliasesFromHelp();
      for (const alias of helpAliases) {
        if (!candidates.includes(alias)) candidates.push(alias);
      }
    } catch { /* best effort */ }

    // Probe all candidates in parallel
    const results = await Promise.all(candidates.map(alias => this.probeModel(alias)));

    // Deduplicate by resolved model name: keep the first (shortest) alias
    const seen = new Map<string, { alias: string; resolvedModel: string }>();
    for (const r of results) {
      if (r && !seen.has(r.resolvedModel)) {
        seen.set(r.resolvedModel, r);
      }
    }

    const models: ProviderModelInfo[] = [];
    let isFirst = true;
    for (const { alias, resolvedModel } of seen.values()) {
      models.push({
        id: alias,
        name: alias.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        description: resolvedModel,
        ...(isFirst ? { isDefault: true } : {}),
      });
      isFirst = false;
    }

    // Fallback if probing failed entirely
    if (models.length === 0) {
      return [
        { id: "sonnet", name: "Sonnet", description: "Claude Sonnet", isDefault: true },
        { id: "opus", name: "Opus", description: "Claude Opus" },
        { id: "haiku", name: "Haiku", description: "Claude Haiku" },
      ];
    }

    return models;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const session: ProviderSession = {
      id: sessionId,
      providerId: "claude-code",
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
    };

    const state: ClaudeSessionState = {
      session,
      process: null,
      buffer: "",
      workingDirectory: options.workingDirectory,
      env,
      model: options.model,
      mcpConfigPath: this.buildClaudeMcpConfig(options.mcpServers, sessionId),
      exitMode: "normal",
      pendingToolCalls: [],
      hasStreamedTokens: false,
      hasSentFirstTurn: false,
      pendingDrip: null,
    };

    this.sessions.set(sessionId, state);
    state.session.status = "running";
    this.emit({ type: "session.started", sessionId });

    return session;
  }

  async sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void> {
    const state = this.getState(sessionId);
    if (state.process) {
      throw new Error("Claude Code turn already running");
    }

    const isFirstTurn = !state.hasSentFirstTurn;

    const args: string[] = [
      "--print",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
    ];

    // First turn: create a new session. Subsequent turns: resume it.
    if (isFirstTurn) {
      args.push("--session-id", state.session.id);
    } else {
      args.push("--resume", state.session.id);
    }

    if (state.session.runtimeMode === "full-access") {
      args.push("--dangerously-skip-permissions");
    } else {
      args.push("--permission-mode", "default");
    }

    if (state.model) {
      args.push("--model", state.model);
    }

    if (state.mcpConfigPath) {
      args.push("--mcp-config", state.mcpConfigPath);
    }

    // Use -- to separate options from the positional message argument.
    // Without this, variadic flags like --mcp-config consume the message.
    args.push("--", message);
    state.hasSentFirstTurn = true;

    const cmd = this.claudePath ?? "claude";
    const child = spawn(cmd, args, {
      cwd: state.workingDirectory,
      env: state.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    state.process = child;
    state.buffer = "";
    state.exitMode = "normal";
    state.hasStreamedTokens = false;
    state.session.status = "running";
    this.emit({ type: "turn.started", sessionId });

    // Suppress EPIPE errors when child exits before we finish writing
    child.stdin?.on("error", () => {/* ignore broken pipe */});

    // Close stdin — the prompt is passed as a CLI argument, not via stdin
    child.stdin?.end();

    child.stdout?.on("data", (data: Buffer) => {
      state.buffer += data.toString();
      this.processBuffer(sessionId, state);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[claude-code:${sessionId}] stderr: ${text}`);
      }
    });

    // Handle process lifecycle via events (non-blocking, like Codex provider).
    // The caller listens for turn.completed / session.error via onEvent().
    child.on("exit", (code, signal) => {
      state.process = null;
      const exitMode = state.exitMode;
      state.exitMode = "normal";

      if (exitMode === "stop") {
        state.session.status = "completed";
        state.session.completedAt = new Date().toISOString();
        this.emit({ type: "session.completed", sessionId });
        return;
      }

      if (exitMode === "interrupt") {
        state.session.status = "interrupted";
        this.emit({ type: "turn.completed", sessionId });
        return;
      }

      if (code === 0) {
        state.session.status = "idle";
        state.session.error = undefined;
        this.emit({ type: "turn.completed", sessionId });
        return;
      }

      const error = `Claude Code exited with code ${code}${signal ? ` (signal=${signal})` : ""}`;
      state.session.status = "error";
      state.session.error = error;
      this.emit({ type: "session.error", sessionId, error });
    });

    child.on("error", (err) => {
      state.process = null;
      state.exitMode = "normal";
      state.session.status = "error";
      state.session.error = err.message;
      this.emit({ type: "session.error", sessionId, error: err.message });
    });
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const state = this.getState(sessionId);
    if (state.process) {
      state.exitMode = "interrupt";
      killChildTree(state.process, "SIGINT");
    }
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    // Claude Code's --print mode doesn't support interactive approvals.
    // In supervised mode, the CLI would pause; we'd need to write to stdin.
    console.warn("Claude Code approval response not yet implemented for --print mode");
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    if (state.process) {
      state.exitMode = "stop";
      killChildTree(state.process, "SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (state.process) {
            killChildTree(state.process, "SIGKILL");
          }
          resolve();
        }, 3000);
        state.process?.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } else {
      state.session.status = "completed";
      state.session.completedAt = new Date().toISOString();
      this.emit({ type: "session.completed", sessionId });
    }

    // Clean up MCP config temp file
    if (state.mcpConfigPath) {
      try { rmSync(join(state.mcpConfigPath, ".."), { recursive: true, force: true }); } catch { /* best effort */ }
    }

    this.sessions.delete(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  // ── Private helpers ────────────────────────────────────────────────

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private getState(sessionId: string): ClaudeSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No Claude Code session found: ${sessionId}`);
    return state;
  }

  private processBuffer(_sessionId: string, state: ClaudeSessionState): void {
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        this.handleEvent(state, event);
      } catch {
        // Not JSON — could be status output
      }
    }
  }

  private handleEvent(state: ClaudeSessionState, event: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const type = event["type"] as string;

    switch (type) {
      // ── stream_event: wrapper around raw Anthropic API streaming events ──
      case "stream_event": {
        const inner = event["event"] as Record<string, unknown> | undefined;
        if (!inner) break;
        this.handleStreamEvent(state, inner);
        break;
      }

      // ── assistant: complete/partial message snapshot (emitted alongside stream_event) ──
      case "assistant": {
        // When streaming with --include-partial-messages, these are snapshots
        // of the full message so far. We only use them for tool_use blocks
        // (the text tokens are already streamed via stream_event deltas).
        const message = event["message"] as Record<string, unknown> | undefined;
        const content = message?.["content"];
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b["type"] === "tool_use" && b["name"]) {
              this.handleToolUseBlock(state, b);
            }
          }
        } else if (typeof content === "string" && content) {
          // Non-streaming fallback: if no stream_event deltas were seen, emit the full text
          if (!state.hasStreamedTokens) {
            this.emit({ type: "token", sessionId, content });
          }
        }
        break;
      }

      // ── user: tool result feedback from Claude's own tool execution ──
      case "user": {
        const message = event["message"] as Record<string, unknown> | undefined;
        const userContent = message?.["content"];
        if (Array.isArray(userContent)) {
          for (const block of userContent) {
            const b = block as Record<string, unknown>;
            if (b["type"] === "tool_result") {
              const toolUseId = String(b["tool_use_id"] ?? "");
              const isError = b["is_error"] === true;
              const resultText = extractResultText(event["tool_use_result"] ?? b["content"] ?? "");
              const match = toolUseId
                ? state.pendingToolCalls.find(p => p.providerCallId === toolUseId)
                : state.pendingToolCalls[0];
              if (match) {
                const idx = state.pendingToolCalls.indexOf(match);
                if (idx !== -1) state.pendingToolCalls.splice(idx, 1);
              }
              this.emit({
                type: "tool.result",
                sessionId,
                tool: match ? match.normalizedTool : "unknown",
                ok: !isError,
                message: resultText,
                ...(match ? { callId: match.callId, data: match.args } : {}),
              });
            }
          }
        }
        break;
      }

      // ── result: final summary when the CLI process finishes a turn ──
      case "result": {
        const resultContent = event["result"] as string | undefined;
        if (resultContent) {
          this.emit({ type: "message", sessionId, role: "assistant", content: resultContent });
        }
        // Extract usage info if available
        const usage = event["usage"] as Record<string, unknown> | undefined;
        if (usage) {
          this.emit({
            type: "activity",
            sessionId,
            kind: "usage",
            summary: `Cost: $${event["total_cost_usd"] ?? "?"}`,
            payload: { usage, cost: event["total_cost_usd"], duration: event["duration_ms"] },
          });
        }
        break;
      }

      // ── system: init event with model info, tools, etc. ──
      case "system":
        break;

      // ── rate_limit_event: informational, ignore ──
      case "rate_limit_event":
        break;

      default:
        this.emit({
          type: "activity",
          sessionId,
          kind: type ?? "unknown",
          summary: `Claude Code: ${type}`,
          payload: event,
        });
    }
  }

  /**
   * Handle unwrapped Anthropic API streaming events from inside stream_event wrappers.
   * These follow the Anthropic Messages API streaming format.
   */
  private handleStreamEvent(state: ClaudeSessionState, event: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const eventType = event["type"] as string;

    switch (eventType) {
      case "content_block_start":
        // tool_use blocks arrive here with input:{} (always empty in streaming).
        // We wait for the full `assistant` snapshot to emit tool.start with complete args.
        break;

      case "content_block_delta": {
        const delta = event["delta"] as Record<string, unknown> | undefined;
        if (!delta) break;
        const deltaType = delta["type"] as string;
        if (deltaType === "text_delta") {
          const text = String(delta["text"] ?? "");
          if (text) {
            state.hasStreamedTokens = true;
            this.emit({ type: "token", sessionId, content: text });
          }
        } else if (deltaType === "thinking_delta") {
          const thinking = String(delta["thinking"] ?? "");
          if (thinking) {
            this.emit({ type: "activity", sessionId, kind: "thinking", summary: thinking, payload: delta });
          }
        }
        // input_json_delta, signature_delta: ignored (tool input streamed incrementally, not needed)
        break;
      }

      case "content_block_stop":
      case "message_start":
      case "message_delta":
      case "message_stop":
        // Lifecycle markers — no action needed
        break;
    }
  }

  /**
   * Register a tool_use content block as a pending tool call and emit tool.start.
   * Only called from `assistant` message snapshots where input is complete.
   */
  private handleToolUseBlock(state: ClaudeSessionState, block: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const rawTool = String(block["name"] ?? "");
    const providerCallId = String(block["id"] ?? "");
    const input = (block["input"] as Record<string, unknown>) ?? {};
    const hasInput = Object.keys(input).length > 0;

    // If we already registered this tool call, update its args if the snapshot
    // now has complete input (the first snapshot often has input:{}).
    const existing = providerCallId
      ? state.pendingToolCalls.find(p => p.providerCallId === providerCallId)
      : undefined;
    if (existing) {
      if (hasInput && Object.keys(existing.args).length === 0) {
        existing.args = normalizeClaudeToolArgs(rawTool, input);
      }
      return;
    }

    const normalizedTool = normalizeClaudeToolName(rawTool);
    const args = normalizeClaudeToolArgs(rawTool, input);
    const callId = uuidv7();

    state.pendingToolCalls.push({
      callId,
      rawTool,
      normalizedTool,
      args,
      providerCallId: providerCallId || undefined,
    });

    this.emit({
      type: "tool.start",
      sessionId,
      tool: normalizedTool,
      args,
      callId,
    });
  }

  private buildClaudeMcpConfig(
    servers: StartSessionOptions["mcpServers"],
    sessionId: string,
  ): string | undefined {
    if (!servers || servers.length === 0) return undefined;

    const config: Record<string, unknown> = { mcpServers: {} };
    const mcpServers = config["mcpServers"] as Record<string, unknown>;

    for (const server of servers) {
      if (server.transport === "stdio" && server.command) {
        mcpServers[server.name] = {
          command: server.command,
          args: server.args ?? [],
          env: server.env ?? {},
        };
      } else if (server.transport === "sse" && server.url) {
        // Claude Code only supports stdio MCP servers.
        // Use npx mcp-remote to bridge HTTP/SSE endpoints.
        mcpServers[server.name] = {
          command: "npx",
          args: ["mcp-remote", server.url],
          env: server.env ?? {},
        };
      }
    }

    // Write to a temp file and return the path
    const configDir = join(tmpdir(), "jait-claude-code", sessionId);
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "mcp-config.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  private hasClaudeConfig(): boolean {
    const claudeDir = join(homedir(), ".claude");
    const claudeState = join(homedir(), ".claude.json");
    return existsSync(claudeDir) || existsSync(claudeState);
  }

  /**
   * Probe a single model alias by spawning `claude --print` with a trivial prompt
   * and reading the system init event. Returns the alias and resolved model name,
   * or null if the alias is invalid.
   */
  private probeModel(alias: string): Promise<{ alias: string; resolvedModel: string } | null> {
    return new Promise((resolve) => {
      const cmd = this.claudePath ?? "claude";
      const child = spawn(cmd, [
        "--print", "--output-format", "stream-json", "--verbose",
        "--no-session-persistence", "--dangerously-skip-permissions",
        "--max-budget-usd", "0.001",
        "--model", alias,
        ".",
      ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      child.stdin?.on("error", () => {/* ignore broken pipe */});
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) { resolved = true; child.kill(); resolve(null); }
      }, 8000);

      child.stdout?.on("data", (d: Buffer) => {
        if (resolved) return;
        try {
          const firstLine = d.toString().split("\n")[0];
          const init = JSON.parse(firstLine ?? "") as Record<string, unknown>;
          if (init["type"] === "system" && typeof init["model"] === "string") {
            resolved = true;
            clearTimeout(timer);
            child.kill();
            resolve({ alias, resolvedModel: init["model"] as string });
          }
        } catch { /* not valid JSON yet */ }
      });

      child.on("exit", (code) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(code === 0 ? { alias, resolvedModel: alias } : null);
        }
      });

      child.on("error", () => {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
      });
    });
  }

  /**
   * Parse `claude --help` to discover model alias names mentioned in the --model description.
   */
  private parseAliasesFromHelp(): Promise<string[]> {
    return new Promise((resolve) => {
      const cmd = this.claudePath ?? "claude";
      const child = spawn(cmd, ["--help"], { stdio: "pipe", windowsHide: true });
      let output = "";
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 5000);

      child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });
      child.on("exit", () => {
        clearTimeout(timer);
        const aliases: string[] = [];
        const modelSection = output.match(/--model\s+<model>\s+(.*?)(?:\n\s*-|\n\n)/s);
        if (modelSection?.[1]) {
          const matches = [...modelSection[1].matchAll(/'([a-z][a-z0-9-]*)'/g)];
          for (const m of matches) {
            if (m[1] && !aliases.includes(m[1])) aliases.push(m[1]);
          }
        }
        resolve(aliases);
      });
      child.on("error", () => { clearTimeout(timer); resolve([]); });
    });
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], {
        stdio: "pipe",
        windowsHide: true,
      });
      const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
      child.on("exit", (code: number | null) => { clearTimeout(timer); resolve(code === 0); });
      child.on("error", () => { clearTimeout(timer); resolve(false); });
    });
  }
}

function normalizeClaudeToolName(tool: string): string {
  // MCP tools arrive as mcp__servername__toolname
  if (tool.startsWith("mcp__")) return "mcp-tool";
  const normalized = tool.trim().toLowerCase();
  if (normalized === "edit") return "edit";
  if (normalized === "multiedit") return "edit";
  if (normalized === "write") return "file.write";
  if (normalized === "read") return "read";
  if (normalized === "notebookedit" || normalized === "notebookread") return "edit";
  if (normalized === "websearch") return "web";
  if (normalized === "webfetch") return "web";
  if (normalized === "bash") return "execute";
  if (normalized === "glob") return "search";
  if (normalized === "grep") return "search";
  if (normalized === "lsp" || normalized === "toolsearch") return "search";
  if (normalized === "todowrite") return "todo";
  if (normalized === "agent") return "agent";
  if (normalized === "task" || normalized === "taskcreate" || normalized === "taskget"
    || normalized === "tasklist" || normalized === "taskoutput" || normalized === "taskstop"
    || normalized === "taskupdate") return "agent";
  return tool;
}

/** Extract plain text from a Claude Code tool result content value (string or content-block array). */
function extractResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === "object"))
      .map((b) => (typeof b["text"] === "string" ? b["text"] : ""))
      .join("");
  }
  return "";
}

function normalizeClaudeToolArgs(
  tool: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = normalizeClaudeToolName(tool);
  if (normalized === "edit" || normalized === "file.write" || normalized === "read") {
    return {
      path: String(input["path"] ?? input["file_path"] ?? input["filePath"] ?? input["file"] ?? ""),
      ...(input["old_string"] != null ? { search: input["old_string"] } : {}),
      ...(input["new_string"] != null ? { replace: input["new_string"] } : {}),
      ...(input["content"] != null ? { content: input["content"] } : {}),
      ...(input["new_file_contents"] != null ? { content: input["new_file_contents"] } : {}),
      ...input,
    };
  }

  if (normalized === "web") {
    return {
      query: String(input["query"] ?? input["search_query"] ?? input["q"] ?? ""),
      ...(input["url"] != null ? { url: input["url"] } : {}),
      ...input,
    };
  }

  if (normalized === "execute") {
    return {
      command: String(input["command"] ?? ""),
      ...input,
    };
  }

  if (normalized === "search") {
    return {
      pattern: String(input["pattern"] ?? input["query"] ?? input["command"] ?? ""),
      ...input,
    };
  }

  if (normalized === "mcp-tool") {
    // Preserve the original mcp__server__tool name for the frontend to parse
    const parts = tool.split("__");
    return {
      recipient_name: tool,
      ...(parts.length >= 3 ? { server: parts[1], tool: parts.slice(2).join("__") } : {}),
      ...input,
    };
  }

  if (normalized === "todo") {
    // Claude Code TodoWrite uses {todos: [{id, content, status, priority}]}
    // Jait's todo tool uses {todoList: [{id, title, status}]}
    const claudeTodos = Array.isArray(input["todos"]) ? input["todos"] : [];
    const todoList = claudeTodos.map((item: unknown) => {
      const t = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const rawStatus = String(t["status"] ?? "pending");
      const status: "not-started" | "in-progress" | "completed" =
        rawStatus === "completed" ? "completed"
        : rawStatus === "in_progress" || rawStatus === "in-progress" ? "in-progress"
        : "not-started";
      return { id: Number(t["id"]) || 0, title: String(t["content"] ?? t["title"] ?? ""), status };
    });
    return { todoList, ...input };
  }

  return input;
}


function killChildTree(child: ChildProcess, signal: "SIGINT" | "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      const taskkillArgs = signal === "SIGINT"
        ? ["/pid", String(child.pid), "/T", "/F"]
        : ["/pid", String(child.pid), "/T", "/F"];
      spawnSync("taskkill", taskkillArgs, { stdio: "ignore" });
      return;
    } catch {
      // Fall through to the default kill path.
    }
  }
  child.kill(signal);
}
