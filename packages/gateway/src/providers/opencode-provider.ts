/**
 * OpenCode CLI Provider — wraps the OpenCode CLI as a Jait provider.
 *
 * Spawns `opencode run <message> --format json` for structured NDJSON output.
 *
 * OpenCode JSON events:
 *   { type: "step_start", sessionID, part: { ... } }
 *   { type: "text", sessionID, part: { text, ... } }
 *   { type: "tool_start", sessionID, part: { tool, args, ... } }
 *   { type: "tool_result", sessionID, part: { tool, output, ... } }
 *   { type: "step_finish", sessionID, part: { reason, cost, tokens, ... } }
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
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

interface OpenCodeSessionState {
  session: ProviderSession;
  process: ChildProcess | null;
  buffer: string;
  workingDirectory: string;
  env: Record<string, string>;
  model?: string;
  exitMode: "normal" | "interrupt" | "stop";
  openCodeSessionId?: string;
  turnCount: number;
  mcpConfigInjected: boolean;
}

// ── Provider implementation ──────────────────────────────────────────

export class OpenCodeProvider implements CliProviderAdapter {
  readonly id = "opencode" as const;
  readonly info: ProviderInfo = {
    id: "opencode",
    name: "OpenCode",
    description: "OpenCode CLI agent with multi-provider model support",
    available: false,
    modes: ["full-access", "supervised"],
  };

  private sessions = new Map<string, OpenCodeSessionState>();
  private emitter = new EventEmitter();
  private opencodePath: string | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      const available = await this.testCommand("opencode");
      if (!available) {
        this.info.available = false;
        this.info.unavailableReason = "OpenCode CLI not found. Install from: https://github.com/nicepkg/opencode";
        return false;
      }
      this.opencodePath = "opencode";

      const hasApiKey = !!(
        process.env["ANTHROPIC_API_KEY"] ||
        process.env["OPENAI_API_KEY"] ||
        process.env["GOOGLE_API_KEY"] ||
        process.env["OPENROUTER_API_KEY"] ||
        process.env["AWS_ACCESS_KEY_ID"]
      );
      if (!hasApiKey) {
        this.info.available = false;
        this.info.unavailableReason =
          "No LLM API key found for OpenCode. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another provider key.";
        return false;
      }

      this.info.available = true;
      this.info.unavailableReason = undefined;
      return true;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check OpenCode CLI availability";
      return false;
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    try {
      const models = await this.fetchModels();
      if (models.length > 0) return models;
    } catch { /* fall through */ }

    return [
      { id: "default", name: "Default", description: "OpenCode default model", isDefault: true },
    ];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const session: ProviderSession = {
      id: sessionId,
      providerId: "opencode",
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
    };

    const state: OpenCodeSessionState = {
      session,
      process: null,
      buffer: "",
      workingDirectory: options.workingDirectory,
      env,
      model: options.model,
      exitMode: "normal",
      turnCount: 0,
      mcpConfigInjected: false,
    };

    this.sessions.set(sessionId, state);

    // Inject MCP servers into project-level opencode.json
    this.injectMcpConfig(state, options.mcpServers);

    state.session.status = "running";
    this.emit({ type: "session.started", sessionId });

    return session;
  }

  async sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void> {
    const state = this.getState(sessionId);
    if (state.process) {
      throw new Error("OpenCode turn already running");
    }

    const args: string[] = ["run", message, "--format", "json"];

    if (state.model) {
      args.push("-m", state.model);
    }

    // Resume previous session on 2nd+ turn
    if (state.turnCount > 0 && state.openCodeSessionId) {
      args.push("--session", state.openCodeSessionId);
    }

    state.turnCount++;

    const cmd = this.opencodePath ?? "opencode";
    const child = spawn(cmd, args, {
      cwd: state.workingDirectory,
      env: state.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      windowsHide: true,
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
        console.error(`[opencode:${sessionId}] stderr: ${text}`);
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

        const error = `OpenCode exited with code ${code}${signal ? ` (signal=${signal})` : ""}`;
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
    console.warn("OpenCode approval response not implemented for non-interactive mode");
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    // Clean up injected MCP config
    this.cleanupMcpConfig(state);

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

  private getState(sessionId: string): OpenCodeSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No OpenCode session found: ${sessionId}`);
    return state;
  }

  private processBuffer(_sessionId: string, state: OpenCodeSessionState): void {
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        this.handleEvent(state, event);
      } catch {
        // Not JSON — ignore
      }
    }
  }

  private handleEvent(state: OpenCodeSessionState, event: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const type = event["type"] as string;
    const part = event["part"] as Record<string, unknown> | undefined;

    switch (type) {
      case "text": {
        const text = String(part?.["text"] ?? "");
        const partType = String(part?.["type"] ?? "text");
        if (text) {
          if (partType === "thinking" || partType === "reasoning") {
            this.emit({ type: "activity", sessionId, kind: "thinking", summary: text, payload: part });
          } else {
            this.emit({ type: "token", sessionId, content: text });
          }
        }
        const textSessionId = event["sessionID"] as string | undefined;
        if (textSessionId && !state.openCodeSessionId) {
          state.openCodeSessionId = textSessionId;
        }
        break;
      }

      case "tool_start": {
        const tool = String(part?.["tool"] ?? part?.["name"] ?? "");
        const args = (part?.["args"] ?? part?.["input"] ?? {}) as Record<string, unknown>;
        const callId = String(part?.["id"] ?? uuidv7());
        this.emit({
          type: "tool.start",
          sessionId,
          tool,
          args,
          callId,
        });
        break;
      }

      case "tool_result": {
        const tool = String(part?.["tool"] ?? part?.["name"] ?? "");
        const callId = String(part?.["id"] ?? "");
        const output = String(part?.["output"] ?? part?.["content"] ?? "");
        const ok = part?.["error"] == null;
        this.emit({
          type: "tool.result",
          sessionId,
          tool,
          ok,
          message: output,
          callId,
        });
        break;
      }

      case "step_start": {
        // Capture session ID from events for resume
        const startSessionId = event["sessionID"] as string | undefined;
        if (startSessionId && !state.openCodeSessionId) {
          state.openCodeSessionId = startSessionId;
        }
        this.emit({
          type: "activity",
          sessionId,
          kind: "step_start",
          summary: "OpenCode step started",
          payload: event,
        });
        break;
      }

      case "step_finish": {
        const reason = String(part?.["reason"] ?? "");
        const cost = part?.["cost"] as number | undefined;
        const tokens = part?.["tokens"] as Record<string, unknown> | undefined;
        this.emit({
          type: "activity",
          sessionId,
          kind: "step_finish",
          summary: `OpenCode step finished (reason: ${reason}${cost != null ? `, cost: $${cost}` : ""})`,
          payload: { reason, cost, tokens },
        });
        break;
      }

      default:
        this.emit({
          type: "activity",
          sessionId,
          kind: type ?? "unknown",
          summary: `OpenCode: ${type}`,
          payload: event,
        });
    }
  }

  /** Dynamically fetch models by running `opencode models` */
  private fetchModels(): Promise<ProviderModelInfo[]> {
    return new Promise((resolve) => {
      const child = spawn("opencode", ["models"], { stdio: "pipe", shell: true, windowsHide: true });
      let output = "";
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 10000);

      child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
      child.on("exit", () => {
        clearTimeout(timer);
        const models: ProviderModelInfo[] = [];
        // Parse lines like "provider/model-name" or table output
        const lines = output.split("\n").map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          // Match patterns like "opencode/big-pickle" or "provider/model"
          const match = line.match(/^(\S+\/\S+)/);
          if (match?.[1]) {
            const id = match[1];
            const name = id.split("/").pop()?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) ?? id;
            models.push({
              id,
              name,
              isDefault: models.length === 0,
            });
          }
        }
        resolve(models);
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

  /** Inject MCP servers into project-level opencode.json */
  private injectMcpConfig(
    state: OpenCodeSessionState,
    servers: StartSessionOptions["mcpServers"],
  ): void {
    if (!servers || servers.length === 0) return;

    const configPath = join(state.workingDirectory, "opencode.json");

    // Read existing config if present
    let config: Record<string, unknown> = {};
    try {
      if (existsSync(configPath)) {
        config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      }
    } catch { /* start fresh */ }

    const mcp = (config["mcp"] ?? {}) as Record<string, unknown>;

    for (const server of servers) {
      if (server.transport === "stdio" && server.command) {
        const cmd = [server.command, ...(server.args ?? [])];
        mcp[server.name] = {
          type: "local",
          command: cmd,
          enabled: true,
          ...(server.env && Object.keys(server.env).length > 0 ? { environment: server.env } : {}),
        };
      } else if (server.transport === "sse" && server.url) {
        mcp[server.name] = {
          type: "remote",
          url: server.url,
          enabled: true,
        };
      }
    }

    config["mcp"] = mcp;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    state.mcpConfigInjected = true;
  }

  /** Remove injected MCP servers from opencode.json */
  private cleanupMcpConfig(state: OpenCodeSessionState): void {
    if (!state.mcpConfigInjected) return;

    const configPath = join(state.workingDirectory, "opencode.json");
    try {
      if (!existsSync(configPath)) return;
      const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const mcp = config["mcp"] as Record<string, unknown> | undefined;
      if (mcp) {
        // Remove servers that were injected (enabled: true local/remote entries)
        for (const [name, entry] of Object.entries(mcp)) {
          const e = entry as Record<string, unknown> | undefined;
          if (e?.["enabled"] === true) {
            delete mcp[name];
          }
        }
        if (Object.keys(mcp).length === 0) {
          delete config["mcp"];
        }
      }
      if (Object.keys(config).length === 0) {
        // If config is empty, don't leave an empty file behind
        unlinkSync(configPath);
      } else {
        writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
    } catch { /* best effort */ }
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
