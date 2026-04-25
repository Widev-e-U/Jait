/**
 * Codex CLI Provider — wraps OpenAI Codex CLI as a Jait provider.
 *
 * Spawns `codex app-server` as a child process and communicates
 * via JSON-RPC 2.0 over NDJSON on stdin/stdout.
 *
 * Protocol (codex-cli ≥ 0.111.0):
 *   1. spawn `codex app-server` with piped stdio
 *   2. send `initialize` request → get response
 *   3. send `initialized` notification (no response)
 *   4. send `thread/start` request → get threadId
 *   5. send `turn/start` request per user message
 *   6. listen for notifications: item/agentMessage/delta, turn/completed, etc.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
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
import { mapCodexNotification } from "./codex-event-mapper.js";
import {
  DEVICE_PROVIDER_AUTH,
  killChildTree as killAuthChildTree,
  runAuthCommand,
  startDeviceLoginCommand,
} from "./provider-auth.js";

// ── JSON-RPC types ───────────────────────────────────────────────────

interface JsonRpcRequest {
  id: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

// ── Pending request tracking ─────────────────────────────────────────

interface PendingRequest {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

// ── Internal session state ───────────────────────────────────────────

interface CodexSessionState {
  session: ProviderSession;
  child: ChildProcess;
  rl: readline.Interface;
  pending: Map<string, PendingRequest>;
  nextId: number;
  providerThreadId: string | null;
  stopping: boolean;
}

// ── Provider implementation ──────────────────────────────────────────

export class CodexProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "OpenAI Codex",
    description: "OpenAI Codex CLI agent with sandboxed execution and MCP support",
    available: false,
    modes: ["full-access", "supervised"],
    auth: DEVICE_PROVIDER_AUTH,
  };

  private sessions = new Map<string, CodexSessionState>();
  private emitter = new EventEmitter();
  private codexPath: string | null = null;
  private authLoginProcess: ChildProcess | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      // ── Step 1: Check if binary is installed ──
      const paths = ["codex", "npx codex"];
      let found = false;
      for (const cmd of paths) {
        const available = await this.testCommand(cmd);
        if (available) {
          this.codexPath = cmd;
          found = true;
          break;
        }
      }
      if (!found) {
        this.info.available = false;
        this.info.unavailableReason = "Codex CLI not installed. Install with: npm install -g @openai/codex";
        return false;
      }

      // ── Step 2: Check if authenticated ──
      const hasApiKey = !!process.env.OPENAI_API_KEY;
      const hasOAuthTokens = this.checkCodexAuthFile();
      if (!hasApiKey && !hasOAuthTokens) {
        this.info.available = false;
        this.info.unavailableReason = "Codex not authenticated. Run: codex login";
        return false;
      }

      this.info.available = true;
      this.info.unavailableReason = undefined;
      return true;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check Codex CLI availability";
      return false;
    }
  }

  private getCodexAuthPath(): string {
    const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
    return join(codexHome, "auth.json");
  }

  private readCodexAuthFile(): {
    OPENAI_API_KEY?: string | null;
    tokens?: { access_token?: string | null };
    [key: string]: unknown;
  } | null {
    try {
      const authPath = this.getCodexAuthPath();
      if (!existsSync(authPath)) return null;
      const raw = readFileSync(authPath, "utf-8");
      return JSON.parse(raw) as {
        OPENAI_API_KEY?: string | null;
        tokens?: { access_token?: string | null };
        [key: string]: unknown;
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if ~/.codex/auth.json (or CODEX_HOME/auth.json) contains Codex CLI credentials.
   */
  private checkCodexAuthFile(): boolean {
    const auth = this.readCodexAuthFile();
    if (!auth) return false;
    try {
      if (auth.OPENAI_API_KEY) return true;
      if (auth.tokens?.access_token) return true;
      return false;
    } catch {
      return false;
    }
  }

  private clearCodexAuthFile(): boolean {
    const auth = this.readCodexAuthFile();
    if (!auth) return true;

    delete auth.OPENAI_API_KEY;
    delete auth.tokens;

    const remaining = Object.entries(auth).filter(([, value]) => value !== undefined && value !== null);
    try {
      if (remaining.length === 0) {
        unlinkSync(this.getCodexAuthPath());
      } else {
        writeFileSync(this.getCodexAuthPath(), `${JSON.stringify(Object.fromEntries(remaining), null, 2)}\n`, "utf-8");
      }
      return true;
    } catch {
      return false;
    }
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    const authenticated = this.checkCodexAuthFile();
    return {
      ...DEVICE_PROVIDER_AUTH,
      authenticated,
      detail: authenticated
        ? "Codex CLI credentials are configured."
        : "Codex CLI is not authenticated.",
    };
  }

  async startLogin(): Promise<ProviderLoginResult> {
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }
    const { result, child } = await startDeviceLoginCommand({
      providerId: this.id,
      label: "Codex",
      commandLine: this.codexPath ?? "codex",
      args: ["login", "--device-auth"],
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
    const result = await runAuthCommand(this.id, this.codexPath ?? "codex", ["logout"]);
    const cleared = result.ok ? this.clearCodexAuthFile() : true;
    await this.checkAvailability().catch(() => false);
    return {
      ...result,
      ok: result.ok && cleared,
      status: result.ok && cleared ? result.status : "error",
      message: result.ok
        ? cleared
          ? "Codex logout completed."
          : "Codex logout ran, but stored credentials could not be removed."
        : result.message,
    };
  }

  /**
   * List available models by spawning a short-lived `codex app-server`,
   * performing the initialize handshake, then calling `model/list`.
   */
  async listModels(): Promise<ProviderModelInfo[]> {
    const spawnSpec = parseCommand(this.codexPath ?? "codex");
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spawnSpec.command, [...spawnSpec.args, "app-server"], {
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      });
    } catch {
      return [];
    }

    // Suppress EPIPE errors when child exits before we finish writing
    child.stdin?.on("error", () => {/* ignore broken pipe */});

    // Handle spawn errors (e.g. ENOENT when codex is not installed)
    const spawnError = new Promise<never>((_, reject) => {
      child.on("error", (err) => reject(err));
    });

    const rl = readline.createInterface({ input: child.stdout! });
    const pending = new Map<string, PendingRequest>();
    let nextId = 1;

    const writeMsg = (msg: unknown) => {
      if (child.stdin?.writable) child.stdin.write(JSON.stringify(msg) + "\n");
    };

    const sendReq = (method: string, params: unknown, timeoutMs = 15_000): Promise<unknown> => {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(String(id));
          reject(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);
        pending.set(String(id), { method, timeout, resolve, reject });
        writeMsg({ method, id, params });
      });
    };

    // Listen for JSON-RPC responses
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id != null) {
          const p = pending.get(String(msg.id));
          if (p) {
            pending.delete(String(msg.id));
            clearTimeout(p.timeout);
            if (msg.error) {
              p.reject(new Error(msg.error.message ?? "RPC error"));
            } else {
              p.resolve(msg.result);
            }
          }
        }
      } catch { /* ignore non-JSON lines */ }
    });

    try {
      // Handshake (race against spawn errors like ENOENT)
      await Promise.race([
        sendReq("initialize", {
          clientInfo: { name: "jait", title: "Jait Gateway", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        }),
        spawnError,
      ]);
      writeMsg({ method: "initialized" });

      // Fetch model list — response shape: { data: [{id, model, displayName, description, isDefault, ...}], nextCursor }
      const result = await sendReq("model/list", {}) as {
        data?: Array<{ id?: string; model?: string; displayName?: string; description?: string; isDefault?: boolean }>;
        models?: Array<{ id?: string; name?: string; description?: string }>;
      } | undefined;

      const models: ProviderModelInfo[] = [];
      const items = (result as Record<string, unknown>)?.data ?? (result as Record<string, unknown>)?.models;
      if (Array.isArray(items)) {
        for (const m of items as Array<Record<string, unknown>>) {
          const id = String(m.id ?? m.model ?? m.name ?? "");
          const name = String(m.displayName ?? m.name ?? m.id ?? "");
          if (!id) continue;
          models.push({
            id,
            name,
            ...(m.description ? { description: String(m.description) } : {}),
            ...(m.isDefault ? { isDefault: true } : {}),
          });
        }
      }
      return models;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[codex] model/list failed: ${msg}`);
      return [];
    } finally {
      // Clean up
      for (const p of pending.values()) {
        clearTimeout(p.timeout);
        p.reject(new Error("Session closed"));
      }
      pending.clear();
      rl.close();
      child.kill("SIGTERM");
    }
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();

    const spawnSpec = parseCommand(this.codexPath ?? "codex");
    const child = spawn(
      spawnSpec.command,
      [...spawnSpec.args, "app-server", ...buildCodexMcpConfigArgs(options.mcpServers)],
      {
        cwd: options.workingDirectory,
        env: {
          ...process.env as Record<string, string>,
          ...options.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      },
    );

    // Suppress EPIPE errors when child exits before we finish writing
    child.stdin?.on("error", () => {/* ignore broken pipe */});

    const rl = readline.createInterface({ input: child.stdout! });

    // Collect stderr for diagnostics if startup fails
    const stderrChunks: string[] = [];
    child.stderr?.on("data", (data: Buffer) => {
      stderrChunks.push(data.toString());
    });

    const session: ProviderSession = {
      id: sessionId,
      providerId: "codex",
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const state: CodexSessionState = {
      session,
      child,
      rl,
      pending: new Map(),
      nextId: 1,
      providerThreadId: null,
      stopping: false,
    };

    this.sessions.set(sessionId, state);
    this.attachListeners(state);

    try {
      // ── Step 1: initialize handshake (45s — codex can be slow to start) ──
      await this.sendRequest(state, "initialize", {
        clientInfo: { name: "jait", title: "Jait Gateway", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      }, 45_000);

      // ── Step 2: initialized notification (no response expected) ──
      this.writeMessage(state, { method: "initialized" });

      // ── Step 3: thread/start ──
      const { approvalPolicy, sandbox } = mapRuntimeMode(options.mode);
      const threadResponse = await this.sendRequest(state, "thread/start", {
        model: options.model ?? null,
        cwd: options.workingDirectory,
        approvalPolicy,
        sandbox,
        experimentalRawEvents: false,
      }) as { thread?: { id?: string }; threadId?: string };

      const providerThreadId = threadResponse?.thread?.id ?? threadResponse?.threadId;
      if (!providerThreadId) {
        throw new Error("thread/start response did not include a thread id");
      }
      state.providerThreadId = providerThreadId;
      state.session.status = "running";
      this.emit({ type: "session.started", sessionId });
      return session;
    } catch (error) {
      state.session.status = "error";
      const baseMsg = error instanceof Error ? error.message : "Failed to start Codex session";
      const stderr = stderrChunks.join("").trim();
      state.session.error = stderr
        ? `${baseMsg}\n--- stderr ---\n${stderr.slice(0, 2000)}`
        : baseMsg;
      console.error(`[codex:${sessionId}] startSession failed: ${state.session.error}`);
      this.emit({ type: "session.error", sessionId, error: state.session.error });
      this.stopSession(sessionId);
      throw error;
    }
  }

  async sendTurn(sessionId: string, message: string, _attachments?: string[]): Promise<void> {
    const state = this.getState(sessionId);
    if (!state.providerThreadId) {
      throw new Error("Session has no active thread");
    }

    await this.sendRequest(state, "turn/start", {
      threadId: state.providerThreadId,
      input: [{ type: "text", text: message, text_elements: [] }],
    });
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state?.providerThreadId) return;

    try {
      await this.sendRequest(state, "turn/interrupt", {
        threadId: state.providerThreadId,
      });
    } catch {
      // best effort
    }
  }

  async respondToApproval(sessionId: string, requestId: string, approved: boolean): Promise<void> {
    const state = this.getState(sessionId);
    // Respond to the server request with a JSON-RPC response using the original request id
    this.writeMessage(state, {
      id: requestId,
      result: { decision: approved ? "approve" : "deny" },
    });
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    state.stopping = true;

    // Clear pending requests
    for (const [, pending] of state.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Session stopped"));
    }
    state.pending.clear();

    // Close readline interface
    state.rl.close();

    // Kill the process tree
    if (!state.child.killed) {
      killChildTree(state.child);
    }

    this.sessions.delete(sessionId);

    // Emit session.completed so the onEvent handler in /start can unsubscribe
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  // ── Private helpers ────────────────────────────────────────────────

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private getState(sessionId: string): CodexSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`No Codex session found: ${sessionId}`);
    return state;
  }

  private attachListeners(state: CodexSessionState): void {
    state.rl.on("line", (line: string) => {
      this.handleStdoutLine(state, line);
    });

    state.child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        // Filter out noisy info/debug/trace log lines from codex
        const isLogLine = /^\d{4}-\d{2}-\d{2}T\S+\s+(TRACE|DEBUG|INFO|WARN)\s+/.test(text);
        if (!isLogLine) {
          console.error(`[codex:${state.session.id}] stderr: ${text}`);
        }
      }
    });

    state.child.on("error", (err) => {
      state.session.status = "error";
      state.session.error = err.message;
      this.emit({ type: "session.error", sessionId: state.session.id, error: err.message });
    });

    state.child.on("exit", (code, signal) => {
      if (state.stopping) return;
      const message = `codex app-server exited (code=${code}, signal=${signal})`;
      state.session.status = code === 0 ? "completed" : "error";
      state.session.completedAt = new Date().toISOString();
      if (code !== 0) {
        state.session.error = message;
      }
      this.emit({ type: "session.completed", sessionId: state.session.id });
      // Reject pending requests
      for (const [, pending] of state.pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Codex process exited"));
      }
      state.pending.clear();
      this.sessions.delete(state.session.id);
    });
  }

  private handleStdoutLine(state: CodexSessionState, line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;

    if (this.isResponse(parsed)) {
      this.handleResponse(state, parsed as JsonRpcResponse);
    } else if (this.isServerRequest(parsed)) {
      this.handleServerRequest(state, parsed as JsonRpcRequest);
    } else if (this.isServerNotification(parsed)) {
      this.handleServerNotification(state, parsed as JsonRpcNotification);
    }
  }

  /** Response: has id, no method */
  private isResponse(value: unknown): boolean {
    const obj = value as Record<string, unknown>;
    const hasId = typeof obj.id === "string" || typeof obj.id === "number";
    const hasMethod = typeof obj.method === "string";
    return hasId && !hasMethod;
  }

  /** Server request: has both method and id */
  private isServerRequest(value: unknown): boolean {
    const obj = value as Record<string, unknown>;
    return (
      typeof obj.method === "string" &&
      (typeof obj.id === "string" || typeof obj.id === "number")
    );
  }

  /** Server notification: has method, no id */
  private isServerNotification(value: unknown): boolean {
    const obj = value as Record<string, unknown>;
    return typeof obj.method === "string" && !("id" in obj);
  }

  private handleResponse(state: CodexSessionState, response: JsonRpcResponse): void {
    const key = String(response.id);
    const pending = state.pending.get(key);
    if (!pending) return;

    clearTimeout(pending.timeout);
    state.pending.delete(key);

    if (response.error?.message) {
      pending.reject(new Error(`${pending.method} failed: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  private handleServerRequest(state: CodexSessionState, request: JsonRpcRequest): void {
    const params = (request.params ?? {}) as Record<string, unknown>;

    // Approval requests from codex
    if (
      request.method === "item/commandExecution/requestApproval" ||
      request.method === "item/fileChange/requestApproval" ||
      request.method === "item/fileRead/requestApproval"
    ) {
      const tool = String(params.command ?? params.tool ?? request.method);
      this.emit({
        type: "tool.approval-required",
        sessionId: state.session.id,
        tool,
        args: params,
        requestId: String(request.id),
      });
      return;
    }

    // Unknown server request — respond with error
    this.writeMessage(state, {
      id: request.id,
      error: { code: -32601, message: `Unsupported server request: ${request.method}` },
    });
  }

  private handleServerNotification(state: CodexSessionState, notification: JsonRpcNotification): void {
    const params = (notification.params ?? {}) as Record<string, unknown>;
    const sessionId = state.session.id;

    // Local state mutations that the shared mapper can't handle
    if (notification.method === "turn/started") {
      state.session.status = "running";
    }
    if (notification.method === "turn/completed") {
      state.session.status = "idle";
    }

    const events = mapCodexNotification(notification.method, params, sessionId);
    for (const evt of events) {
      this.emit(evt);
    }
  }

  private sendRequest(
    state: CodexSessionState,
    method: string,
    params: unknown,
    timeoutMs = 20_000,
  ): Promise<unknown> {
    const id = state.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        state.pending.delete(String(id));
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      state.pending.set(String(id), { method, timeout, resolve, reject });
      this.writeMessage(state, { method, id, params });
    });
  }

  private writeMessage(state: CodexSessionState, message: unknown): void {
    if (!state.child.stdin?.writable) {
      throw new Error("Cannot write to codex app-server stdin");
    }
    state.child.stdin.write(JSON.stringify(message) + "\n");
  }

  private testCommand(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const spawnSpec = parseCommand(cmd);
      if (!spawnSpec.command) {
        resolve(false);
        return;
      }
      const child = spawn(spawnSpec.command, [...spawnSpec.args, "--version"], {
        stdio: "pipe",
        windowsHide: true,
        shell: process.platform === "win32",
      });
      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, 5000);
      child.on("exit", (code: number | null) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function mapRuntimeMode(mode: string): {
  approvalPolicy: "on-request" | "never";
  sandbox: "workspace-write" | "danger-full-access";
} {
  if (mode === "supervised") {
    return { approvalPolicy: "on-request", sandbox: "workspace-write" };
  }
  return { approvalPolicy: "never", sandbox: "danger-full-access" };
}

export function buildCodexMcpConfigArgs(
  servers: StartSessionOptions["mcpServers"],
): string[] {
  if (!servers?.length) return [];

  const args: string[] = [];

  for (const server of servers) {
    const prefix = `mcp_servers.${server.name}`;

    if (server.transport === "sse" && server.url) {
      args.push("-c", `${prefix}.url=${toTomlString(server.url)}`);
      continue;
    }

    if (server.transport === "stdio" && server.command) {
      args.push("-c", `${prefix}.command=${toTomlString(server.command)}`);
      args.push("-c", `${prefix}.args=${toTomlArray(server.args ?? [])}`);
      for (const [key, value] of Object.entries(server.env ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
        args.push("-c", `${prefix}.env.${key}=${toTomlString(value)}`);
      }
    }
  }

  return args;
}

function toTomlString(value: string): string {
  return JSON.stringify(value);
}

function toTomlArray(values: string[]): string {
  return `[${values.map((value) => toTomlString(value)).join(", ")}]`;
}

function parseCommand(commandLine: string): { command: string; args: string[] } {
  const parts = commandLine.trim().split(/\s+/).filter(Boolean);
  return {
    command: parts[0] ?? "",
    args: parts.slice(1),
  };
}

/**
 * On Windows, use `taskkill /T` to kill the entire process tree.
 */
function killChildTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // fallback
    }
  }
  child.kill();
}
