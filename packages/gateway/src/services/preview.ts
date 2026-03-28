import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import {
  BrowserSurface,
  type BrowserPerformanceMetrics,
  type BrowserPageSnapshot,
  type BrowserRuntimeEvent,
} from "../surfaces/browser.js";
import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
import {
  createPreviewRunner,
  type PreviewRunner,
  type PreviewRunnerResult,
} from "./preview-runner.js";

export type PreviewStatus = "starting" | "ready" | "error" | "stopped";
export type PreviewMode = "local" | "docker" | "url";

export interface PreviewLogEntry {
  id: number;
  stream: "stdout" | "stderr" | "system";
  text: string;
  timestamp: string;
}

export interface PreviewSession {
  id: string;
  sessionId: string;
  workspaceRoot: string | null;
  mode: PreviewMode;
  status: PreviewStatus;
  target: string | null;
  command: string | null;
  port: number | null;
  url: string | null;
  browserId: string | null;
  processId: number | null;
  containerId: string | null;
  logs: PreviewLogEntry[];
  browserEvents: BrowserRuntimeEvent[];
  metrics: BrowserPerformanceMetrics | null;
  remoteBrowser: PreviewRemoteBrowserSession | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewRemoteBrowserSession {
  containerName: string;
  novncUrl: string;
  vncPort: number;
  novncPort: number;
  startedAt: string;
}

export interface StartPreviewInput {
  sessionId: string;
  workspaceRoot?: string | null;
  target?: string | null;
  command?: string | null;
  port?: number | null;
  frameworkHint?: string | null;
}

interface InternalPreviewSession extends PreviewSession {
  browserUrl: string | null;
  process: ChildProcessWithoutNullStreams | null;
  runnerResult: PreviewRunnerResult | null;
}

const MAX_PREVIEW_LOGS = 400;

function nowIso(): string {
  return new Date().toISOString();
}

function pushBounded<T>(items: T[], next: T, max: number): void {
  items.push(next);
  if (items.length > max) items.splice(0, items.length - max);
}

function normalizeTargetUrl(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    return `http://127.0.0.1:${Number.parseInt(trimmed, 10)}/`;
  }
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (!["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"].includes(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function createLiveViewRemoteBrowser(
  liveView: { novncUrl: string; vncPort: number; websockifyPort: number },
): PreviewRemoteBrowserSession {
  return {
    containerName: "live-view",
    novncUrl: liveView.novncUrl,
    vncPort: liveView.vncPort,
    novncPort: liveView.websockifyPort,
    startedAt: nowIso(),
  };
}

export class PreviewService {
  private readonly sessions = new Map<string, InternalPreviewSession>();
  private nextLogId = 1;
  private readonly runner: PreviewRunner;
  private readonly sandboxManager: SandboxManager;

  constructor(private readonly surfaceRegistry: SurfaceRegistry, sandboxManager = new SandboxManager()) {
    this.runner = createPreviewRunner(false);
    this.sandboxManager = sandboxManager;
  }

  async start(input: StartPreviewInput): Promise<PreviewSession> {
    if (!input.sessionId) throw new Error("sessionId is required");
    await this.stop(input.sessionId);

    const createdAt = nowIso();
    const normalizedTarget = normalizeTargetUrl(input.target ?? "");
    const isLocal = Boolean(input.command?.trim()) || (!normalizedTarget && Boolean(input.workspaceRoot?.trim()));
    const session: InternalPreviewSession = {
      id: `preview-${input.sessionId}`,
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot?.trim() || null,
      mode: isLocal ? this.runner.mode : "url",
      status: "starting",
      target: input.target?.trim() || null,
      command: null,
      port: null,
      url: null,
      browserId: `preview-browser-${input.sessionId}`,
      processId: null,
      containerId: null,
      logs: [],
      browserEvents: [],
      metrics: null,
      remoteBrowser: null,
      lastError: null,
      createdAt,
      updatedAt: createdAt,
      browserUrl: null,
      process: null,
      runnerResult: null,
    };
    this.sessions.set(input.sessionId, session);
    this.appendLog(session, "system", "Starting preview session");

    try {
      if (session.mode !== "url") {
        if (!session.workspaceRoot) {
          throw new Error("workspaceRoot is required for managed project previews");
        }
        const result = await this.runner.start(
          {
            workspaceRoot: session.workspaceRoot,
            command: input.command?.trim() || null,
            port: input.port,
            target: input.target?.trim() || null,
            frameworkHint: input.frameworkHint?.trim() || null,
          },
          (stream, text) => this.appendLog(session, stream, text),
        );

        session.runnerResult = result;
        session.process = result.process;
        session.port = result.port;
        session.command = result.command;
        session.browserUrl = result.url;
        session.url = `/api/dev-proxy/${result.port}/`;
        session.processId = result.processId ?? null;
        session.containerId = result.containerId ?? null;

        // Listen for process exit
        if (result.process) {
          result.process.on("exit", (code, signal) => {
            if (session.status === "stopped") return;
            session.updatedAt = nowIso();
            session.status = "error";
            const message = `Preview process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
            session.lastError = message;
            this.appendLog(session, "stderr", message);
          });
        }
      } else {
        session.browserUrl = normalizedTarget;
        if (!session.browserUrl) {
          throw new Error("A loopback target URL or port is required");
        }
        const targetPort = new URL(session.browserUrl).port;
        session.url = `/api/dev-proxy/${targetPort}/`;
      }

      await this.ensureBrowser(session);
      if (!session.remoteBrowser) {
        throw new Error("Preview live view is unavailable. Enable the browser live view backend before starting preview.");
      }
      session.url = session.remoteBrowser.novncUrl;
      session.status = "ready";
      session.updatedAt = nowIso();
      this.appendLog(session, "system", `Preview ready at ${session.url}`);
      return this.toPublicSession(session);
    } catch (error) {
      session.status = "error";
      session.lastError = error instanceof Error ? error.message : "Preview start failed";
      session.updatedAt = nowIso();
      this.appendLog(session, "stderr", session.lastError);
      return this.toPublicSession(session);
    }
  }

  async restart(sessionId: string): Promise<PreviewSession | null> {
    const existing = this.sessions.get(sessionId);
    if (!existing) return null;
    return this.start({
      sessionId,
      workspaceRoot: existing.workspaceRoot,
      target: existing.target,
      command: existing.command,
      port: existing.port,
    });
  }

  async stop(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.runnerResult) {
      await this.runner.stop(session.runnerResult).catch(() => {});
    } else if (session.process && !session.process.killed) {
      session.process.kill("SIGTERM");
    }
    await this.stopRemoteBrowser(sessionId);
    if (session.browserId) {
      await this.surfaceRegistry.stopSurface(session.browserId, "preview-stop").catch(() => {});
    }

    session.status = "stopped";
    session.updatedAt = nowIso();
    this.appendLog(session, "system", "Preview stopped");
    this.sessions.delete(sessionId);
    return true;
  }

  get(sessionId: string): PreviewSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.browserEvents = this.readBrowserEvents(session);
    return this.toPublicSession(session);
  }

  async refreshSessionCapture(sessionId: string): Promise<PreviewSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const nextEvents = this.readBrowserEvents(session);
    const nextMetrics = await this.readBrowserMetrics(session).catch(() => session.metrics);
    const eventsChanged = nextEvents.length !== session.browserEvents.length
      || nextEvents[nextEvents.length - 1]?.id !== session.browserEvents[session.browserEvents.length - 1]?.id;
    const metricsChanged = nextMetrics?.sampledAt !== session.metrics?.sampledAt;
    session.browserEvents = nextEvents;
    session.metrics = nextMetrics;
    if (eventsChanged || metricsChanged) {
      session.updatedAt = nowIso();
    }
    return this.toPublicSession(session);
  }

  getLogs(sessionId: string, sinceId = 0): PreviewLogEntry[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.logs.filter((entry) => entry.id > sinceId);
  }

  list(): PreviewSession[] {
    return [...this.sessions.values()].map((s) => this.get(s.sessionId)!).filter(Boolean);
  }

  async startRemoteBrowser(
    sessionId: string,
    options?: { workspaceRoot?: string | null; mountMode?: SandboxMountMode },
  ): Promise<PreviewSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.remoteBrowser?.containerName) {
      await this.stopRemoteBrowser(sessionId);
    }

    // If the agent's browser already has a live view (BROWSER_LIVE_VIEW=true),
    // use that instead of spinning up a separate Docker sandbox.
    if (session.browserId) {
      const surface = this.surfaceRegistry.getSurface(session.browserId);
      if (surface?.type === "browser" && typeof (surface as BrowserSurface).getLiveViewInfo === "function") {
        const liveView = (surface as BrowserSurface).getLiveViewInfo();
        if (liveView) {
          session.remoteBrowser = createLiveViewRemoteBrowser(liveView);
          session.url = session.remoteBrowser.novncUrl;
          session.updatedAt = nowIso();
          this.appendLog(session, "system", `Live view of agent browser ready at ${liveView.novncUrl}`);
          return this.toPublicSession(session);
        }
      }
    }

    // Fallback: start a separate sandboxed browser container
    const workspaceRoot = options?.workspaceRoot?.trim() || session.workspaceRoot;
    if (!workspaceRoot) {
      throw new Error("workspaceRoot is required for a remote browser session");
    }
    const [novncPort, vncPort] = await Promise.all([reservePort(), reservePort()]);
    const remote = await this.sandboxManager.startBrowserSandbox({
      workspaceRoot,
      novncPort,
      vncPort,
      mountMode: options?.mountMode ?? "read-only",
    });
    session.remoteBrowser = {
      ...remote,
      startedAt: nowIso(),
    };
    session.updatedAt = nowIso();
    this.appendLog(session, "system", `Remote browser session ready at ${remote.novncUrl}`);
    return this.toPublicSession(session);
  }

  async stopRemoteBrowser(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    const remote = session?.remoteBrowser;
    if (!session || !remote?.containerName) return false;
    // Live view processes are owned by the browser surface — don't try to docker rm them
    if (remote.containerName !== "live-view") {
      await this.sandboxManager.stopContainer(remote.containerName).catch(() => {});
    }
    session.remoteBrowser = null;
    session.updatedAt = nowIso();
    this.appendLog(session, "system", "Remote browser session stopped");
    return true;
  }

  async screenshot(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.browserId) return null;
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return null;
    const screenshot = await (surface as BrowserSurface).screenshot();
    if (!screenshot) return null;
    try {
      const bytes = await readFile(screenshot);
      return bytes.toString("base64");
    } catch {
      return screenshot;
    }
  }

  async snapshot(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.browserId) return null;
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return null;
    const browser = surface as BrowserSurface;
    return browser.describe();
  }

  async inspect(sessionId: string, selector?: string): Promise<{
    status: PreviewStatus;
    url: string | null;
    browserEvents: BrowserRuntimeEvent[];
    metrics: BrowserPerformanceMetrics | null;
    logs: PreviewLogEntry[];
    screenshot: string | null;
    page: BrowserPageSnapshot | null;
    snapshot: string | null;
    target?: import("../surfaces/browser.js").BrowserTargetDiagnostics | null;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const events = this.readBrowserEvents(session);
    const screenshotBase64 = await this.screenshot(sessionId).catch(() => null);
    const inspection = await this.inspectBrowserPage(session, selector).catch(() => null);

    return {
      status: session.status,
      url: session.url,
      browserEvents: events,
      metrics: await this.readBrowserMetrics(session).catch(() => session.metrics),
      logs: [...session.logs],
      screenshot: screenshotBase64,
      page: inspection?.snapshot ?? null,
      snapshot: inspection ? this.formatInspectionSnapshot(inspection.snapshot) : null,
      target: inspection?.target ?? null,
    };
  }

  async stopAll(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    for (const sessionId of sessionIds) {
      await this.stop(sessionId);
    }
  }

  private async ensureBrowser(session: InternalPreviewSession): Promise<void> {
    const browserId = session.browserId!;
    await this.surfaceRegistry.stopSurface(browserId, "preview-refresh").catch(() => {});
    const started = await this.surfaceRegistry.startSurface("browser", browserId, {
      sessionId: session.sessionId,
      workspaceRoot: session.workspaceRoot ?? process.cwd(),
    });
    if (started.type !== "browser") {
      throw new Error("Preview browser surface failed to start");
    }
    const browser = started as BrowserSurface;
    await browser.navigate(session.browserUrl!);
    session.browserEvents = browser.getEvents();
    session.metrics = await browser.getMetrics().catch(() => null);

    // Auto-populate remoteBrowser when the agent's browser has a live view
    const liveView = typeof browser.getLiveViewInfo === "function" ? browser.getLiveViewInfo() : null;
    if (liveView) {
      session.remoteBrowser = createLiveViewRemoteBrowser(liveView);
    }
  }

  private readBrowserEvents(session: InternalPreviewSession): BrowserRuntimeEvent[] {
    if (!session.browserId) return [];
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return session.browserEvents;
    return (surface as BrowserSurface).getEvents();
  }

  private async inspectBrowserPage(
    session: InternalPreviewSession,
    selector?: string,
  ): Promise<{ snapshot: BrowserPageSnapshot; target?: import("../surfaces/browser.js").BrowserTargetDiagnostics } | null> {
    if (!session.browserId) return null;
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return null;
    return (surface as BrowserSurface).inspect(selector);
  }

  private async readBrowserMetrics(session: InternalPreviewSession): Promise<BrowserPerformanceMetrics | null> {
    if (!session.browserId) return null;
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return session.metrics;
    return (surface as BrowserSurface).getMetrics();
  }

  private formatInspectionSnapshot(snapshot: BrowserPageSnapshot): string {
    const lines = [
      `URL: ${snapshot.url}`,
      `Title: ${snapshot.title || "(untitled)"}`,
      snapshot.activeElement
        ? `Active element: ${[
          snapshot.activeElement.role ?? snapshot.activeElement.tagName ?? "element",
          snapshot.activeElement.name,
          snapshot.activeElement.selector,
        ].filter(Boolean).join(" - ")}`
        : "Active element: (none)",
      snapshot.dialogs?.length
        ? `Dialogs: ${snapshot.dialogs.map((dialog) => dialog.title || dialog.name || dialog.selector || dialog.role || "dialog").join(", ")}`
        : "Dialogs: (none)",
      "",
      "Text:",
      snapshot.text.trim() || "(no textual content)",
    ];
    return lines.join("\n").trim();
  }

  private appendLog(
    session: InternalPreviewSession,
    stream: "stdout" | "stderr" | "system",
    text: string,
  ): void {
    const normalized = text.replace(/\r/g, "").split("\n").map((line) => line.trimEnd()).filter(Boolean);
    if (normalized.length === 0) return;
    for (const line of normalized) {
      pushBounded(session.logs, {
        id: this.nextLogId++,
        stream,
        text: line,
        timestamp: nowIso(),
      }, MAX_PREVIEW_LOGS);
    }
    session.updatedAt = nowIso();
  }

  private toPublicSession(session: InternalPreviewSession): PreviewSession {
    return {
      id: session.id,
      sessionId: session.sessionId,
      workspaceRoot: session.workspaceRoot,
      mode: session.mode,
      status: session.status,
      target: session.target,
      command: session.command,
      port: session.port,
      url: session.url,
      browserId: session.browserId,
      processId: session.processId,
      containerId: session.containerId,
      logs: [...session.logs],
      browserEvents: [...session.browserEvents],
      metrics: session.metrics ? { ...session.metrics } : null,
      remoteBrowser: session.remoteBrowser ? { ...session.remoteBrowser } : null,
      lastError: session.lastError,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}

async function reservePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve a port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}
