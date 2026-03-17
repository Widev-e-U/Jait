/**
 * Gemini CLI Provider — wraps Google's Gemini CLI as a Jait provider.
 *
 * Spawns `gemini` CLI with `-o stream-json` for structured NDJSON output.
 *
 * Gemini CLI stream-json events:
 *   { type: "init", session_id, model }
 *   { type: "message", role, content, delta? }
 *   { type: "tool_use", tool_name, tool_id, parameters }
 *   { type: "tool_result", tool_id, status, output?, error? }
 *   { type: "error", severity, message }
 *   { type: "result", status, stats? }
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
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

interface GeminiSessionState {
  session: ProviderSession;
  process: ChildProcess | null;
  buffer: string;
  workingDirectory: string;
  env: Record<string, string>;
  model?: string;
  exitMode: "normal" | "interrupt" | "stop";
}

// ── Provider implementation ──────────────────────────────────────────

export class GeminiProvider implements CliProviderAdapter {
  readonly id = "gemini" as const;
  readonly info: ProviderInfo = {
    id: "gemini",
    name: "Gemini CLI",
    description: "Google Gemini CLI agent with agentic coding and MCP support",
    available: false,
    modes: ["full-access", "supervised"],
  };

  private sessions = new Map<string, GeminiSessionState>();
  private emitter = new EventEmitter();
  private geminiPath: string | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      const available = await this.testCommand("gemini");
      if (!available) {
        this.info.available = false;
        this.info.unavailableReason = "Gemini CLI not found. Install with: npm install -g @google/gemini-cli";
        return false;
      }
      this.geminiPath = "gemini";

      const hasApiKey = !!process.env.GEMINI_API_KEY?.trim() || !!process.env.GOOGLE_API_KEY?.trim();
      const hasConfig = this.hasGeminiConfig();
      if (!hasApiKey && !hasConfig) {
        this.info.available = false;
        this.info.unavailableReason = "Gemini CLI is not configured. Run `gemini` once or set GEMINI_API_KEY.";
        return false;
      }

      this.info.available = true;
      this.info.unavailableReason = undefined;
      return true;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check Gemini CLI availability";
      return false;
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    // Gemini CLI doesn't have a model-list command.
    // Use well-known model aliases and attempt to discover via --help.
    try {
      const models = await this.parseModelsFromHelp();
      if (models.length > 0) return models;
    } catch { /* fall through */ }

    return [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Most capable Gemini model", isDefault: true },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and efficient" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Previous generation flash" },
    ];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const session: ProviderSession = {
      id: sessionId,
      providerId: "gemini",
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...options.env,
    };

    const state: GeminiSessionState = {
      session,
      process: null,
      buffer: "",
      workingDirectory: options.workingDirectory,
      env,
      model: options.model,
      exitMode: "normal",
    };

    this.sessions.set(sessionId, state);
    state.session.status = "running";
    this.emit({ type: "session.started", sessionId });

    return session;
  }

  async sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void> {
    const state = this.getState(sessionId);
    if (state.process) {
      throw new Error("Gemini CLI turn already running");
    }

    const args: string[] = [
      "-p", message,
      "-o", "stream-json",
    ];

    if (state.session.runtimeMode === "full-access") {
      args.push("--yolo");
    }

    if (state.model) {
      args.push("-m", state.model);
    }

    const cmd = this.geminiPath ?? "gemini";
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
        console.error(`[gemini:${sessionId}] stderr: ${text}`);
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

        const error = `Gemini CLI exited with code ${code}${signal ? ` (signal=${signal})` : ""}`;
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
    console.warn("Gemini CLI approval response not implemented for non-interactive mode");
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

  private getState(sessionId: string): GeminiSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No Gemini session found: ${sessionId}`);
    return state;
  }

  private processBuffer(_sessionId: string, state: GeminiSessionState): void {
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

  private handleEvent(state: GeminiSessionState, event: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const type = event["type"] as string;

    switch (type) {
      case "init": {
        this.emit({
          type: "activity",
          sessionId,
          kind: "init",
          summary: `Gemini session initialized (model: ${event["model"] ?? "default"})`,
          payload: event,
        });
        break;
      }

      case "message": {
        const content = String(event["content"] ?? "");
        const role = event["role"] as string;
        if (event["delta"]) {
          // Streaming chunk
          this.emit({ type: "token", sessionId, content });
        } else if (role === "assistant") {
          this.emit({ type: "message", sessionId, role: "assistant", content });
        }
        break;
      }

      case "tool_use": {
        const toolName = String(event["tool_name"] ?? "");
        const toolId = String(event["tool_id"] ?? uuidv7());
        const params = (event["parameters"] as Record<string, unknown>) ?? {};
        this.emit({
          type: "tool.start",
          sessionId,
          tool: toolName,
          args: params,
          callId: toolId,
        });
        break;
      }

      case "tool_result": {
        const toolId = String(event["tool_id"] ?? "");
        const status = event["status"] as string;
        const output = String(event["output"] ?? "");
        const error = event["error"] as Record<string, unknown> | undefined;
        this.emit({
          type: "tool.result",
          sessionId,
          tool: toolId,
          ok: status === "success",
          message: error ? String(error["message"] ?? output) : output,
          callId: toolId,
        });
        break;
      }

      case "error": {
        const message = String(event["message"] ?? "Unknown error");
        this.emit({
          type: "activity",
          sessionId,
          kind: "error",
          summary: `Gemini error: ${message}`,
          payload: event,
        });
        break;
      }

      case "result": {
        // Final result event — session stats
        this.emit({
          type: "activity",
          sessionId,
          kind: "result",
          summary: `Gemini turn completed (status: ${event["status"] ?? "unknown"})`,
          payload: event,
        });
        break;
      }

      default:
        this.emit({
          type: "activity",
          sessionId,
          kind: type ?? "unknown",
          summary: `Gemini: ${type}`,
          payload: event,
        });
    }
  }

  private hasGeminiConfig(): boolean {
    const configDir = join(homedir(), ".gemini");
    const settingsFile = join(configDir, "settings.json");
    return existsSync(settingsFile);
  }

  private parseModelsFromHelp(): Promise<ProviderModelInfo[]> {
    return new Promise((resolve) => {
      const child = spawn("gemini", ["--help"], { stdio: "pipe", shell: true });
      let output = "";
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 5000);

      child.stdout?.on("data", (d: Buffer) => { output += d.toString(); });
      child.on("exit", () => {
        clearTimeout(timer);
        // Try to extract model names from --model description
        const modelMatch = output.match(/--model.*?<([^>]+)>/);
        if (modelMatch?.[1]) {
          const choices = modelMatch[1].split("|").map(s => s.trim()).filter(Boolean);
          if (choices.length > 0) {
            resolve(choices.map((id, i) => ({
              id,
              name: id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
              isDefault: i === 0,
            })));
            return;
          }
        }
        resolve([]);
      });
      child.on("error", () => { clearTimeout(timer); resolve([]); });
    });
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(cmd, ["--version"], { stdio: "pipe", shell: true });
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
