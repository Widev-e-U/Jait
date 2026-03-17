/**
 * Claude Code CLI Provider — wraps Anthropic's Claude Code CLI as a Jait provider.
 *
 * Spawns `claude` CLI with `--output-format stream-json` for structured output.
 * Claude Code supports MCP natively via its config, so Jait tools can be exposed.
 *
 * Claude Code outputs newline-delimited JSON events to stdout:
 *   { type: "assistant", message: { ... } }
 *   { type: "tool_use", tool: "...", input: {...} }
 *   { type: "tool_result", ... }
 *   { type: "result", ... }
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
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
   * Dynamically discover model aliases from the Claude CLI --help output.
   * Falls back to well-known aliases if parsing fails.
   */
  async listModels(): Promise<ProviderModelInfo[]> {
    try {
      const models = await this.parseModelsFromHelp();
      if (models.length > 0) return models;
    } catch { /* fall through */ }

    // Fallback: stable aliases that Claude Code accepts
    return [
      { id: "default", name: "Default", description: "Claude Code default model selection", isDefault: true },
      { id: "sonnet", name: "Sonnet", description: "Claude Sonnet — fast, capable coding model" },
      { id: "opus", name: "Opus", description: "Claude Opus — most capable model" },
      { id: "haiku", name: "Haiku", description: "Claude Haiku — fast lightweight model" },
    ];
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

    const args: string[] = [
      "--print",
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--session-id", state.session.id,
    ];

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

    const cmd = this.claudePath ?? "claude";
    const child = spawn(cmd, args, {
      cwd: state.workingDirectory,
      env: state.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    state.process = child;
    state.buffer = "";
    state.exitMode = "normal";
    state.session.status = "running";
    this.emit({ type: "turn.started", sessionId });

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
      case "assistant": {
        const message = event["message"] as Record<string, unknown> | undefined;
        const content = message?.["content"];
        if (typeof content === "string") {
          this.emit({ type: "token", sessionId, content });
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if ((block as Record<string, unknown>)?.["type"] === "text") {
              this.emit({ type: "token", sessionId, content: String((block as Record<string, unknown>)["text"] ?? "") });
            }
          }
        }
        break;
      }

      case "content_block_delta": {
        const delta = event["delta"] as Record<string, unknown> | undefined;
        if (delta?.["type"] === "text_delta") {
          this.emit({ type: "token", sessionId, content: String(delta["text"] ?? "") });
        }
        break;
      }

      case "tool_use": {
        const rawTool = String(event["name"] ?? event["tool"] ?? "")
        const normalizedTool = normalizeClaudeToolName(rawTool)
        const args = normalizeClaudeToolArgs(rawTool, (event["input"] as Record<string, unknown> | undefined) ?? {})
        const callId = extractClaudeToolCallId(event) ?? uuidv7()
        state.pendingToolCalls.push({
          callId,
          rawTool,
          normalizedTool,
          args,
          ...(extractClaudeProviderToolId(event) ? { providerCallId: extractClaudeProviderToolId(event) } : {}),
        })
        this.emit({
          type: "tool.start",
          sessionId,
          tool: normalizedTool,
          args,
          callId,
        });
        break;
      }

      case "tool_result": {
        const match = resolveClaudePendingToolCall(state.pendingToolCalls, event)
        const rawTool = String(event["tool"] ?? match?.rawTool ?? "")
        this.emit({
          type: "tool.result",
          sessionId,
          tool: normalizeClaudeToolName(rawTool),
          ok: event["is_error"] !== true,
          message: String(event["content"] ?? event["output"] ?? ""),
          ...(match ? { callId: match.callId, data: match.args } : {}),
        });
        break;
      }

      case "result": {
        const resultContent = event["result"] as string | undefined;
        if (resultContent) {
          this.emit({ type: "message", sessionId, role: "assistant", content: resultContent });
        }
        break;
      }

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
      const child = spawn(cmd, ["--help"], { stdio: "pipe", shell: true });
      let output = "";
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 5000);

      child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });
      child.on("exit", () => {
        clearTimeout(timer);
        const models: ProviderModelInfo[] = [];
        // Always include "default" first
        models.push({ id: "default", name: "Default", description: "Claude Code default model selection", isDefault: true });

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

        resolve(models.length > 1 ? models : []);
      });
      child.on("error", () => { clearTimeout(timer); resolve([]); });
    });
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], {
        stdio: "pipe",
        shell: true,
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

function extractClaudeToolCallId(event: Record<string, unknown>): string | undefined {
  const direct =
    asNonEmptyString(event["callId"]) ??
    asNonEmptyString(event["call_id"]) ??
    asNonEmptyString(event["toolCallId"]) ??
    asNonEmptyString(event["tool_call_id"]);
  if (direct) return direct;
  return extractClaudeProviderToolId(event);
}

function extractClaudeProviderToolId(event: Record<string, unknown>): string | undefined {
  return (
    asNonEmptyString(event["id"]) ??
    asNonEmptyString(event["toolUseId"]) ??
    asNonEmptyString(event["tool_use_id"]) ??
    asNonEmptyString(event["toolId"]) ??
    asNonEmptyString(event["tool_id"])
  );
}

function resolveClaudePendingToolCall(
  pending: ClaudePendingToolCall[],
  event: Record<string, unknown>,
): ClaudePendingToolCall | undefined {
  if (pending.length === 0) return undefined;

  const directId = extractClaudeToolCallId(event);
  if (directId) {
    const directIdx = pending.findIndex((entry) => entry.callId === directId || entry.providerCallId === directId);
    if (directIdx !== -1) return pending.splice(directIdx, 1)[0];
  }

  const rawTool = asNonEmptyString(event["tool"]);
  if (rawTool) {
    const normalizedTool = normalizeClaudeToolName(rawTool);
    const toolIdx = pending.findIndex((entry) => entry.rawTool === rawTool || entry.normalizedTool === normalizedTool);
    if (toolIdx !== -1) return pending.splice(toolIdx, 1)[0];
  }

  return pending.shift();
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
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
