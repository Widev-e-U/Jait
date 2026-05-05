import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Agent,
  type AuthMethod,
  type Client,
  type InitializeResponse,
  type McpServer,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import { uuidv7 } from "../db/uuidv7.js";
import type {
  CliProviderAdapter,
  McpServerRef,
  ProviderEvent,
  ProviderAuthStatus,
  ProviderLoginResult,
  ProviderLogoutResult,
  ProviderId,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  RuntimeMode,
  StartSessionOptions,
} from "./contracts.js";
import {
  NO_PROVIDER_AUTH,
  killChildTree as killAuthChildTree,
  runAuthCommand,
  unsupportedLogin,
  unsupportedLogout,
} from "./provider-auth.js";

type AcpProviderAuthKind = "acp";

export interface AcpProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  modes?: RuntimeMode[];
  auth?: AcpProviderAuthKind | false;
}

interface PendingApproval {
  allowOptionId: string;
  rejectOptionId: string;
  resolve: (response: RequestPermissionResponse) => void;
}

interface AcpSessionState {
  session: ProviderSession;
  child: ChildProcess;
  connection: ClientSideConnection;
  agent: Agent;
  acpSessionId: string;
  approvals: Map<string, PendingApproval>;
  initialized: InitializeResponse;
}

class JaitAcpClient implements Client {
  constructor(
    private readonly provider: AcpProvider,
    private readonly sessionId: string,
    private readonly approvals: Map<string, PendingApproval>,
    private readonly runtimeMode?: string,
  ) {}

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const allowOptionId = params.options.find((option) => option.kind.startsWith("allow"))?.optionId ?? params.options[0]?.optionId ?? "allow";
    const rejectOptionId = params.options.find((option) => option.kind.startsWith("reject"))?.optionId ?? params.options.at(-1)?.optionId ?? "reject";

    // In full-access mode, auto-approve all tool requests without prompting.
    if (this.runtimeMode === "full-access") {
      return { outcome: { outcome: "selected", optionId: allowOptionId } };
    }

    const requestId = uuidv7();
    const response = new Promise<RequestPermissionResponse>((resolve) => {
      this.approvals.set(requestId, { allowOptionId, rejectOptionId, resolve });
    });

    this.provider.emitEvent({
      type: "tool.approval-required",
      sessionId: this.sessionId,
      tool: params.toolCall.title ?? params.toolCall.toolCallId,
      args: params.toolCall.rawInput,
      requestId,
    });

    return response;
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.provider.handleSessionUpdate(this.sessionId, params);
  }
}

export class AcpProvider implements CliProviderAdapter {
  readonly id: ProviderId;
  readonly info: ProviderInfo;

  private readonly config: Required<Omit<AcpProviderConfig, "env">> & { env?: Record<string, string> };
  private readonly authKind: AcpProviderAuthKind | null;
  private readonly sessions = new Map<string, AcpSessionState>();
  private readonly emitter = new EventEmitter();
  private authLoginProcess: ChildProcess | null = null;
  private cachedModels: ProviderModelInfo[] | null = null;

  constructor(config: AcpProviderConfig) {
    this.id = config.id;
    this.authKind = config.auth === false ? null : "acp";
    this.config = {
      ...config,
      args: config.args ?? [],
      modes: config.modes ?? ["full-access", "supervised"],
      auth: config.auth ?? false,
    };
    this.info = {
      id: config.id,
      name: config.name,
      description: config.description,
      available: false,
      modes: this.config.modes,
      auth: this.authKind ? { login: true, logout: false, deviceCode: false } : NO_PROVIDER_AUTH,
    };
  }

  async checkAvailability(): Promise<boolean> {
    const command = this.config.command;
    const probe = spawnSync(command, ["--version"], {
      stdio: "ignore",
      shell: false,
      env: { ...process.env, ...this.config.env },
    });

    if (probe.error && command !== "npx") {
      this.info.available = false;
      this.info.unavailableReason = `ACP provider command not found: ${command}`;
      return false;
    }

    this.info.available = true;
    this.info.unavailableReason = undefined;
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    if (this.cachedModels) return this.cachedModels;

    try {
      const probe = await this.probeAcpAuth();
      try {
        const newSession = await probe.connection.newSession({
          cwd: process.cwd(),
          mcpServers: [],
        });

        const models: ProviderModelInfo[] = [];
        const modelState = newSession.models;
        if (modelState && modelState.availableModels?.length) {
          for (const model of modelState.availableModels) {
            models.push({
              id: model.modelId,
              name: model.name,
              description: model.description ?? undefined,
              isDefault: model.modelId === modelState.currentModelId,
            });
          }
        }

        await probe.connection.closeSession?.({ sessionId: newSession.sessionId }).catch(() => {});
        this.cachedModels = models;
        return models;
      } finally {
        probe.child.kill();
      }
    } catch {
      return [];
    }
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    if (!this.authKind) {
      return { ...NO_PROVIDER_AUTH, authenticated: null, detail: "Auth is managed by the ACP agent." };
    }

    const probe = await this.probeAcpAuth().catch(() => null);
    const login = (probe?.authMethods.length ?? 0) > 0;
    const logout = Boolean(probe?.initialized.agentCapabilities?.auth?.logout);
    probe?.child.kill();
    const authenticated = await this.checkProviderAuthenticated();
    return {
      login,
      logout,
      deviceCode: false,
      authenticated,
      detail: probe ? formatAcpAuthDetail(this.info.name, authenticated) : "Could not read ACP authentication capabilities.",
    };
  }

  async startLogin(): Promise<ProviderLoginResult> {
    if (!this.authKind) return unsupportedLogin(this.id, "Auth is managed by the ACP agent.");

    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }

    const probe = await this.probeAcpAuth();
    const method = chooseAcpAuthMethod(probe.authMethods);
    if (!method) {
      probe.child.kill();
      return unsupportedLogin(this.id, "ACP agent did not advertise a login method.");
    }

    if (isTerminalAuthMethod(method)) {
      probe.child.kill();
      const args = [...this.config.args, ...(method.args ?? [])];
      const child = spawn(this.config.command, args, {
        cwd: process.cwd(),
        stdio: "ignore",
        env: { ...process.env, ...this.config.env, ...method.env },
      });
      this.authLoginProcess = child;
      child.on("exit", () => {
        if (this.authLoginProcess === child) this.authLoginProcess = null;
        this.cachedModels = null;
        void this.checkAvailability();
      });
      return {
        ok: true,
        status: "started",
        providerId: this.id,
        message: `${method.name} login started through ACP.`,
      };
    }

    const child = probe.child;
    this.authLoginProcess = child;
    void probe.connection.authenticate({ methodId: method.id })
      .catch(() => {})
      .finally(() => {
        if (this.authLoginProcess === child) this.authLoginProcess = null;
        child.kill();
        this.cachedModels = null;
        void this.checkAvailability();
      });

    return {
      ok: true,
      status: "started",
      providerId: this.id,
      message: `${method.name} login started through ACP.`,
    };
  }

  private async checkProviderAuthenticated(): Promise<boolean | null> {
    if (this.id === "codex") {
      return Boolean(process.env.OPENAI_API_KEY?.trim()) || checkCodexAuthFile();
    }
    if (this.id === "claude-code") {
      const status = await runAuthCommand(this.id, "claude", ["auth", "status"], 10_000).catch(() => null);
      return Boolean(process.env.ANTHROPIC_API_KEY?.trim()) || Boolean(status?.ok);
    }
    return null;
  }

  async logout(): Promise<ProviderLogoutResult> {
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }

    if (!this.authKind) {
      return unsupportedLogout(this.id, "Auth is managed by the ACP agent.");
    }

    const probe = await this.probeAcpAuth();
    try {
      if (!probe.initialized.agentCapabilities?.auth?.logout) {
        return unsupportedLogout(this.id, "ACP agent did not advertise logout support.");
      }
      await probe.connection.unstable_logout({});
      return {
        ok: true,
        status: "completed",
        providerId: this.id,
        message: `${this.info.name} logout completed.`,
      };
    } finally {
      probe.child.kill();
      await this.checkAvailability().catch(() => false);
    }
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = uuidv7();
    const session: ProviderSession = {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const child = spawn(this.config.command, this.config.args, {
      cwd: options.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env, ...options.env },
      shell: needsShell(this.config.command),
    });

    child.on("error", () => {}); // prevent unhandled ENOENT on Windows

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) {
        this.emitEvent({ type: "activity", sessionId, kind: "stderr", summary: text });
      }
    });

    const approvals = new Map<string, PendingApproval>();
    let capturedAgent: Agent | null = null;
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const connection = new ClientSideConnection((agent) => {
      capturedAgent = agent;
      return new JaitAcpClient(this, sessionId, approvals, options.mode);
    }, stream);

    child.once("exit", (code, signal) => {
      const current = this.sessions.get(sessionId);
      if (!current) return;
      current.session.status = current.session.status === "completed" ? "completed" : "interrupted";
      current.session.completedAt = new Date().toISOString();
      this.emitEvent({
        type: current.session.status === "completed" ? "session.completed" : "session.error",
        sessionId,
        ...(current.session.status === "completed"
          ? {}
          : { error: `ACP provider exited (${signal ?? code ?? "unknown"})` }),
      } as ProviderEvent);
      this.sessions.delete(sessionId);
    });

    let initialized: InitializeResponse;
    let newSession: Awaited<ReturnType<ClientSideConnection["newSession"]>>;
    try {
      initialized = await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "Jait", version: "0.1" },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
      });

      newSession = await connection.newSession({
        cwd: options.workingDirectory,
        mcpServers: (options.mcpServers ?? []).map(toAcpMcpServer),
      });

      if (options.mode) {
        await connection.setSessionMode({ sessionId: newSession.sessionId, modeId: options.mode }).catch(() => {});
      }
      if (options.model) {
        await connection.unstable_setSessionModel({ sessionId: newSession.sessionId, modelId: options.model }).catch(() => {});
      }
    } catch (error) {
      child.kill();
      throw error;
    }

    session.status = "running";
    const state: AcpSessionState = {
      session,
      child,
      connection,
      agent: capturedAgent ?? connection,
      acpSessionId: newSession.sessionId,
      approvals,
      initialized,
    };
    this.sessions.set(sessionId, state);
    this.emitEvent({ type: "session.started", sessionId });
    return session;
  }

  async sendTurn(sessionId: string, message: string, attachments?: string[]): Promise<void> {
    const state = this.getSession(sessionId);
    this.emitEvent({ type: "turn.started", sessionId });
    const prompt = [
      { type: "text" as const, text: message },
      ...(attachments ?? []).map((path) => ({
        type: "resource_link" as const,
        uri: `file://${path}`,
        name: path.split("/").pop() || path,
      })),
    ];

    try {
      const result = await state.connection.prompt({
        sessionId: state.acpSessionId,
        prompt,
      });
      if (result.stopReason === "cancelled") {
        this.emitEvent({ type: "session.error", sessionId, error: "Turn cancelled" });
      }
      this.emitEvent({ type: "turn.completed", sessionId });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "ACP prompt failed";
      state.session.status = "error";
      state.session.error = messageText;
      this.emitEvent({ type: "session.error", sessionId, error: messageText });
      throw error;
    }
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const state = this.getSession(sessionId);
    await state.connection.cancel({ sessionId: state.acpSessionId });
  }

  async respondToApproval(sessionId: string, requestId: string, approved: boolean): Promise<void> {
    const state = this.getSession(sessionId);
    const pending = state.approvals.get(requestId);
    if (!pending) return;
    state.approvals.delete(requestId);
    pending.resolve({
      outcome: approved
        ? { outcome: "selected", optionId: pending.allowOptionId }
        : { outcome: "selected", optionId: pending.rejectOptionId },
    });
  }

  async stopSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    await withTimeout(
      state.connection.closeSession?.({ sessionId: state.acpSessionId }) ?? Promise.resolve(),
      2_000,
    ).catch(() => {});
    state.session.status = "completed";
    state.session.completedAt = new Date().toISOString();
    state.child.kill();
    this.sessions.delete(sessionId);
    this.emitEvent({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emitEvent(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  handleSessionUpdate(sessionId: string, params: SessionNotification): void {
    const update = params.update;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          this.emitEvent({ type: "token", sessionId, content: update.content.text });
        }
        break;
      case "tool_call":
        this.emitEvent({
          type: "tool.start",
          sessionId,
          tool: update.title,
          args: update.rawInput,
          callId: update.toolCallId,
        });
        break;
      case "tool_call_update": {
        if (update.content) {
          this.emitEvent({
            type: "tool.output",
            sessionId,
            callId: update.toolCallId,
            content: stringifyToolContent(update.content),
          });
        }
        if (update.status === "completed" || update.status === "failed") {
          this.emitEvent({
            type: "tool.result",
            sessionId,
            tool: update.title ?? update.toolCallId,
            ok: update.status === "completed",
            message: stringifyUnknown(update.rawOutput ?? update.status),
            callId: update.toolCallId,
            data: update.rawOutput,
          });
        }
        break;
      }
      case "plan":
        this.emitEvent({
          type: "activity",
          sessionId,
          kind: "plan",
          summary: update.entries.map((entry) => `[${entry.status}] ${entry.content}`).join("\n"),
          payload: update.entries,
        });
        break;
      case "agent_thought_chunk":
      case "user_message_chunk":
      case "available_commands_update":
      case "current_mode_update":
      case "config_option_update":
      case "session_info_update":
      case "usage_update":
        this.emitEvent({
          type: "activity",
          sessionId,
          kind: update.sessionUpdate,
          summary: update.sessionUpdate,
          payload: update,
        });
        break;
    }
  }

  private getSession(sessionId: string): AcpSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Unknown ACP session: ${sessionId}`);
    return state;
  }

  private async probeAcpAuth(): Promise<{
    child: ChildProcess;
    connection: ClientSideConnection;
    initialized: InitializeResponse;
    authMethods: AuthMethod[];
  }> {
    const child = spawn(this.config.command, this.config.args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.config.env },
      shell: needsShell(this.config.command),
    });

    // Prevent unhandled 'error' events from crashing the process (e.g. ENOENT on Windows)
    const spawnError = new Promise<never>((_, reject) => {
      child.on("error", (err) => reject(err));
    });

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const connection = new ClientSideConnection(() => ({
      async requestPermission(): Promise<RequestPermissionResponse> {
        return { outcome: { outcome: "cancelled" } };
      },
      async sessionUpdate(): Promise<void> {},
    }), stream);

    try {
      const initialized = await Promise.race([
        connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          clientInfo: { name: "Jait", version: "0.1" },
          clientCapabilities: {
            auth: { terminal: true },
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        }),
        spawnError,
      ]);
      return { child, connection, initialized, authMethods: initialized.authMethods ?? [] };
    } catch (error) {
      child.kill();
      throw error;
    }
  }
}

/**
 * On Windows, bare command names like `npx` or `codex` resolve to `.cmd` wrappers
 * that require the shell to execute. Absolute or relative paths are real executables
 * and must NOT go through shell (cmd.exe would mangle complex arguments).
 */
function needsShell(command: string): boolean {
  return process.platform === "win32" && !isAbsolute(command) && !command.includes("/") && !command.includes("\\");
}

function chooseAcpAuthMethod(methods: AuthMethod[]): AuthMethod | null {
  return (
    methods.find(isTerminalAuthMethod) ??
    methods.find((method) => method.id === "chat-gpt") ??
    methods[0] ??
    null
  );
}

function isTerminalAuthMethod(method: AuthMethod): method is Extract<AuthMethod, { type: "terminal" }> {
  return "type" in method && method.type === "terminal";
}

function formatAcpAuthDetail(providerName: string, authenticated: boolean | null): string {
  if (authenticated === true) return `${providerName} credentials are configured. Login and logout are managed through ACP.`;
  if (authenticated === false) return `${providerName} credentials are not configured. Login and logout are managed through ACP.`;
  return `${providerName} authentication is managed through ACP.`;
}

function getCodexAuthPath(): string {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  return join(codexHome, "auth.json");
}

function readCodexAuthFile(): {
  OPENAI_API_KEY?: string | null;
  tokens?: { access_token?: string | null };
  [key: string]: unknown;
} | null {
  try {
    const authPath = getCodexAuthPath();
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

function checkCodexAuthFile(): boolean {
  const auth = readCodexAuthFile();
  if (!auth) return false;
  try {
    if (auth.OPENAI_API_KEY) return true;
    if (auth.tokens?.access_token) return true;
    return false;
  } catch {
    return false;
  }
}

function toAcpMcpServer(server: McpServerRef): McpServer {
  if (server.transport === "stdio") {
    return {
      name: server.name,
      command: server.command ?? "",
      args: server.args ?? [],
      env: Object.entries(server.env ?? {}).map(([name, value]) => ({ name, value })),
    };
  }

  if (server.transport === "http") {
    return {
      type: "http",
      name: server.name,
      url: server.url ?? "",
      headers: [],
    };
  }

  return {
    type: "sse",
    name: server.name,
    url: server.url ?? "",
    headers: [],
  };
}

function stringifyToolContent(content: unknown): string {
  if (!Array.isArray(content)) return stringifyUnknown(content);
  return content.map((item) => stringifyUnknown(item)).join("\n");
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Operation timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function loadAcpProviderConfigs(): AcpProviderConfig[] {
  const defaults: AcpProviderConfig[] = [
    {
      id: "codex",
      name: "Codex",
      description: "OpenAI Codex via Agent Client Protocol",
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      description: "Claude Code via Agent Client Protocol",
      command: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    },
    {
      id: "cursor",
      name: "Cursor",
      description: "Cursor Agent via Agent Client Protocol",
      command: "npx",
      args: ["-y", "@blowmage/cursor-agent-acp"],
      auth: false,
    },
    {
      id: "pi",
      name: "Pi",
      description: "Pi coding agent via Agent Client Protocol",
      command: "npx",
      args: ["-y", "pi-acp"],
      auth: false,
    },
    {
      id: "pi-gemini",
      name: "Pi Gemini",
      description: "Gemini-backed Pi ACP provider",
      command: "npx",
      args: ["-y", "pi-gemini-acp"],
      auth: false,
    },
    {
      id: "deepagents",
      name: "DeepAgents",
      description: "DeepAgents via Agent Client Protocol",
      command: "npx",
      args: ["-y", "deepagents-acp"],
      auth: false,
    },
  ];

  const raw = process.env.JAIT_ACP_PROVIDERS?.trim();
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as AcpProviderConfig[];
    if (!Array.isArray(parsed)) return defaults;
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.command === "string");
  } catch {
    return defaults;
  }
}
