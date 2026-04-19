/**
 * Copilot CLI Provider — wraps GitHub Copilot CLI as a Jait provider.
 *
 * Spawns `copilot -p <message> --stream on -s` for streaming NDJSON output.
 *
 * Copilot CLI session events:
 *   { type: "assistant.turn_start", ... }
 *   { type: "assistant.message_delta", data: { deltaContent } }
 *   { type: "assistant.message", data: { content } }
 *   { type: "tool.execution_start", data: { toolCallId, toolName, arguments } }
 *   { type: "tool.execution_complete", data: { toolCallId, success, result?, error? } }
 *   { type: "assistant.turn_end", ... }
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

interface CopilotSessionState {
  session: ProviderSession;
  process: ChildProcess | null;
  buffer: string;
  stderr: string;
  workingDirectory: string;
  env: Record<string, string>;
  model?: string;
  mcpConfigPath?: string;
  exitMode: "normal" | "interrupt" | "stop";
  /** Copilot session ID from the result event — used for --resume */
  copilotSessionId?: string;
  /** Number of turns sent in this session (first turn starts fresh, subsequent resume) */
  turnCount: number;
}

// ── Provider implementation ──────────────────────────────────────────

export class CopilotProvider implements CliProviderAdapter {
  readonly id = "copilot" as const;
  readonly info: ProviderInfo = {
    id: "copilot",
    name: "Copilot CLI",
    description: "GitHub Copilot CLI agent with multi-model and MCP support",
    available: false,
    modes: ["full-access", "supervised"],
  };

  private sessions = new Map<string, CopilotSessionState>();
  private emitter = new EventEmitter();
  private copilotPath: string | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      const available = await this.testCommand("copilot");
      if (!available) {
        this.info.available = false;
        this.info.unavailableReason = "Copilot CLI not found. Install from: https://docs.github.com/en/copilot/github-copilot-in-the-cli";
        return false;
      }
      this.copilotPath = "copilot";

      // Copilot authenticates via GitHub — check if logged in
      const authed = await this.checkAuth();
      if (!authed) {
        this.info.available = false;
        this.info.unavailableReason = "Copilot CLI not authenticated. Run `copilot` or `gh auth login` first.";
        return false;
      }

      this.info.available = true;
      this.info.unavailableReason = undefined;
      return true;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check Copilot CLI availability";
      return false;
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    // Copilot CLI models are discovered dynamically from --help output
    try {
      const models = await this.parseModelsFromHelp();
      if (models.length > 0) return models;
    } catch { /* fall through */ }

    // Fallback to a small set of known models
    return [
      { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", isDefault: true },
      { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
      { id: "gpt-4.1", name: "GPT-4.1" },
    ];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const session: ProviderSession = {
      id: sessionId,
      providerId: "copilot",
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
    };

    const state: CopilotSessionState = {
      session,
      process: null,
      buffer: "",
      stderr: "",
      workingDirectory: options.workingDirectory,
      env,
      model: options.model,
      mcpConfigPath: this.buildMcpConfig(options.mcpServers, sessionId),
      exitMode: "normal",
      turnCount: 0,
    };

    this.sessions.set(sessionId, state);
    state.session.status = "running";
    this.emit({ type: "session.started", sessionId });

    return session;
  }

  async sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void> {
    const state = this.getState(sessionId);
    if (state.process) {
      throw new Error("Copilot CLI turn already running");
    }

    const args: string[] = [
      "-p", message,
      "--stream", "on",
      "--output-format", "json",
      "-s", // silent — clean output
    ];

    if (state.session.runtimeMode === "full-access") {
      args.push("--allow-all-tools");
    }

    if (state.model) {
      args.push("--model", state.model);
    }

    if (state.mcpConfigPath) {
      args.push("--additional-mcp-config", `@${state.mcpConfigPath}`);
    }

    // Resume previous session for multi-turn conversation
    if (state.turnCount > 0 && state.copilotSessionId) {
      args.push("--resume", state.copilotSessionId);
    }
    state.turnCount++;

    const cmd = this.copilotPath ?? "copilot";
    const child = spawn(cmd, args, {
      cwd: state.workingDirectory,
      env: state.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      windowsHide: true,
    });

    state.process = child;
    state.buffer = "";
    state.stderr = "";
    state.exitMode = "normal";
    state.session.status = "running";
    this.emit({ type: "turn.started", sessionId });

    // Suppress EPIPE errors when child exits before we finish writing
    child.stdin?.on("error", () => {/* ignore broken pipe */});

    child.stdout?.on("data", (data: Buffer) => {
      state.buffer += data.toString();
      this.processBuffer(sessionId, state);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        state.stderr = appendStderr(state.stderr, text);
        console.error(`[copilot:${sessionId}] stderr: ${text}`);
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

        const error = buildCopilotExitError(code, signal, state.stderr);
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
    console.warn("Copilot CLI approval response not implemented for non-interactive mode");
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    if (state.process) {
      state.exitMode = "stop";
      killChildTree(state.process, "SIGTERM");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (state.process) killChildTree(state.process, "SIGKILL");
          resolve();
        }, 3000);
        state.process?.on("exit", () => { clearTimeout(timeout); resolve(); });
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

  private getState(sessionId: string): CopilotSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No Copilot session found: ${sessionId}`);
    return state;
  }

  private processBuffer(_sessionId: string, state: CopilotSessionState): void {
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        this.handleEvent(state, event);
      } catch {
        // Not JSON — might be plain text output
        if (trimmed.length > 0) {
          this.emit({ type: "token", sessionId: state.session.id, content: trimmed });
        }
      }
    }
  }

  private handleEvent(state: CopilotSessionState, event: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const type = event["type"] as string;
    const data = event["data"] as Record<string, unknown> | undefined;

    switch (type) {
      case "assistant.message_delta": {
        const content = String(data?.["deltaContent"] ?? "");
        if (content) {
          this.emit({ type: "token", sessionId, content });
        }
        break;
      }

      case "assistant.reasoning_delta": {
        const content = String(data?.["deltaContent"] ?? "");
        if (content) {
          this.emit({
            type: "activity",
            sessionId,
            kind: "reasoning",
            summary: content,
          });
        }
        break;
      }

      case "assistant.message": {
        const content = String(data?.["content"] ?? "");
        if (content) {
          this.emit({ type: "message", sessionId, role: "assistant", content });
        }
        break;
      }

      case "assistant.turn_start": {
        this.emit({
          type: "activity",
          sessionId,
          kind: "turn_start",
          summary: "Copilot turn started",
          payload: event,
        });
        break;
      }

      case "assistant.turn_end": {
        this.emit({
          type: "activity",
          sessionId,
          kind: "turn_end",
          summary: "Copilot turn ended",
          payload: event,
        });
        break;
      }

      case "tool.execution_start": {
        const toolName = String(data?.["toolName"] ?? "");
        const callId = String(data?.["toolCallId"] ?? uuidv7());
        const args = (data?.["arguments"] ?? {}) as Record<string, unknown>;
        this.emit({
          type: "tool.start",
          sessionId,
          tool: toolName,
          args,
          callId,
        });
        break;
      }

      case "tool.execution_complete": {
        const callId = String(data?.["toolCallId"] ?? "");
        const success = data?.["success"] === true;
        const result = data?.["result"] as Record<string, unknown> | undefined;
        const error = data?.["error"] as Record<string, unknown> | undefined;
        const content = String(result?.["content"] ?? error?.["message"] ?? "");
        this.emit({
          type: "tool.result",
          sessionId,
          tool: callId,
          ok: success,
          message: content,
          callId,
        });
        break;
      }

      case "tool.execution_partial_result": {
        const callId = String(data?.["toolCallId"] ?? "");
        const output = String(data?.["partialOutput"] ?? "");
        if (output) {
          this.emit({
            type: "tool.output",
            sessionId,
            callId,
            content: output,
          });
        }
        break;
      }

      case "tool.execution_progress": {
        const callId = String(data?.["toolCallId"] ?? "");
        const message = String(data?.["progressMessage"] ?? "");
        if (message) {
          this.emit({
            type: "activity",
            sessionId,
            kind: "tool_progress",
            summary: message,
            payload: { callId },
          });
        }
        break;
      }

      case "assistant.usage": {
        this.emit({
          type: "activity",
          sessionId,
          kind: "usage",
          summary: "Copilot usage stats",
          payload: data,
        });
        break;
      }

      case "session.error": {
        const message = String(data?.["message"] ?? event["message"] ?? "Unknown error");
        this.emit({ type: "session.error", sessionId, error: message });
        break;
      }

      case "result": {
        // Capture sessionId from the result event for --resume
        const resultSessionId = String(event["sessionId"] ?? "");
        if (resultSessionId) {
          state.copilotSessionId = resultSessionId;
        }
        break;
      }

      default:
        this.emit({
          type: "activity",
          sessionId,
          kind: type ?? "unknown",
          summary: `Copilot: ${type}`,
          payload: event,
        });
    }
  }

  private buildMcpConfig(
    servers: StartSessionOptions["mcpServers"],
    sessionId: string,
  ): string | undefined {
    if (!servers || servers.length === 0) return undefined;

    // Copilot uses --additional-mcp-config @filepath with a JSON config
    const config: Record<string, unknown> = {};

    for (const server of servers) {
      if (server.transport === "stdio" && server.command) {
        config[server.name] = {
          type: "stdio",
          command: server.command,
          args: server.args ?? [],
          env: server.env ?? {},
        };
      } else if (server.transport === "sse" && server.url) {
        config[server.name] = {
          type: "sse",
          url: server.url,
        };
      }
    }

    const configDir = join(tmpdir(), "jait-copilot", sessionId);
    mkdirSync(configDir, { recursive: true });
    const configPath = join(configDir, "mcp-config.json");
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  private checkAuth(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn("gh", ["auth", "status"], { stdio: "pipe", shell: true, windowsHide: true });
      let stdout = "";
      child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { stdout += d.toString(); });
      const timer = setTimeout(() => { child.kill(); resolve(true); }, 5000);
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(true);
        } else {
          this.info.unavailableReason = `GitHub auth check failed. Run \`gh auth login\` first. Output: ${stdout.slice(0, 200)}`;
          resolve(false);
        }
      });
      child.on("error", () => {
        clearTimeout(timer);
        // gh not installed — fall back to assuming copilot binary itself will auth
        resolve(true);
      });
    });
  }

  /** Parse model choices from `copilot --help` output */
  private parseModelsFromHelp(): Promise<ProviderModelInfo[]> {
    return new Promise((resolve) => {
      const child = spawn("copilot", ["--help"], { stdio: "pipe", shell: true, windowsHide: true });
      let output = "";
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 5000);

      child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
      child.stderr?.on("data", (d: Buffer) => { output += d.toString(); });
      child.on("exit", () => {
        clearTimeout(timer);
        const models = parseCopilotModelsFromHelp(output);
        if (models.length > 0) {
          resolve(models);
          return;
        }
        resolve([]);
      });
      child.on("error", () => { clearTimeout(timer); resolve([]); });
    });
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], { stdio: "pipe", shell: true, windowsHide: true });
      const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
      child.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
      child.on("error", () => { clearTimeout(timer); resolve(false); });
    });
  }
}

function killChildTree(child: ChildProcess, signal: "SIGINT" | "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch { /* fall through */ }
  }
  child.kill(signal);
}

function appendStderr(existing: string, chunk: string): string {
  const next = existing ? `${existing}\n${chunk}` : chunk;
  return next.length > 4000 ? next.slice(-4000) : next;
}

export function buildCopilotExitError(code: number | null, signal: NodeJS.Signals | null, stderr: string): string {
  const base = `Copilot CLI exited with code ${code}${signal ? ` (signal=${signal})` : ""}`;
  const detail = stderr.trim();
  return detail ? `${base}: ${detail}` : base;
}

export function parseCopilotModelsFromHelp(output: string): ProviderModelInfo[] {
  const lines = output.split(/\r?\n/);
  const modelLineIndex = lines.findIndex((line) => line.includes("--model "));
  if (modelLineIndex === -1) return [];

  const choiceLines: string[] = [];
  for (let i = modelLineIndex; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i > modelLineIndex && /^\s{2,}--[a-z0-9-]/i.test(line)) break;
    choiceLines.push(line);
    if (line.includes(")")) break;
  }

  const block = choiceLines.join(" ");
  const match = block.match(/\(choices:\s*([^)]+)\)/);
  if (!match?.[1]) return [];

  const choices = match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);

  return choices.map((id, i) => ({
    id,
    name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    isDefault: i === 0,
  }));
}
