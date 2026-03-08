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
import readline from "node:readline";
import { uuidv7 } from "../lib/uuidv7.js";
import type {
  CliProviderAdapter,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  ProviderEvent,
  StartSessionOptions,
} from "./contracts.js";

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
  };

  private sessions = new Map<string, CodexSessionState>();
  private emitter = new EventEmitter();
  private codexPath: string | null = null;

  async checkAvailability(): Promise<boolean> {
    try {
      const paths = ["codex", "npx codex"];
      for (const cmd of paths) {
        const available = await this.testCommand(cmd);
        if (available) {
          this.codexPath = cmd;
          this.info.available = true;
          return true;
        }
      }
      this.info.available = false;
      this.info.unavailableReason = "Codex CLI not found. Install with: npm install -g @openai/codex";
      return false;
    } catch {
      this.info.available = false;
      this.info.unavailableReason = "Failed to check Codex CLI availability";
      return false;
    }
  }

  /**
   * List available models by spawning a short-lived `codex app-server`,
   * performing the initialize handshake, then calling `model/list`.
   */
  async listModels(): Promise<ProviderModelInfo[]> {
    const cmd = this.codexPath ?? "codex";
    const child = spawn(cmd, ["app-server"], {
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
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
      // Handshake
      await sendReq("initialize", {
        clientInfo: { name: "jait", title: "Jait Gateway", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      });
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
      console.error("[codex] model/list failed:", err);
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

    const cmd = this.codexPath ?? "codex";
    const child = spawn(cmd, ["app-server"], {
      cwd: options.workingDirectory,
      env: {
        ...process.env as Record<string, string>,
        ...options.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    const rl = readline.createInterface({ input: child.stdout! });

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
      // ── Step 1: initialize handshake ──
      await this.sendRequest(state, "initialize", {
        clientInfo: { name: "jait", title: "Jait Gateway", version: "1.0.0" },
        capabilities: { experimentalApi: true },
      });

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
      state.session.error = error instanceof Error ? error.message : "Failed to start Codex session";
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

    switch (notification.method) {
      // ── Streaming text tokens ──
      case "item/agentMessage/delta":
      case "codex/event/agent_message_content_delta": {
        const delta =
          typeof params.delta === "string" ? params.delta
          : typeof params.text === "string" ? params.text
          : "";
        if (delta) {
          this.emit({ type: "token", content: delta });
        }
        break;
      }

      // ── Reasoning / chain-of-thought tokens ──
      case "item/reasoning/textDelta":
      case "item/reasoning/summaryTextDelta":
        // Handled in the noisy-events skip block below; these tokens
        // are too granular to persist as individual activities.
        break;

      // ── Tool/command output deltas ──
      case "item/commandExecution/outputDelta":
      case "item/fileChange/outputDelta": {
        const delta = typeof params.delta === "string" ? params.delta : "";
        if (delta) {
          const itemId = extractItemId(params);
          if (itemId) {
            this.emit({ type: "tool.output", callId: itemId, content: delta });
          }
          // Don't emit a redundant generic activity — the tool.output event
          // is already logged by logProviderEvent.
        }
        break;
      }

      // ── Item lifecycle for tool calls ──
      case "item/started": {
        const item = (params.item ?? params) as Record<string, unknown>;
        const itemId = extractItemId(params);
        const itemType = normalizeItemType(typeof item.type === "string" ? item.type : "");
        if (isToolItemType(itemType)) {
          const category = mapItemTypeToCategory(itemType);
          this.emit({ type: "tool.start", tool: category, args: buildToolArgs(item, category), callId: itemId });
        }
        break;
      }

      case "item/completed": {
        const item = (params.item ?? params) as Record<string, unknown>;
        const itemId = extractItemId(params);
        const itemType = normalizeItemType(typeof item.type === "string" ? item.type : "");
        if (isToolItemType(itemType)) {
          const category = mapItemTypeToCategory(itemType);
          const status = typeof item.status === "string" ? item.status : "completed";
          const output = typeof item.output === "string" ? item.output
            : typeof item.summary === "string" ? item.summary
            : "";
          this.emit({
            type: "tool.result",
            tool: category,
            ok: status !== "error" && status !== "failed",
            message: output,
            callId: itemId,
          });
        }
        break;
      }

      case "item/mcpToolCall/progress": {
        const itemId = extractItemId(params);
        const toolName =
          typeof params.name === "string"
            ? params.name
            : typeof params.toolName === "string"
              ? params.toolName
              : "mcp-tool";
        this.emit({
          type: "tool.start",
          tool: toolName,
          args: params.arguments ?? params.args ?? {},
          callId: itemId,
        });
        break;
      }

      // ── codex/event item lifecycle (codex 0.111.0+ envelope format) ──
      case "codex/event/item_started": {
        const msg = (params.msg ?? params) as Record<string, unknown>;
        const itemId = extractCodexEventItemId(params);
        const itemType = normalizeItemType(
          typeof msg.type === "string" ? msg.type
          : typeof msg.kind === "string" ? msg.kind
          : ""
        );
        if (isToolItemType(itemType)) {
          const category = mapItemTypeToCategory(itemType);
          this.emit({ type: "tool.start", tool: category, args: buildToolArgs(msg, category), callId: itemId });
        }
        break;
      }

      case "codex/event/item_completed": {
        const msg = (params.msg ?? params) as Record<string, unknown>;
        const itemId = extractCodexEventItemId(params);
        const itemType = normalizeItemType(
          typeof msg.type === "string" ? msg.type
          : typeof msg.kind === "string" ? msg.kind
          : ""
        );
        if (isToolItemType(itemType)) {
          const category = mapItemTypeToCategory(itemType);
          const status = typeof msg.status === "string" ? msg.status : "completed";
          const output = typeof msg.output === "string" ? msg.output
            : typeof msg.summary === "string" ? msg.summary
            : typeof msg.last_agent_message === "string" ? msg.last_agent_message
            : "";
          this.emit({
            type: "tool.result",
            tool: category,
            ok: status !== "error" && status !== "failed",
            message: output,
            callId: itemId,
          });
        }
        break;
      }

      // ── Turn lifecycle ──
      case "turn/started": {
        state.session.status = "running";
        break;
      }

      case "turn/completed": {
        // Mark as idle (ready for next turn) — NOT "completed" (which implies session ended)
        state.session.status = "idle";
        state.session.completedAt = new Date().toISOString();
        const turn = params.turn as Record<string, unknown> | undefined;
        const status = typeof turn?.status === "string" ? turn.status : "";
        const errorObj = turn?.error as Record<string, unknown> | undefined;
        if (status === "failed" && errorObj?.message) {
          state.session.error = String(errorObj.message);
          this.emit({ type: "session.error", sessionId, error: state.session.error });
        }
        this.emit({ type: "session.completed", sessionId });
        break;
      }

      // ── Errors ──
      case "error": {
        const errorObj = params.error as Record<string, unknown> | undefined;
        const message =
          typeof errorObj?.message === "string" ? errorObj.message : "Codex error";
        this.emit({ type: "session.error", sessionId, error: message });
        break;
      }

      // ── Agent / user complete messages → emit as proper message events ──
      case "codex/event/agent_message": {
        const text =
          typeof params.content === "string" ? params.content
          : typeof params.text === "string" ? params.text
          : typeof params.message === "string" ? params.message
          : typeof params.delta === "string" ? params.delta
          : "";
        if (text) {
          this.emit({ type: "message", role: "assistant", content: text });
        }
        break;
      }
      case "codex/event/user_message": {
        const text =
          typeof params.content === "string" ? params.content
          : typeof params.text === "string" ? params.text
          : typeof params.message === "string" ? params.message
          : "";
        if (text) {
          this.emit({ type: "message", role: "user", content: text });
        }
        break;
      }

      // ── Noisy / redundant events — skip logging to DB ──
      case "item/plan/delta":
      case "turn/plan/updated":
      case "turn/diff/updated":
      case "thread/tokenUsage/updated":
      case "codex/event/token_count":
      case "codex/event/agent_message_delta":
        // Already handled as token events or too noisy to persist
        break;

      // ── Known lifecycle / status notifications → emit as activity ──
      case "thread/started":
      case "thread/status/changed":
      case "thread/name/updated":
      case "model/rerouted":
      case "configWarning":
      case "deprecationNotice":
      case "account/updated":
      case "skills/changed":
      case "codex/event/mcp_startup_complete":
      case "codex/event/skills_update_available":
      case "codex/event/task_started":
      case "codex/event/task_complete":
      case "codex/event/agent_reasoning": {
        this.emit({
          type: "activity",
          kind: notification.method,
          summary: `Codex: ${notification.method}`,
          payload: params,
        });
        break;
      }

      default:
        this.emit({
          type: "activity",
          kind: notification.method,
          summary: `Codex: ${notification.method}`,
          payload: params,
        });
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
      const parts = cmd.split(" ");
      const bin = parts[0];
      if (!bin) {
        resolve(false);
        return;
      }
      const child = spawn(bin, [...parts.slice(1), "--version"], {
        stdio: "pipe",
        shell: true,
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

/**
 * On Windows with `shell: true`, `child.kill()` only terminates the cmd.exe
 * wrapper, leaving the actual process running. Use `taskkill /T` to kill
 * the entire process tree.
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

// ── Item ID extraction ───────────────────────────────────────────────

let _nextFallbackId = 1;

/** Extract item ID from standard item/* notification params */
function extractItemId(params: Record<string, unknown>): string {
  const item = params.item as Record<string, unknown> | undefined;
  return (
    asString(params.itemId) ??
    asString(item?.id) ??
    asString(params.id) ??
    `codex-item-${_nextFallbackId++}`
  );
}

/** Extract item ID from codex/event/* notification params (msg envelope) */
function extractCodexEventItemId(params: Record<string, unknown>): string {
  const msg = params.msg as Record<string, unknown> | undefined;
  return (
    asString(msg?.item_id) ??
    asString(msg?.itemId) ??
    asString(params.id) ??
    asString(msg?.id) ??
    `codex-evt-${_nextFallbackId++}`
  );
}

/** Safely read a string */
function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

// ── Item type classification ─────────────────────────────────────────

/** Normalize a raw item type to lowercase words for matching */
function normalizeItemType(raw: string): string {
  // camelCase → words, then lowercase
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-/]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Does this item type represent a tool / command / file operation? */
function isToolItemType(normalized: string): boolean {
  return (
    normalized.includes("command") ||
    normalized.includes("tool") ||
    normalized.includes("function") ||
    normalized.includes("file change") ||
    normalized.includes("file_change") ||
    normalized.includes("patch") ||
    normalized.includes("edit") ||
    normalized.includes("mcp") ||
    normalized.includes("web search")
  );
}

/**
 * Map a normalized item type to a frontend-compatible tool category.
 * These categories must match entries in the frontend's toolMeta dictionary
 * (e.g. 'execute', 'edit', 'read', 'search', 'web').
 */
function mapItemTypeToCategory(normalizedType: string): string {
  if (normalizedType.includes("command")) return "execute";
  if (normalizedType.includes("file change") || normalizedType.includes("file_change") ||
      normalizedType.includes("patch") || normalizedType.includes("edit")) return "edit";
  if (normalizedType.includes("file read") || normalizedType.includes("file_read")) return "read";
  if (normalizedType.includes("web search") || normalizedType.includes("web_search")) return "web";
  if (normalizedType.includes("mcp")) return "mcp-tool";
  if (normalizedType.includes("function") || normalizedType.includes("tool")) return "execute";
  return normalizedType || "tool";
}

/**
 * Build args that the frontend's getCallSummary can render nicely.
 * For 'execute' → { command: "...", ...rest }
 * For 'edit'    → { path: "...", ...rest }
 * For 'read'    → { path: "...", ...rest }
 * For 'web'     → { query: "...", ...rest }
 */
function buildToolArgs(
  item: Record<string, unknown>,
  category: string,
): Record<string, unknown> {
  switch (category) {
    case "execute": {
      const cmd =
        asString(item.command) ??
        (Array.isArray(item.command)
          ? (item.command as string[]).join(" ")
          : undefined) ??
        asString(item.name) ??
        asString(item.title) ??
        "";
      return { command: cmd, ...item };
    }
    case "edit":
    case "read": {
      const path =
        asString(item.name) ??
        asString(item.path) ??
        asString(item.file) ??
        asString(item.title) ??
        "";
      return { path, ...item };
    }
    case "web": {
      const query =
        asString(item.query) ??
        asString(item.name) ??
        asString(item.url) ??
        "";
      return { query, ...item };
    }
    default:
      return { ...item };
  }
}
