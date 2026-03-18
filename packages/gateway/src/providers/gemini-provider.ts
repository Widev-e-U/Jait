/**
 * Gemini CLI Provider — wraps Google's Gemini CLI as a Jait provider.
 *
 * Spawns `gemini` CLI with `-o stream-json` for structured NDJSON output.
 *
 * Gemini CLI stream-json events:
 *   { type: "init", session_id, model }
 *   { type: "message", role: "user"|"assistant", content, delta? }
 *   { type: "result", status: "success"|"error", stats? }
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
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
  /** Gemini CLI session_id from the init event — used for --resume */
  geminiSessionId?: string;
  /** Number of turns sent in this session (first turn starts fresh, subsequent resume) */
  turnCount: number;
  /** Whether MCP config was injected into the project .gemini/settings.json */
  mcpConfigInjected: boolean;
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
    const dynamic = await this.fetchModelsFromCli();
    if (dynamic.length > 0) return dynamic;

    return FALLBACK_MODELS;
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
      turnCount: 0,
      mcpConfigInjected: false,
    };

    // Inject MCP servers into the project-level .gemini/settings.json
    this.injectMcpConfig(state, options.mcpServers);

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

    // Resume previous session for multi-turn conversation
    if (state.turnCount > 0 && state.geminiSessionId) {
      args.push("--resume", "latest");
    }
    state.turnCount++;

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
      if (text && !text.startsWith("Loaded cached")) {
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

    // Clean up injected MCP config
    this.cleanupMcpConfig(state);

    this.sessions.delete(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Dynamically discover models from the installed gemini-cli-core package.
   * Reads dist/src/config/models.js and extracts VALID_GEMINI_MODELS + auto aliases.
   */
  private async fetchModelsFromCli(): Promise<ProviderModelInfo[]> {
    try {
      const modelsJs = await this.findGeminiModelsJs();
      if (!modelsJs) return [];

      const source = readFileSync(modelsJs, "utf-8");

      // Extract concrete models from VALID_GEMINI_MODELS Set
      const validSet = new Set<string>();
      const setMatch = source.match(/VALID_GEMINI_MODELS\s*=\s*new\s+Set\(\[([^\]]+)\]/s);
      if (setMatch?.[1]) {
        const refs = setMatch[1].matchAll(/(\w+)/g);
        for (const [, ref] of refs) {
          if (!ref) continue;
          const constMatch = source.match(new RegExp(`const\\s+${ref}\\s*=\\s*['"]([^'"]+)['"]`));
          if (constMatch?.[1]) validSet.add(constMatch[1]);
        }
      }

      // Extract auto aliases
      const autoModels = new Set<string>();
      for (const m of source.matchAll(/(?:MODEL_AUTO|MODEL_ALIAS_AUTO)\s*=\s*['"]([^'"]+)['"]/g)) {
        if (m[1]) autoModels.add(m[1]);
      }

      const models: ProviderModelInfo[] = [];

      // Add auto aliases first
      for (const id of autoModels) {
        const label = id.includes("3") ? "Auto (Gemini 3)" : id.includes("2.5") ? "Auto (Gemini 2.5)" : `Auto (${id})`;
        models.push({ id, name: label, description: "Intelligent model routing", isDefault: id.includes("3") });
      }
      // Also add the bare "auto" alias
      if (!autoModels.has("auto")) {
        models.push({ id: "auto", name: "Auto (latest)", description: "Automatically selects the best model", isDefault: true });
      }

      // Add concrete models
      for (const id of validSet) {
        if (id.includes("customtools")) continue; // internal-only variant
        const tier = id.includes("flash-lite") ? "Flash Lite" : id.includes("flash") ? "Flash" : "Pro";
        const family = id.match(/gemini-(\d[\d.]*)/)?.[1] ?? "";
        const preview = id.includes("preview") ? " Preview" : "";
        models.push({
          id,
          name: `Gemini ${family} ${tier}${preview}`,
          description: `${tier} model${preview ? " (preview)" : ""}`,
        });
      }

      return models.length > 0 ? models : [];
    } catch {
      return [];
    }
  }

  private async findGeminiModelsJs(): Promise<string | null> {
    // Strategy 1: resolve from global npm prefix
    const paths = [
      // npm global
      join(homedir(), ".npm-global", "lib", "node_modules", "@google", "gemini-cli", "node_modules", "@google", "gemini-cli-core", "dist", "src", "config", "models.js"),
      // Linux/macOS default global
      "/usr/local/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/config/models.js",
      "/usr/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/config/models.js",
      // bun global
      join(homedir(), ".bun", "install", "global", "node_modules", "@google", "gemini-cli-core", "dist", "src", "config", "models.js"),
    ];

    for (const p of paths) {
      if (existsSync(p)) return p;
    }

    // Strategy 2: use `npm root -g` to find global prefix dynamically
    try {
      const result = spawnSync("npm", ["root", "-g"], { encoding: "utf-8", timeout: 5000, shell: true });
      if (result.status === 0 && result.stdout?.trim()) {
        const p = join(result.stdout.trim(), "@google", "gemini-cli", "node_modules", "@google", "gemini-cli-core", "dist", "src", "config", "models.js");
        if (existsSync(p)) return p;
      }
    } catch { /* ignore */ }

    return null;
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
        // Not valid JSON — emit as plain text token
        if (trimmed.length > 0) {
          this.emit({ type: "token", sessionId: state.session.id, content: trimmed });
        }
      }
    }
  }

  private handleEvent(state: GeminiSessionState, event: Record<string, unknown>): void {
    const sessionId = state.session.id;
    const type = event["type"] as string;

    switch (type) {
      case "init": {
        // Session initialization — capture session_id for resume and model info
        const geminiSid = String(event["session_id"] ?? "");
        if (geminiSid) {
          state.geminiSessionId = geminiSid;
        }
        const model = String(event["model"] ?? "");
        if (model) {
          this.emit({
            type: "activity",
            sessionId,
            kind: "init",
            summary: `Gemini session started with model ${model}`,
          });
        }
        break;
      }

      case "message": {
        const role = String(event["role"] ?? "");
        const content = String(event["content"] ?? "");
        if (role === "assistant" && content) {
          this.emit({ type: "token", sessionId, content });
        }
        break;
      }

      case "tool_use": {
        const toolName = String(event["tool_name"] ?? "");
        const callId = String(event["tool_id"] ?? uuidv7());
        const args = (event["parameters"] ?? {}) as Record<string, unknown>;
        this.emit({ type: "tool.start", sessionId, tool: toolName, args, callId });
        break;
      }

      case "tool_result": {
        const callId = String(event["tool_id"] ?? "");
        const status = String(event["status"] ?? "");
        const output = String(event["output"] ?? event["error"] ?? "");
        this.emit({
          type: "tool.result",
          sessionId,
          tool: callId,
          ok: status === "success",
          message: output,
          callId,
        });
        break;
      }

      case "thought": {
        const content = String(event["content"] ?? "");
        if (content) {
          this.emit({ type: "activity", sessionId, kind: "thinking", summary: content, payload: event });
        }
        break;
      }

      case "error": {
        const message = String(event["message"] ?? "Unknown error");
        this.emit({ type: "session.error", sessionId, error: message });
        break;
      }

      case "result": {
        const status = String(event["status"] ?? "");
        if (status === "error") {
          const err = event["error"] as Record<string, unknown> | undefined;
          const message = String(err?.["message"] ?? "Gemini turn failed");
          this.emit({ type: "session.error", sessionId, error: message });
        }
        const stats = event["stats"] as Record<string, unknown> | undefined;
        if (stats) {
          this.emit({
            type: "activity",
            sessionId,
            kind: "usage",
            summary: "Gemini usage stats",
            payload: stats,
          });
        }
        break;
      }
    }
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private getState(sessionId: string): GeminiSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No Gemini session found: ${sessionId}`);
    return state;
  }

  private hasGeminiConfig(): boolean {
    const configDir = join(homedir(), ".gemini");
    const settingsFile = join(configDir, "settings.json");
    return existsSync(settingsFile);
  }

  /**
   * Inject Jait MCP servers into the project-level .gemini/settings.json.
   * Gemini CLI reads mcpServers from <cwd>/.gemini/settings.json.
   */
  private injectMcpConfig(
    state: GeminiSessionState,
    servers: StartSessionOptions["mcpServers"],
  ): void {
    if (!servers || servers.length === 0) return;

    const configDir = join(state.workingDirectory, ".gemini");
    const configPath = join(configDir, "settings.json");

    // Read existing project settings if present
    let settings: Record<string, unknown> = {};
    try {
      if (existsSync(configPath)) {
        settings = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      }
    } catch { /* start fresh */ }

    const mcpServers = (settings["mcpServers"] ?? {}) as Record<string, unknown>;

    for (const server of servers) {
      if (server.transport === "stdio" && server.command) {
        mcpServers[server.name] = {
          command: server.command,
          args: server.args ?? [],
          trust: true,
          ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        };
      } else if ((server.transport === "sse" || server.transport as string === "http") && server.url) {
        mcpServers[server.name] = {
          url: server.url,
          trust: true,
        };
      }
    }

    settings["mcpServers"] = mcpServers;
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify(settings, null, 2));
    state.mcpConfigInjected = true;
  }

  /**
   * Remove Jait-injected MCP servers from the project .gemini/settings.json on session end.
   */
  private cleanupMcpConfig(state: GeminiSessionState): void {
    if (!state.mcpConfigInjected) return;

    const configPath = join(state.workingDirectory, ".gemini", "settings.json");
    try {
      if (!existsSync(configPath)) return;
      const settings = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const mcpServers = settings["mcpServers"] as Record<string, unknown> | undefined;
      if (mcpServers) {
        // Remove servers that have trust: true (our injected ones)
        for (const [name, config] of Object.entries(mcpServers)) {
          if ((config as Record<string, unknown>)?.["trust"] === true) {
            delete mcpServers[name];
          }
        }
        if (Object.keys(mcpServers).length === 0) {
          delete settings["mcpServers"];
        }
      }
      writeFileSync(configPath, JSON.stringify(settings, null, 2));
    } catch { /* best effort */ }
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

const FALLBACK_MODELS: ProviderModelInfo[] = [
  { id: "auto", name: "Auto (latest)", description: "Automatically selects the best model", isDefault: true },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", description: "Pro model (preview)" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", description: "Pro model (preview)" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", description: "Flash model (preview)" },
  { id: "gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite Preview", description: "Flash Lite model (preview)" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Pro model" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Flash model" },
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", description: "Flash Lite model" },
];

function killChildTree(child: ChildProcess, signal: "SIGINT" | "SIGTERM" | "SIGKILL" = "SIGTERM"): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch { /* fall through */ }
  }
  child.kill(signal);
}
