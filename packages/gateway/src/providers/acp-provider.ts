import { spawn, execFile, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import { existsSync, readFileSync, rmSync } from "node:fs";
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
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type InitializeResponse,
  type KillTerminalRequest,
  type KillTerminalResponse,
  type McpServer,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionConfigOption,
  type SessionNotification,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
} from "@agentclientprotocol/sdk";
import { uuidv7 } from "../db/uuidv7.js";
import { AcpTerminal } from "./acp-terminal.js";
import { isPiBasedProvider, provisionPiMcp } from "./pi-mcp-provision.js";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";
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
  startDeviceLoginCommand,
  unsupportedLogin,
  unsupportedLogout,
} from "./provider-auth.js";
import {
  JAIT_CORE_MCP_SERVER_NAME,
  JAIT_DEFERRED_MCP_SERVER_NAME,
  mergeJaitCodexConfig,
} from "./jait-mcp.js";

type AcpProviderAuthKind = "acp";

const execFileAsync = promisify(execFile);

const ACP_PROBE_TIMEOUT_MS = process.platform === "win32" ? 30_000 : 20_000;
const ACP_PROBE_CLOSE_TIMEOUT_MS = 1_000;
/** Timeout for the `<command> --version` availability probe. */
const AVAILABILITY_PROBE_TIMEOUT_MS = 5_000;
/** How long a computed auth status stays fresh before re-probing. */
const AUTH_STATUS_TTL_MS = 5 * 60_000;
const REPLAYABLE_EVENT_TTL_MS = 30_000;
const REPLAYABLE_EVENT_LIMIT = 20;

function flattenSelectOptions(config: Extract<SessionConfigOption, { type: "select" }>) {
  return config.options.flatMap((option) =>
    "options" in option ? option.options : [option]
  );
}

function findModelConfig(configOptions: SessionConfigOption[] | null | undefined): {
  currentModelId: string | null;
  models: ProviderModelInfo[];
} | null {
  const config = configOptions?.find((option) =>
    option.type === "select" && (option.category === "model" || option.id === "model")
  );
  if (!config || config.type !== "select") return null;

  const models = flattenSelectOptions(config).flatMap((option) => {
    const id = option.value.trim();
    if (!id) return [];
    const name = option.name.trim() || id;
    return [{
      id,
      name,
      ...(option.description?.trim() ? { description: option.description.trim() } : {}),
    }];
  });
  if (models.length === 0) return null;

  const currentModelId = typeof config.currentValue === "string"
    ? config.currentValue.trim() || null
    : null;
  return { currentModelId, models };
}

function findReasoningEffortConfig(configOptions: SessionConfigOption[] | null | undefined): {
  configId: string;
  efforts: NonNullable<ProviderModelInfo["supportedReasoningEfforts"]>;
} | null {
  const config = configOptions?.find((option) =>
    option.type === "select" && (
      option.category === "thought_level"
      || option.id === "reasoning_effort"
      || option.id === "reasoningEffort"
      || option.id === "effort"
      || option.id === "thought_level"
    )
  );
  if (!config || config.type !== "select") return null;

  const efforts = flattenSelectOptions(config).flatMap((option) => {
    const reasoningEffort = option.value.trim();
    if (!reasoningEffort) return [];
    return [{
      reasoningEffort,
      ...(option.description?.trim() ? { description: option.description.trim() } : {}),
    }];
  });
  return efforts.length > 0 ? { configId: config.id, efforts } : null;
}

const CLAUDE_FALLBACK_EFFORTS = ["low", "medium", "high", "xhigh", "max"]
  .map((reasoningEffort) => ({ reasoningEffort }));
const CODEX_FALLBACK_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"]
  .map((reasoningEffort) => ({ reasoningEffort }));
const CLAUDE_CODE_FALLBACK_MODELS: ProviderModelInfo[] = [
  { id: "default", name: "Default", description: "Claude Code default model selection", isDefault: true },
  { id: "fable", name: "Fable", description: "Claude Fable alias for the top-tier Mythos-class model" },
  { id: "sonnet", name: "Sonnet", description: "Claude Sonnet alias for day-to-day coding" },
  { id: "opus", name: "Opus", description: "Claude Opus alias for the most capable model" },
  { id: "haiku", name: "Haiku", description: "Claude Haiku alias for faster lightweight tasks" },
  { id: "opusplan", name: "Opus Plan", description: "Planning-focused Claude alias" },
].map((model) => ({
  ...model,
  reasoningEffortSupported: true,
  supportedReasoningEfforts: CLAUDE_FALLBACK_EFFORTS,
}));
const CODEX_FALLBACK_MODELS: ProviderModelInfo[] = [
  { id: "gpt-5-codex", name: "GPT-5 Codex", description: "Codex default coding model", isDefault: true },
].map((model) => ({
  ...model,
  reasoningEffortSupported: true,
  supportedReasoningEfforts: CODEX_FALLBACK_EFFORTS,
}));

export interface AcpProviderConfig {
  id: ProviderId;
  providerType?: ProviderId;
  ownerUserId?: string;
  executionNodeId?: string;
  name: string;
  description: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  modes?: RuntimeMode[];
  auth?: AcpProviderAuthKind | false;
  registry?: AcpProviderRegistryMetadata;
}

export interface AcpProviderRegistryMetadata {
  id: string;
  version: string;
  distribution: "binary" | "npx" | "uvx";
  icon?: string;
  website?: string;
  repository?: string;
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
  client: JaitAcpClient;
  acpSessionId: string;
  approvals: Map<string, PendingApproval>;
  initialized: InitializeResponse;
  /**
   * Accumulated raw tool-call objects keyed by toolCallId. ACP lets agents send
   * a skeleton `tool_call` and progressively enrich it via `tool_call_update`
   * (rawInput, locations, content, title). We merge those frames here so the
   * tool card reflects the full picture regardless of an agent's streaming
   * cadence (Codex front-loads everything; Claude Code streams it in updates).
   */
  toolCalls: Map<string, Record<string, unknown>>;
  /** Removes the per-session pi MCP config + wrapper when the session ends. */
  piProvisionCleanup?: () => void;
}

class JaitAcpClient implements Client {
  /** Terminals created via `createTerminal`, keyed by the id we hand back to the agent. */
  readonly terminals = new Map<string, AcpTerminal>();
  readonly trackedTerminalIds = new Set<string>();

  constructor(
    private readonly provider: AcpProvider,
    private readonly sessionId: string,
    private readonly approvals: Map<string, PendingApproval>,
    private readonly runtimeMode?: string,
  ) {}

  private requireTerminal(terminalId: string): AcpTerminal {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) throw new Error(`Unknown terminal: ${terminalId}`);
    return terminal;
  }

  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const terminalId = uuidv7();
    this.terminals.set(terminalId, new AcpTerminal({
      command: params.command,
      args: params.args,
      cwd: params.cwd,
      env: params.env,
      outputByteLimit: params.outputByteLimit,
    }));
    return { terminalId };
  }

  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    return this.requireTerminal(params.terminalId).currentOutput();
  }

  async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    return this.requireTerminal(params.terminalId).waitForExit();
  }

  async killTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse> {
    this.requireTerminal(params.terminalId).kill();
    return {};
  }

  async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (terminal) {
      terminal.release();
      this.terminals.delete(params.terminalId);
    }
    return {};
  }

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
  readonly providerType: ProviderId;
  readonly ownerUserId?: string;
  readonly executionNodeId?: string;
  readonly info: ProviderInfo;

  private readonly config: Required<Omit<AcpProviderConfig, "env" | "providerType" | "ownerUserId" | "executionNodeId" | "registry">> & { env?: Record<string, string>; registry?: AcpProviderRegistryMetadata };
  private readonly authKind: AcpProviderAuthKind | null;
  private readonly sessions = new Map<string, AcpSessionState>();
  private readonly emitter = new EventEmitter();
  private replayableEvents: Array<{ event: ProviderEvent; emittedAt: number }> = [];
  private authLoginProcess: ChildProcess | null = null;
  private cachedModels: ProviderModelInfo[] | null = null;
  private cachedAuthStatus: { status: ProviderAuthStatus; expiresAt: number } | null = null;
  private authProbeInFlight: Promise<ProviderAuthStatus> | null = null;
  private activeLoginAuthProbeInFlight: Promise<ProviderAuthStatus> | null = null;
  private authenticatedHint: boolean | null = null;

  constructor(config: AcpProviderConfig) {
    const providerType = config.providerType ?? config.id;
    // Applied here, not in loadAcpProviderConfigs: codex/claude-code definitions
    // normally come from the ACP registry, and mergeFallbackDefinitions() lets the
    // registry entry win — an overlay attached to the local defaults would be
    // silently dropped. The constructor is the one place every construction path
    // (registry, JAIT_ACP_PROVIDERS fallback, remote accounts) goes through, which
    // is why CODEX_CONFIG is merged here too.
    const omnirouteEnv = omnirouteAcpEnv(providerType);
    const baseEnv = omnirouteEnv ? { ...config.env, ...omnirouteEnv } : config.env;
    const env = providerType === "codex"
      ? {
          ...baseEnv,
          CODEX_CONFIG: mergeJaitCodexConfig(config.env?.["CODEX_CONFIG"] ?? process.env.CODEX_CONFIG),
        }
      : baseEnv;
    this.id = config.id;
    this.providerType = providerType;
    this.ownerUserId = config.ownerUserId;
    this.executionNodeId = config.executionNodeId;
    this.authKind = config.auth === false ? null : "acp";
    this.config = {
      ...config,
      env,
      args: config.args ?? [],
      modes: config.modes ?? ["full-access", "supervised"],
      auth: config.auth ?? false,
    };
    this.info = {
      id: config.id,
      providerType: this.providerType,
      name: config.name,
      description: config.description,
      available: false,
      modes: this.config.modes,
      auth: this.authKind ? { login: true, logout: false, deviceCode: false } : NO_PROVIDER_AUTH,
    };
  }

  async checkAvailability(): Promise<boolean> {
    if (this.executionNodeId && this.executionNodeId !== "gateway") {
      this.info.available = false;
      this.info.unavailableReason = `Available only on device ${this.executionNodeId}`;
      return false;
    }
    const command = this.config.command;
    // Async probe so we never block the event loop (this runs for every
    // provider on each /api/providers refresh). A non-zero exit still counts
    // as "available" — only a failure to spawn the binary (ENOENT) means it's
    // missing. npx is always treated as available (it resolves on demand).
    try {
      await execFileAsync(command, ["--version"], {
        timeout: AVAILABILITY_PROBE_TIMEOUT_MS,
        env: { ...process.env, ...this.config.env },
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" && command !== "npx") {
        this.info.available = false;
        this.info.unavailableReason = `ACP provider command not found: ${command}`;
        return false;
      }
    }

    this.info.available = true;
    this.info.unavailableReason = undefined;
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    // An empty result is never cached: it would pin the picker to "no models"
    // until the gateway restarts, even after a successful login.
    if (this.cachedModels?.length) return this.cachedModels;

    const probe = await this.probeAcpAuth();
    try {
      const newSession = await withTimeout(
        probe.connection.newSession({
          cwd: process.cwd(),
          mcpServers: [],
        }),
        ACP_PROBE_TIMEOUT_MS,
      );

      const models: ProviderModelInfo[] = [];
      const modelState = (newSession as typeof newSession & {
        models?: {
          currentModelId: string;
          availableModels?: Array<{ modelId: string; name: string; description?: string | null }>;
        };
      }).models;
      const effortConfig = findReasoningEffortConfig(newSession.configOptions);
      const modelConfig = effortConfig ? findModelConfig(newSession.configOptions) : null;
      if (modelConfig && effortConfig) {
        for (const model of modelConfig.models) {
          models.push({
            ...model,
            isDefault: model.id === modelConfig.currentModelId,
            reasoningEffortSupported: true,
            supportedReasoningEfforts: effortConfig.efforts,
          });
        }
      } else if (modelState && modelState.availableModels?.length) {
        for (const model of modelState.availableModels) {
          models.push({
            id: model.modelId,
            name: model.name,
            description: model.description ?? undefined,
            isDefault: model.modelId === modelState.currentModelId,
            ...(effortConfig ? {
              reasoningEffortSupported: true,
              supportedReasoningEfforts: effortConfig.efforts,
            } : {}),
          });
        }
      }

      if (probe.connection.closeSession) {
        await withTimeout(
          probe.connection.closeSession({ sessionId: newSession.sessionId }),
          ACP_PROBE_CLOSE_TIMEOUT_MS,
        ).catch(() => {});
      }
      // Fallbacks are keyed by provider *type*: `this.id` is the account id
      // ("claude-code-01J…") for per-account providers, which matched nothing
      // and left the picker empty whenever the agent advertised no models.
      this.cachedModels = models.length > 0
        ? models
        : getAcpFallbackModels(this.providerType);
      return this.cachedModels;
    } catch (error) {
      const message = extractErrorMessage(error, "ACP model discovery failed");
      if (isAuthenticationRequiredMessage(message) && this.hasLocalProviderCredential()) {
        throw new Error(
          `${this.info.name} is logged in, but the provider rejected model discovery: ${message}. Check provider usage limits or account access.`,
        );
      }
      // Discovery is best-effort: as long as this is not an auth problem, the
      // CLI's well-known models are a better answer than an empty picker.
      if (!isAuthenticationRequiredMessage(message)) {
        const fallbackModels = getAcpFallbackModels(this.providerType);
        if (fallbackModels.length > 0) {
          this.cachedModels = fallbackModels;
          return this.cachedModels;
        }
      }
      throw error instanceof Error ? error : new Error(message);
    } finally {
      probe.child.kill();
    }
  }

  async getAuthStatus(): Promise<ProviderAuthStatus> {
    if (!this.authKind) {
      return { ...NO_PROVIDER_AUTH, authenticated: null, detail: "Auth is managed by the ACP agent." };
    }

    if (this.authLoginProcess) {
      if (this.activeLoginAuthProbeInFlight) return this.activeLoginAuthProbeInFlight;
      const activeProbe = this._computeAuthStatus().finally(() => {
        if (this.activeLoginAuthProbeInFlight === activeProbe) {
          this.activeLoginAuthProbeInFlight = null;
        }
      });
      this.activeLoginAuthProbeInFlight = activeProbe;
      return activeProbe;
    }

    const now = Date.now();
    if (this.cachedAuthStatus && now < this.cachedAuthStatus.expiresAt) {
      return this.cachedAuthStatus.status;
    }

    // Deduplicate concurrent callers — only one probe at a time.
    if (this.authProbeInFlight) return this.authProbeInFlight;

    this.authProbeInFlight = this._computeAuthStatus().finally(() => {
      this.authProbeInFlight = null;
    });
    return this.authProbeInFlight;
  }

  private async _computeAuthStatus(): Promise<ProviderAuthStatus> {
    // Claude Code supports env-var API-key auth outside the CLI credential store.
    if (this.providerType === "claude-code" && this.hasEnvironmentCredential("ANTHROPIC_API_KEY")) {
      const cliAuthenticated = await this.getProviderCliAuthenticated();
      const logout = cliAuthenticated === true;
      const status: ProviderAuthStatus = {
        login: false,
        logout,
        deviceCode: false,
        authenticated: true,
        detail: logout
          ? "Authenticated via ANTHROPIC_API_KEY environment variable and local Claude Code credentials. Logout clears the local Claude Code credentials."
          : "Authenticated via ANTHROPIC_API_KEY environment variable. Manage the key directly to change access.",
      };
      this.cachedAuthStatus = { status, expiresAt: Date.now() + AUTH_STATUS_TTL_MS };
      return status;
    }

    const providerCliAuthenticated = await this.getProviderCliAuthenticated();
    const probe = await this.probeAcpAuth().catch(() => null);
    const login = (probe?.authMethods.length ?? 0) > 0;
    const acpLogout = Boolean(probe?.initialized.agentCapabilities?.auth?.logout);
    probe?.child.kill();
    const authenticated = this.providerType === "codex"
      ? await this.checkProviderAuthenticated()
      : providerCliAuthenticated ?? await this.checkProviderAuthenticated() ?? this.authenticatedHint;
    // Only offer logout when authenticated via a revocable credential.
    const logout = this.providerType === "codex" ? (providerCliAuthenticated === true || this.hasCodexAuthFile()) : authenticated === true && (acpLogout || this.hasProviderCliLogout());
    const result: ProviderAuthStatus = {
      login,
      logout,
      deviceCode: false,
      authenticated,
      detail: probe
        ? formatAcpAuthDetail(this.info.name, authenticated)
        : formatCliAuthDetail(this.info.name, authenticated, logout),
    };
    this.cachedAuthStatus = { status: result, expiresAt: Date.now() + AUTH_STATUS_TTL_MS };
    return result;
  }

  async startLogin(): Promise<ProviderLoginResult> {
    if (!this.authKind) return unsupportedLogin(this.id, "Auth is managed by the ACP agent.");

    this.cachedAuthStatus = null;
    this.activeLoginAuthProbeInFlight = null;
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }

    if (this.providerType === "codex") {
      return this.startCodexDeviceLogin("ChatGPT");
    }

    const probe = await this.probeAcpAuth();
    const method = chooseAcpAuthMethod(probe.authMethods);
    if (!method) {
      probe.child.kill();
      return unsupportedLogin(this.id, "ACP agent did not advertise a login method.");
    }

    if (isTerminalAuthMethod(method)) {
      probe.child.kill();
      const { result, child } = await startDeviceLoginCommand({
        providerId: this.id,
        label: method.name,
        commandLine: this.config.command,
        args: [...this.config.args, ...(method.args ?? [])],
        env: { ...this.config.env, ...method.env },
      });
      if (child) {
        this.authLoginProcess = child;
        child.on("exit", (code) => {
          if (this.authLoginProcess === child) this.authLoginProcess = null;
          if (code === 0) this.authenticatedHint = true;
          this.cachedModels = null;
          this.cachedAuthStatus = null; // invalidate so next /api/providers reflects new state
          void this.checkAvailability();
        });
      } else {
        if (result.ok && result.status === "completed") this.authenticatedHint = true;
        this.cachedModels = null;
        this.cachedAuthStatus = null;
        void this.checkAvailability();
      }
      return result;
    }

    const child = probe.child;
    this.authLoginProcess = child;
    void probe.connection.authenticate({ methodId: method.id })
      .then(() => {
        this.authenticatedHint = true;
      })
      .catch(() => {})
      .finally(() => {
        if (this.authLoginProcess === child) this.authLoginProcess = null;
        child.kill();
        this.cachedModels = null;
        this.cachedAuthStatus = null; // invalidate so next /api/providers reflects new state
        void this.checkAvailability();
      });

    return {
      ok: true,
      status: "started",
      providerId: this.id,
      message: `${method.name} login started through ACP.`,
    };
  }

  private async startCodexDeviceLogin(label: string): Promise<ProviderLoginResult> {
    const { result, child } = await startDeviceLoginCommand({
      providerId: this.id,
      label,
      commandLine: this.config.env?.JAIT_CODEX_LOGIN_COMMAND ?? process.env.JAIT_CODEX_LOGIN_COMMAND ?? "codex",
      args: ["login", "--device-auth"],
      env: this.config.env,
    });
    if (child) {
      this.authLoginProcess = child;
      child.on("exit", () => {
        if (this.authLoginProcess === child) this.authLoginProcess = null;
        this.cachedModels = null;
        this.cachedAuthStatus = null; // invalidate so next /api/providers reflects new state
        void this.checkAvailability();
      });
    } else {
      this.cachedModels = null;
      this.cachedAuthStatus = null;
      void this.checkAvailability();
    }
    return result;
  }

  private async checkProviderAuthenticated(): Promise<boolean | null> {
    if (this.providerType === "codex") {
      const cliAuthenticated = await this.getProviderCliAuthenticated();
      return cliAuthenticated === true || checkCodexAuthFile(this.config.env);
    }
    if (this.providerType === "claude-code") {
      const status = await runAuthCommand(this.id, "claude", ["auth", "status"], 10_000, this.config.env).catch(() => null);
      return this.hasEnvironmentCredential("ANTHROPIC_API_KEY") || Boolean(status?.ok);
    }
    return null;
  }

  private async getProviderCliAuthenticated(): Promise<boolean | null> {
    if (this.providerType === "codex") {
      const status = await runAuthCommand(this.id, "codex", ["login", "status"], 10_000, this.config.env).catch(() => null);
      return status ? status.ok : null;
    }
    if (this.providerType === "claude-code") {
      const status = await runAuthCommand(this.id, "claude", ["auth", "status"], 10_000, this.config.env).catch(() => null);
      return status ? status.ok : null;
    }
    return null;
  }

  private hasProviderCliLogout(): boolean {
    return this.providerType === "codex" || this.providerType === "claude-code";
  }

  /**
   * Returns true when Codex has local auth.json credentials that can be cleared
   * from the UI.
   */
  private hasCodexAuthFile(): boolean {
    if (this.providerType !== "codex") return false;
    return checkCodexAuthFile(this.config.env);
  }

  private hasLocalProviderCredential(): boolean {
    if (this.providerType === "codex") return checkCodexAuthFile(this.config.env);
    if (this.providerType === "claude-code") return this.hasEnvironmentCredential("ANTHROPIC_API_KEY");
    return this.cachedAuthStatus?.status.authenticated === true;
  }

  private hasEnvironmentCredential(name: string): boolean {
    const configuredValue = this.config.env?.[name];
    if (this.ownerUserId) return Boolean(configuredValue?.trim());
    return Boolean((configuredValue ?? process.env[name])?.trim());
  }

  sendLoginInput(input: string): void {
    if (this.authLoginProcess?.stdin?.writable) {
      this.authLoginProcess.stdin.write(`${input.trim()}\n`);
    }
  }

  async logout(): Promise<ProviderLogoutResult> {
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }

    if (!this.authKind) {
      return unsupportedLogout(this.id, "Auth is managed by the ACP agent.");
    }

    const probe = await this.probeAcpAuth().catch(() => null);
    try {
      if (probe?.initialized.agentCapabilities?.auth?.logout) {
        await probe.connection.logout({}).catch(() => {});
      }
      // Always delete the local Codex auth file for Codex providers — this is the
      // source of truth that checkProviderAuthenticated() reads, regardless of whether
      // the ACP logout RPC succeeded or even ran.
      if (this.providerType === "codex") {
        await runAuthCommand(this.id, "codex", ["logout"], 20_000, this.config.env).catch(() => null);
        removeCodexAuthFiles(this.config.env);
        this.cachedAuthStatus = null; // invalidate cache
        return {
          ok: true,
          status: "completed",
          providerId: this.id,
          message: `${this.info.name} logout completed.`,
        };
      }
      if (!probe) {
        if (this.providerType === "claude-code") {
          const result = await runAuthCommand(this.id, "claude", ["auth", "logout"], 20_000, this.config.env);
          this.cachedAuthStatus = null;
          return result.ok
            ? {
                ok: true,
                status: "completed",
                providerId: this.id,
                message: `${this.info.name} logout completed.`,
                rawOutput: result.rawOutput,
              }
            : result;
        }
        return unsupportedLogout(this.id, "Could not connect to ACP agent.");
      }
      if (!probe.initialized.agentCapabilities?.auth?.logout) {
        if (this.providerType === "claude-code") {
          const result = await runAuthCommand(this.id, "claude", ["auth", "logout"], 20_000, this.config.env);
          this.cachedAuthStatus = null;
          return result.ok
            ? {
                ok: true,
                status: "completed",
                providerId: this.id,
                message: `${this.info.name} logout completed.`,
                rawOutput: result.rawOutput,
              }
            : result;
        }
        return unsupportedLogout(this.id, "ACP agent did not advertise logout support.");
      }
      this.authenticatedHint = false;
      this.cachedAuthStatus = null;
      return {
        ok: true,
        status: "completed",
        providerId: this.id,
        message: `${this.info.name} logout completed.`,
      };
    } finally {
      probe?.child.kill();
      await this.checkAvailability().catch(() => false);
    }
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    if (this.executionNodeId && this.executionNodeId !== "gateway") {
      throw new Error(`Provider account ${this.id} must run on device ${this.executionNodeId}`);
    }
    const sessionId = uuidv7();
    const session: ProviderSession = {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "starting",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };

    const env = { ...process.env, ...this.config.env, ...options.env };
    let piProvisionCleanup: (() => void) | undefined;
    // pi-acp stores the ACP mcpServers but never wires them through to pi, and
    // pi needs the pi-mcp-adapter extension to expose MCP tools. Inject a
    // per-session `--mcp-config` so pi can reach Jait's MCP servers.
    if (isPiBasedProvider(this.providerType)) {
      const provision = provisionPiMcp(this.providerType, options.mcpServers, {
        sessionId,
        realPiCommand: env["PI_ACP_PI_COMMAND"] ?? "pi",
      });
      if (provision) {
        Object.assign(env, provision.env);
        piProvisionCleanup = provision.cleanup;
      }
    }

    const child = spawn(this.config.command, this.config.args, {
      cwd: options.workingDirectory,
      stdio: ["pipe", "pipe", "pipe"],
      env,
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
    const client = new JaitAcpClient(this, sessionId, approvals, options.mode);
    const stream = ndJsonStream(
      Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
    );
    const connection = new ClientSideConnection((agent) => {
      capturedAgent = agent;
      return client;
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
      current.piProvisionCleanup?.();
    });

    let initialized: InitializeResponse;
    let newSession: Awaited<ReturnType<ClientSideConnection["newSession"]>>;
    try {
      initialized = await connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: "Jait", version: "0.1" },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          // Backed by JaitAcpClient's createTerminal/terminalOutput/waitForTerminalExit/
          // killTerminal/releaseTerminal so agents delegate shell execution to Jait
          // instead of spawning their own subprocess — without this, commands the
          // agent runs "in the background" finish invisibly to Jait and it can
          // never wake the agent back up when they complete.
          terminal: true,
        },
      });

      newSession = await connection.newSession({
        cwd: options.workingDirectory,
        mcpServers: (options.mcpServers ?? []).map(toAcpMcpServer),
      });

      // These calls can legitimately fail — not every ACP agent implements
      // `session/set_mode` or the unstable set-model RPC, and `options.mode`
      // ("full-access"/"supervised") is Jait's own vocabulary rather than a
      // universal ACP modeId, so an agent may reject it outright. Swallowing
      // the error used to leave zero trace: the agent would silently keep
      // running on its own default mode/model with no way to tell from the
      // outside why the requested one "didn't stick". Surface it as an
      // activity event instead so it shows up like any other provider issue.
      if (options.mode) {
        await connection.setSessionMode({ sessionId: newSession.sessionId, modeId: options.mode }).catch((err) => {
          this.emitEvent({
            type: "activity",
            sessionId,
            kind: "stderr",
            summary: `${this.info.name} did not accept mode "${options.mode}": ${extractErrorMessage(err, "unknown error")}`,
          });
        });
      }
      if (options.model) {
        // Model selection is a stable session config option in current ACP.
        // The model id comes from the same agent's advertised config options.
        await connection.setSessionConfigOption({
          sessionId: newSession.sessionId,
          configId: "model",
          value: options.model,
        }).catch((err) => {
          this.emitEvent({
            type: "activity",
            sessionId,
            kind: "stderr",
            summary: `${this.info.name} did not accept model "${options.model}": ${extractErrorMessage(err, "unknown error")}`,
          });
        });
      }
      if (options.reasoningEffort) {
        const effortConfig = findReasoningEffortConfig(newSession.configOptions);
        if (effortConfig) {
          await connection.setSessionConfigOption({
            sessionId: newSession.sessionId,
            configId: effortConfig.configId,
            value: options.reasoningEffort,
          }).catch((err) => {
            this.emitEvent({
              type: "activity",
              sessionId,
              kind: "stderr",
              summary: `${this.info.name} did not accept reasoning effort "${options.reasoningEffort}": ${extractErrorMessage(err, "unknown error")}`,
            });
          });
        } else {
          this.emitEvent({
            type: "activity",
            sessionId,
            kind: "stderr",
            summary: `${this.info.name} did not advertise a reasoning-effort setting for this session.`,
          });
        }
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
      client,
      acpSessionId: newSession.sessionId,
      approvals,
      initialized,
      toolCalls: new Map(),
      piProvisionCleanup,
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
      await this.trackDanglingTerminals(state);
      this.emitEvent({ type: "turn.completed", sessionId });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "ACP prompt failed";
      state.session.status = "error";
      state.session.error = messageText;
      this.emitEvent({ type: "session.error", sessionId, error: messageText });
      throw error;
    }
  }

  /**
   * Hand any terminal still running when the agent's turn ends off to
   * `backgroundCommandMonitor`, so the same completion → resume flow used for
   * Jait's native `terminal.run` "background" mode also wakes the agent back
   * up here (the terminal.run OSC-marker watcher never sees these commands —
   * they're spawned directly for the agent's `terminal/create` requests, not
   * run inside Jait's own PTY).
   */
  private async trackDanglingTerminals(state: AcpSessionState): Promise<void> {
    // SDK 1.3 dispatches inbound client requests concurrently. Give any
    // terminal/create request that preceded the prompt response one event-loop
    // turn to populate the terminal map before handing background work off.
    await new Promise<void>((resolvePendingRequests) => setImmediate(resolvePendingRequests));
    const threadId = state.session.threadId;
    for (const [terminalId, terminal] of state.client.terminals) {
      if (!terminal.isRunning || state.client.trackedTerminalIds.has(terminalId)) continue;
      state.client.trackedTerminalIds.add(terminalId);
      backgroundCommandMonitor.trackExternal({
        sessionId: threadId,
        terminalId,
        command: terminal.command,
        startedAt: terminal.startedAt,
        exitPromise: terminal.waitForCompletion(),
      });
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

  async dispose(): Promise<void> {
    if (this.authLoginProcess) {
      killAuthChildTree(this.authLoginProcess);
      this.authLoginProcess = null;
    }
    await Promise.all([...this.sessions.keys()].map((sessionId) => this.stopSession(sessionId)));
    this.emitter.removeAllListeners();
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
    state.piProvisionCleanup?.();
    this.emitEvent({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    this.pruneReplayableEvents();
    for (const item of this.replayableEvents) {
      handler(item.event);
    }
    return () => this.emitter.off("event", handler);
  }

  emitEvent(event: ProviderEvent): void {
    if (isReplayableStartupEvent(event)) {
      this.replayableEvents.push({ event, emittedAt: Date.now() });
      this.pruneReplayableEvents();
    }
    this.emitter.emit("event", event);
  }

  private pruneReplayableEvents(): void {
    const cutoff = Date.now() - REPLAYABLE_EVENT_TTL_MS;
    this.replayableEvents = this.replayableEvents
      .filter((item) => item.emittedAt >= cutoff)
      .slice(-REPLAYABLE_EVENT_LIMIT);
  }

  handleSessionUpdate(sessionId: string, params: SessionNotification): void {
    const update = params.update;
    if (isTransientJaitMcpStartupCancellation(update)) return;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content.type === "text") {
          this.emitEvent({ type: "token", sessionId, content: update.content.text });
        }
        break;
      case "tool_call": {
        const merged = this.mergeToolCall(sessionId, update);
        this.emitEvent({
          type: "tool.start",
          sessionId,
          tool: getAcpToolName(merged),
          args: getAcpToolArgs(merged),
          callId: update.toolCallId,
        });
        if (readUpdateStatus(update) === "failed") {
          this.emitEvent({
            type: "tool.result",
            sessionId,
            tool: getAcpToolName(merged),
            ok: false,
            message: readUpdateMessage(update) ?? "Tool call failed",
            callId: update.toolCallId,
          });
        }
        break;
      }
      case "tool_call_update": {
        const merged = this.mergeToolCall(sessionId, update);
        // Re-emit an enriched tool.start whenever an update streams in new
        // identity/argument metadata. The web merges by callId (upgrading the
        // existing card), so this fills in the file path / diff for agents that
        // defer that data to updates instead of the initial tool_call.
        if (hasToolCallMetadata(update)) {
          this.emitEvent({
            type: "tool.start",
            sessionId,
            tool: getAcpToolName(merged),
            args: getAcpToolArgs(merged),
            callId: update.toolCallId,
          });
        }
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
            tool: getAcpToolName(merged),
            ok: update.status === "completed",
            message: stringifyToolContent(update.rawOutput ?? update.status),
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
      case "agent_thought_chunk": {
        // Reasoning is streamed as `agent_thought_chunk`. Forward the actual
        // text so the web UI renders the collapsible "Thinking…" block. Without
        // this the live stream shows no feedback while the agent reasons, which
        // makes an in-progress tool card look stuck until the next token/tool.
        const thinking = getAcpContentText(update.content);
        if (thinking) {
          this.emitEvent({ type: "thinking", sessionId, content: thinking });
        }
        break;
      }
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

  /**
   * Merge a `tool_call` / `tool_call_update` frame into the accumulated raw
   * object for that toolCallId and return the merged view. Per the ACP spec,
   * `content`/`locations` replace their collection while scalar fields update,
   * so we overwrite any field the frame actually carries (skipping null/absent).
   * Returns the raw update itself if the session state isn't tracked yet.
   */
  private mergeToolCall(sessionId: string, update: Record<string, unknown>): Record<string, unknown> {
    const store = this.sessions.get(sessionId)?.toolCalls;
    const toolCallId = typeof update["toolCallId"] === "string" ? update["toolCallId"] : null;
    if (!store || !toolCallId) return update;

    const merged = store.get(toolCallId) ?? {};
    for (const [key, value] of Object.entries(update)) {
      if (value !== undefined && value !== null) merged[key] = value;
    }
    store.set(toolCallId, merged);
    return merged;
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
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`ACP auth probe timed out after ${ACP_PROBE_TIMEOUT_MS / 1000}s`)), ACP_PROBE_TIMEOUT_MS)
        ),
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

function formatCliAuthDetail(providerName: string, authenticated: boolean | null, logout: boolean): string {
  if (authenticated === true && logout) return `${providerName} credentials are configured. Logout is available through the provider CLI.`;
  if (authenticated === true) return `${providerName} credentials are configured, but Jait could not find a logout method.`;
  if (authenticated === false) return `${providerName} credentials are not configured.`;
  return `Could not read ${providerName} authentication capabilities.`;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function isAuthenticationRequiredMessage(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return lower === "authentication required"
    || lower === "not authenticated"
    || lower.includes("not logged in")
    || lower.includes("login required")
    || lower.includes("credentials are not configured");
}

function getAcpFallbackModels(providerId: ProviderId): ProviderModelInfo[] {
  if (providerId === "codex") return CODEX_FALLBACK_MODELS;
  if (providerId === "claude-code") return CLAUDE_CODE_FALLBACK_MODELS;
  return [];
}

function getCodexAuthPaths(env?: Record<string, string>): string[] {
  const codexHome = env?.CODEX_HOME ?? process.env.CODEX_HOME;
  if (codexHome) return [join(codexHome, "auth.json")];
  return [
    join(homedir(), ".codex", "auth.json"),
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".codex", "auth.json") : undefined,
    process.env.HOME ? join(process.env.HOME, ".codex", "auth.json") : undefined,
  ].filter((path, index, paths): path is string => Boolean(path) && paths.indexOf(path) === index);
}

function readCodexAuthFile(env?: Record<string, string>): {
  OPENAI_API_KEY?: string | null;
  tokens?: { access_token?: string | null };
  [key: string]: unknown;
} | null {
  for (const authPath of getCodexAuthPaths(env)) {
    try {
      if (!existsSync(authPath)) continue;
      const raw = readFileSync(authPath, "utf-8");
      return JSON.parse(raw) as {
        OPENAI_API_KEY?: string | null;
        tokens?: { access_token?: string | null };
        [key: string]: unknown;
      };
    } catch {
      continue;
    }
  }
  return null;
}

function checkCodexAuthFile(env?: Record<string, string>): boolean {
  const auth = readCodexAuthFile(env);
  if (!auth) return false;
  try {
    if (auth.OPENAI_API_KEY) return true;
    if (auth.tokens?.access_token) return true;
    return false;
  } catch {
    return false;
  }
}

function removeCodexAuthFiles(env?: Record<string, string>): void {
  for (const authPath of getCodexAuthPaths(env)) {
    if (existsSync(authPath)) rmSync(authPath, { force: true });
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

  const headers = Object.entries(server.headers ?? {}).map(([name, value]) => ({ name, value }));

  if (server.transport === "http") {
    return {
      type: "http",
      name: server.name,
      url: server.url ?? "",
      headers,
    };
  }

  return {
    type: "sse",
    name: server.name,
    url: server.url ?? "",
    headers,
  };
}

function stringifyToolContent(content: unknown): string {
  if (!Array.isArray(content)) return stringifyUnknown(content);
  return content.map((item) => stringifyToolContentItem(item)).join("\n");
}

/**
 * Extract the text payload from an ACP content block (used for
 * `agent_thought_chunk` reasoning). Handles both a plain `{ type: "text",
 * text }` block and the wrapped `{ type: "content", content }` form some
 * agents emit.
 */
function getAcpContentText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const record = content as Record<string, unknown>;
  const type = record["type"];
  if (type === "text" && typeof record["text"] === "string") {
    return record["text"].trim();
  }
  if (type === "content" && record["content"]) {
    return getAcpContentText(record["content"]);
  }
  return "";
}

function readUpdateStatus(update: unknown): string | null {
  if (!update || typeof update !== "object") return null;
  const status = (update as Record<string, unknown>)["status"];
  return typeof status === "string" ? status : null;
}

/**
 * Whether a `tool_call_update` carries identity/argument metadata worth
 * re-deriving the tool card from (vs. a bare status/output-only update).
 */
function hasToolCallMetadata(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  const record = update as Record<string, unknown>;
  const rawInput = record["rawInput"];
  if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput) && Object.keys(rawInput).length > 0) {
    return true;
  }
  if (Array.isArray(record["locations"]) && record["locations"].length > 0) return true;
  if (Array.isArray(record["content"]) && record["content"].length > 0) return true;
  if (typeof record["title"] === "string" && record["title"].trim()) return true;
  return false;
}

function getAcpJaitMcpCall(update: unknown): { tool: string; args: Record<string, unknown> } | null {
  if (!update || typeof update !== "object") return null;
  const record = update as Record<string, unknown>;
  const rawInput = record["rawInput"];
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return null;

  const wrapper = rawInput as Record<string, unknown>;
  const title = typeof record["title"] === "string" ? record["title"].trim() : "";

  // Shape 3: Claude Code calling an already-loaded Jait MCP tool directly (not
  // through the deferred-tool dispatcher) — ACP reports the fully-qualified
  // name as `title` ("mcp__<server>__<tool>") and `rawInput` IS the tool's real
  // arguments already, completely unwrapped. Must be checked first: falling
  // through to the generic-dispatcher logic below would blindly overwrite a
  // tool's own `title` argument (e.g. user.ask's) with this identity string.
  const qualifiedMatch = title.match(/^mcp__(?:jait_core|jait)__(.+)$/);
  if (qualifiedMatch) {
    return { tool: qualifiedMatch[1]!.replace(/_/g, "."), args: wrapper };
  }

  const server = typeof wrapper["server"] === "string" ? wrapper["server"].trim() : "";
  const hasJaitServer = server === JAIT_CORE_MCP_SERVER_NAME || server === JAIT_DEFERRED_MCP_SERVER_NAME;
  // Codex's code-mode wrapper carries an explicit `server` field. Claude Code's ACP
  // bridge omits `server` entirely and nests args under `args` instead of `arguments`,
  // but still reports the outer tool_call `title` as the literal string "mcp" — use
  // that as the fallback signal that this is a Jait deferred-tool dispatch call.
  if (!hasJaitServer && title !== "mcp") return null;

  let rawTool = typeof wrapper["tool"] === "string" ? wrapper["tool"].trim() : "";
  if (!rawTool) return null;
  // Codex's `tool` field is already bare (server is a separate field), but Claude
  // Code's collapsed naming folds the server name into `tool` itself
  // (e.g. "jait_agent_spawn" for server "jait", tool "agent_spawn") — strip it so
  // both shapes resolve to the same normalized identity ("agent.spawn").
  if (!hasJaitServer) {
    if (rawTool.startsWith("jait_core_")) rawTool = rawTool.slice("jait_core_".length);
    else if (rawTool.startsWith("jait_")) rawTool = rawTool.slice("jait_".length);
  }
  const normalizedTool = rawTool.replace(/_/g, ".");

  const rawArgs = wrapper["arguments"] ?? wrapper["args"];
  if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    return { tool: normalizedTool, args: rawArgs as Record<string, unknown> };
  }
  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { tool: normalizedTool, args: parsed as Record<string, unknown> };
      }
    } catch {}
  }

  return { tool: normalizedTool, args: {} };
}

function getAcpToolName(update: unknown): string {
  const jaitMcpCall = getAcpJaitMcpCall(update);
  if (jaitMcpCall) return jaitMcpCall.tool;
  if (!update || typeof update !== "object") return "tool";
  const record = update as Record<string, unknown>;
  const kind = typeof record["kind"] === "string" ? record["kind"] : null;
  if (kind === "read" || kind === "edit" || kind === "search") return kind;
  const title = typeof record["title"] === "string" && record["title"].trim()
    ? record["title"]
    : null;
  if (title) return title;
  // ACP servers that skip `title` (common with third-party wrappers like pi-acp,
  // cursor-agent-acp, deepagents-acp) still set `kind` — prefer it over the raw
  // toolCallId, which is an opaque UUID/counter with no naming value.
  if (kind) return kind;
  return typeof record["toolCallId"] === "string" ? record["toolCallId"] : "tool";
}

function getAcpToolArgs(update: unknown): unknown {
  const jaitMcpCall = getAcpJaitMcpCall(update);
  if (jaitMcpCall) return jaitMcpCall.args;
  if (!update || typeof update !== "object") return undefined;
  const record = update as Record<string, unknown>;
  const rawInput = record["rawInput"];
  const args = rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
    ? { ...(rawInput as Record<string, unknown>) }
    : {};
  const kind = typeof record["kind"] === "string" ? record["kind"] : null;

  if (Array.isArray(record["locations"])) {
    args.locations = record["locations"];
    const path = firstPathFromAcpLocations(record["locations"]);
    if (path && typeof args.path !== "string") args.path = path;
  }
  if ((kind === "edit" || kind === "read") && Array.isArray(record["content"])) {
    args.content = record["content"];
    const changes = changesFromAcpContent(record["content"]);
    if (changes.length > 0) {
      args.changes = changes;
      if (typeof args.path !== "string") args.path = changes[0]?.path;
      if (typeof args.search !== "string") args.search = changes[0]?.oldText;
      if (typeof args.replace !== "string") args.replace = changes[0]?.newText;
    }
  }
  if (Object.keys(args).length > 0) {
    if (typeof record["title"] === "string" && record["title"].trim()) {
      args.title = record["title"];
    }
    if (kind) args.kind = kind;
  }

  return Object.keys(args).length > 0 ? args : undefined;
}

function firstPathFromAcpLocations(locations: unknown[]): string | undefined {
  for (const location of locations) {
    if (!location || typeof location !== "object") continue;
    const path = (location as Record<string, unknown>)["path"];
    if (typeof path === "string" && path.trim()) return path;
  }
  return undefined;
}

function changesFromAcpContent(content: unknown[]): Array<Record<string, unknown>> {
  const changes: Array<Record<string, unknown>> = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const path = record["path"];
    if (typeof path !== "string" || !path.trim()) continue;
    changes.push({
      path,
      oldText: record["oldText"],
      newText: record["newText"],
      kind: record["_meta"] && typeof record["_meta"] === "object"
        ? (record["_meta"] as Record<string, unknown>)["kind"]
        : undefined,
    });
  }
  return changes;
}

function readUpdateMessage(update: unknown): string | null {
  if (!update || typeof update !== "object") return null;
  const record = update as Record<string, unknown>;
  const content = record["content"];
  if (content) return stringifyToolContent(content);
  const rawOutput = record["rawOutput"];
  if (rawOutput) return stringifyUnknown(rawOutput);
  const status = record["status"];
  return typeof status === "string" ? status : null;
}

function isTransientJaitMcpStartupCancellation(update: unknown): boolean {
  if (!update || typeof update !== "object") return false;
  const record = update as Record<string, unknown>;
  if (record["sessionUpdate"] !== "tool_call" || record["status"] !== "failed") return false;
  const title = typeof record["title"] === "string" ? record["title"] : "";
  const callId = typeof record["toolCallId"] === "string" ? record["toolCallId"] : "";
  const message = readUpdateMessage(update);

  return [JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME]
    .some((serverName) => (
      (
        title === `mcp__${serverName}__startup`
        || callId === `mcp_startup.${encodeURIComponent(serverName)}`
      )
      && message === `[codex-acp forwarded startup error] MCP server \`${serverName}\` startup was cancelled.`
    ));
}

function isReplayableStartupEvent(event: ProviderEvent): boolean {
  if (event.type !== "tool.start" && event.type !== "tool.result") return false;
  return [JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME]
    .some((serverName) => (
      event.tool === `mcp__${serverName}__startup`
      || event.callId === `mcp_startup.${encodeURIComponent(serverName)}`
    ));
}

function stringifyToolContentItem(item: unknown): string {
  if (!item || typeof item !== "object") return stringifyUnknown(item);
  const record = item as Record<string, unknown>;
  if (record["type"] === "content" && "content" in record) {
    return stringifyToolContentItem(record["content"]);
  }
  if (record["type"] === "text" && typeof record["text"] === "string") {
    return record["text"];
  }
  return stringifyUnknown(item);
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

/**
 * Env overlay that points a CLI agent's own HTTP client at a local OmniRoute
 * router instead of the vendor API. OmniRoute serves both an OpenAI-compatible
 * `/v1` and an Anthropic-compatible surface at the root, so Codex and Claude
 * Code each need their respective pair.
 *
 * Opt-in only. Enabling it by default would silently redirect a user's paid
 * Claude/ChatGPT subscription through a third-party router the moment the
 * router happens to be installed — never something to infer.
 */
export function omnirouteAcpEnv(
  providerType: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> | undefined {
  if (env.JAIT_ACP_VIA_OMNIROUTE?.trim().toLowerCase() !== "1") return undefined;
  const openaiBaseUrl = (env.OMNIROUTE_BASE_URL?.trim() || "http://localhost:20128/v1").replace(/\/+$/, "");
  // The Anthropic surface lives at the router root, not under /v1 — the CLI
  // appends /v1/messages itself.
  const anthropicBaseUrl = openaiBaseUrl.replace(/\/v1$/, "");
  const key = env.OMNIROUTE_API_KEY?.trim() || "omniroute";

  if (providerType === "claude-code") {
    return { ANTHROPIC_BASE_URL: anthropicBaseUrl, ANTHROPIC_AUTH_TOKEN: key };
  }
  if (providerType === "codex") {
    return { OPENAI_BASE_URL: openaiBaseUrl, OPENAI_API_KEY: key };
  }
  return undefined;
}

export function loadAcpProviderConfigs(): AcpProviderConfig[] {
  const defaults: AcpProviderConfig[] = [
    {
      id: "codex",
      name: "Codex",
      description: "OpenAI Codex via Agent Client Protocol",
      command: "npx",
      args: ["-y", "@agentclientprotocol/codex-acp"],
      env: {
        CODEX_CONFIG: mergeJaitCodexConfig(process.env.CODEX_CONFIG),
      },
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
