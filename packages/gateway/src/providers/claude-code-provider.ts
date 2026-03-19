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
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";

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
  };

  private sessions = new Map<string, ClaudeSessionState>();
  private emitter = new EventEmitter();
  private claudePath: string | null = null;

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

  /**
   * List available models. Uses well-known aliases that Claude Code accepts,
   * supplemented by any additional aliases discovered from `claude --help`.
   */
  async listModels(): Promise<ProviderModelInfo[]> {
    const models: ProviderModelInfo[] = [
      { id: "sonnet", name: "Sonnet", description: "Claude Sonnet — fast, capable coding model", isDefault: true },
      { id: "opus", name: "Opus", description: "Claude Opus — most capable model" },
      { id: "haiku", name: "Haiku", description: "Claude Haiku — fast lightweight model" },
    ];

    // Try to discover additional aliases from --help (e.g. full model names)
    try {
      const discovered = await this.parseModelsFromHelp();
      for (const m of discovered) {
        if (!models.some(w => w.id === m.id)) {
          models.push(m);
        }
      }
    } catch { /* best effort */ }

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

    args.push(message);
    state.hasSentFirstTurn = true;

    const cmd = this.claudePath ?? "claude";
    const child = spawn(cmd, args, {
      cwd: state.workingDirectory,
      env: state.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    state.process = child;
    state.buffer = "";
    state.exitMode = "normal";
    state.hasStreamedTokens = false;
    state.session.status = "running";
    this.emit({ type: "turn.started", sessionId });

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

    return new Promise<void>((resolve, reject) => {
      child.on("exit", (code, signal) => {
        state.process = null;
        const exitMode = state.exitMode;
        state.exitMode = "normal";

        if (exitMode === "stop") {
          state.session.status = "completed";
          state.session.completedAt = new Date().toISOString();
          this.emit({ type: "session.completed", sessionId });
          resolve();
          return;
        }

        if (exitMode === "interrupt") {
          state.session.status = "interrupted";
          this.emit({ type: "turn.completed", sessionId });
          resolve();
          return;
        }

        if (code === 0) {
          state.session.status = "idle";
          state.session.error = undefined;
          this.emit({ type: "turn.completed", sessionId });
          resolve();
          return;
        }

        const error = `Claude Code exited with code ${code}${signal ? ` (signal=${signal})` : ""}`;
        state.session.status = "error";
        state.session.error = error;
        this.emit({ type: "session.error", sessionId, error });
        reject(new Error(error));
      });

      child.on("error", (err) => {
        state.process = null;
        state.exitMode = "normal";
        state.session.status = "error";
        state.session.error = err.message;
        this.emit({ type: "session.error", sessionId, error: err.message });
        reject(err);
      });
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
              const resultText = String(event["tool_use_result"] ?? b["content"] ?? "");
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
        mcpServers[server.name] = {
          url: server.url,
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
   * Parse the `claude --help` output to discover available model names/aliases.
   * The --model description typically mentions aliases like 'sonnet', 'opus',
   * and full model names like 'claude-sonnet-4-6'.
   */
  private parseModelsFromHelp(): Promise<ProviderModelInfo[]> {
    return new Promise((resolve) => {
      const cmd = this.claudePath ?? "claude";
      const child = spawn(cmd, ["--help"], { stdio: "pipe" });
      let output = "";
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 5000);

      child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });
      child.on("exit", () => {
        clearTimeout(timer);
        const models: ProviderModelInfo[] = [];

        // Extract alias examples from --model help text
        // Pattern: e.g. 'sonnet' or 'opus' or full name like 'claude-sonnet-4-6'
        const modelSection = output.match(/--model\s+<model>\s+(.*?)(?:\n\s*-|\n\n)/s);
        if (modelSection?.[1]) {
          const text = modelSection[1];
          // Find quoted aliases: 'sonnet', 'opus', 'claude-sonnet-4-6', etc.
          const aliases = [...text.matchAll(/'([a-z][a-z0-9-]*)'/g)].map(m => m[1]).filter((a): a is string => !!a);
          for (const alias of aliases) {
            if (!models.some(m => m.id === alias)) {
              models.push({
                id: alias,
                name: alias.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
              });
            }
          }
        }

        resolve(models);
      });
      child.on("error", () => { clearTimeout(timer); resolve([]); });
    });
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], {
        stdio: "pipe",
      });
      const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
      child.on("exit", (code: number | null) => { clearTimeout(timer); resolve(code === 0); });
      child.on("error", () => { clearTimeout(timer); resolve(false); });
    });
  }
}

function normalizeClaudeToolName(tool: string): string {
  const normalized = tool.trim().toLowerCase();
  if (normalized === "edit") return "edit";
  if (normalized === "multiedit") return "edit";
  if (normalized === "write") return "file.write";
  if (normalized === "read") return "read";
  if (normalized === "websearch") return "web";
  return tool;
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
