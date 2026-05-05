import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Agent,
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
  DEVICE_PROVIDER_AUTH,
  NO_PROVIDER_AUTH,
  killChildTree as killAuthChildTree,
  runAuthCommand,
  startDeviceLoginCommand,
  unsupportedLogin,
  unsupportedLogout,
} from "./provider-auth.js";

type AcpProviderAuthKind = "codex" | "claude-code";

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
  ) {}

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const requestId = uuidv7();
    this.provider.emitEvent({
      type: "tool.approval-required",
      sessionId: this.sessionId,
      tool: params.toolCall.title ?? params.toolCall.toolCallId,
      args: params.toolCall.rawInput,
      requestId,
    });

    const allowOptionId = params.options.find((option) => option.kind.startsWith("allow"))?.optionId ?? params.options[0]?.optionId ?? "allow";
    const rejectOptionId = params.options.find((option) => option.kind.startsWith("reject"))?.optionId ?? params.options.at(-1)?.optionId ?? "reject";

    return new Promise<RequestPermissionResponse>((resolve) => {
      this.approvals.set(requestId, { allowOptionId, rejectOptionId, resolve });
    });
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

  constructor(config: AcpProviderConfig) {
    this.id = config.id;
    this.authKind = config.auth === false ? null : config.auth ?? inferAcpAuthKind(config.id);
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
      auth: this.authKind ? DEVICE_PROVIDER_AUTH : NO_PROVIDER_AUTH,
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
    return [];
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    switch (this.authKind) {
      case "codex": {
        const authenticated = !!process.env.OPENAI_API_KEY?.trim() || checkCodexAuthFile();
        return {
          ...DEVICE_PROVIDER_AUTH,
          authenticated,
          detail: authenticated
            ? "Codex CLI credentials are configured."
            : "Codex CLI is not authenticated.",
        };
      }
      case "claude-code": {
        const status = await runAuthCommand(this.id, "claude", ["auth", "status"], 10_000);
        const authenticated = !!process.env.ANTHROPIC_API_KEY?.trim() || status.ok;
        return {
          ...DEVICE_PROVIDER_AUTH,
          authenticated,
          detail: authenticated
            ? "Claude Code credentials are configured."
            : status.rawOutput ?? "Claude Code is not authenticated.",
        };
      }
      default:
        return { ...NO_PROVIDER_AUTH, authenticated: null, detail: "Auth is managed by the ACP agent." };
    }
  }

  async startLogin(): Promise<ProviderLoginResult> {
    const login = this.getLoginCommand();
    if (!login) return unsupportedLogin(this.id, "Auth is managed by the ACP agent.");

    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }

    const { result, child } = await startDeviceLoginCommand({
      providerId: this.id,
      label: login.label,
      commandLine: login.commandLine,
      args: login.args,
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

    switch (this.authKind) {
      case "codex": {
        const result = await runAuthCommand(this.id, "codex", ["logout"]);
        const cleared = result.ok ? clearCodexAuthFile() : true;
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
      case "claude-code": {
        const result = await runAuthCommand(this.id, "claude", ["auth", "logout"]);
        await this.checkAvailability().catch(() => false);
        return {
          ...result,
          message: result.ok ? "Claude Code logout completed." : result.message,
        };
      }
      default:
        return unsupportedLogout(this.id, "Auth is managed by the ACP agent.");
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
    });

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
      return new JaitAcpClient(this, sessionId, approvals);
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

    const initialized = await connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "Jait", version: "0.1" },
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });

    const newSession = await connection.newSession({
      cwd: options.workingDirectory,
      mcpServers: (options.mcpServers ?? []).map(toAcpMcpServer),
    });

    if (options.mode) {
      await connection.setSessionMode({ sessionId: newSession.sessionId, modeId: options.mode }).catch(() => {});
    }
    if (options.model) {
      await connection.unstable_setSessionModel({ sessionId: newSession.sessionId, modelId: options.model }).catch(() => {});
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
    await state.connection.closeSession?.({ sessionId: state.acpSessionId }).catch(() => {});
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

  private getLoginCommand(): { label: string; commandLine: string; args: string[] } | null {
    switch (this.authKind) {
      case "codex":
        return { label: "Codex", commandLine: "codex", args: ["login", "--device-auth"] };
      case "claude-code":
        return { label: "Claude Code", commandLine: "claude", args: ["auth", "login", "--claudeai"] };
      default:
        return null;
    }
  }
}

function inferAcpAuthKind(id: ProviderId): AcpProviderAuthKind | null {
  if (id === "codex") return "codex";
  if (id === "claude-code") return "claude-code";
  return null;
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

function clearCodexAuthFile(): boolean {
  const auth = readCodexAuthFile();
  if (!auth) return true;

  delete auth.OPENAI_API_KEY;
  delete auth.tokens;

  const remaining = Object.entries(auth).filter(([, value]) => value !== undefined && value !== null);
  try {
    if (remaining.length === 0) {
      unlinkSync(getCodexAuthPath());
    } else {
      writeFileSync(getCodexAuthPath(), `${JSON.stringify(Object.fromEntries(remaining), null, 2)}\n`, "utf-8");
    }
    return true;
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
