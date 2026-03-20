import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { BrowserSurface, type BrowserRuntimeEvent } from "../surfaces/browser.js";
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
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
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

export class PreviewService {
  private readonly sessions = new Map<string, InternalPreviewSession>();
  private nextLogId = 1;
  private readonly runner: PreviewRunner;

  constructor(private readonly surfaceRegistry: SurfaceRegistry) {
    this.runner = createPreviewRunner(false);
  }

  async start(input: StartPreviewInput): Promise<PreviewSession> {
    if (!input.sessionId) throw new Error("sessionId is required");
    await this.stop(input.sessionId);

    const createdAt = nowIso();
    const isLocal = Boolean(input.command?.trim() || input.workspaceRoot?.trim());
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
        session.url = `/api/preview/proxy/${input.sessionId}/`;
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
        session.browserUrl = normalizeTargetUrl(input.target ?? "");
        if (!session.browserUrl) {
          throw new Error("A loopback target URL or port is required");
        }
        session.url = `/api/preview/proxy/${input.sessionId}/`;
      }

      await this.ensureBrowser(session);
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

  getProxyTarget(sessionId: string): URL | null {
    const session = this.sessions.get(sessionId);
    if (!session?.browserUrl) return null;
    try {
      return new URL(session.browserUrl);
    } catch {
      return null;
    }
  }

  getLogs(sessionId: string, sinceId = 0): PreviewLogEntry[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.logs.filter((entry) => entry.id > sinceId);
  }

  list(): PreviewSession[] {
    return [...this.sessions.values()].map((s) => this.get(s.sessionId)!).filter(Boolean);
  }

  async screenshot(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.browserId) return null;
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return null;
    return (surface as BrowserSurface).screenshot();
  }

  async snapshot(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session?.browserId) return null;
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return null;
    const browser = surface as BrowserSurface;
    return browser.describe();
  }

  async inspect(sessionId: string): Promise<{
    status: PreviewStatus;
    url: string | null;
    browserEvents: BrowserRuntimeEvent[];
    logs: PreviewLogEntry[];
    screenshot: string | null;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const events = this.readBrowserEvents(session);
    const screenshotBase64 = await this.screenshot(sessionId).catch(() => null);

    return {
      status: session.status,
      url: session.url,
      browserEvents: events,
      logs: [...session.logs],
      screenshot: screenshotBase64,
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
  }

  private readBrowserEvents(session: InternalPreviewSession): BrowserRuntimeEvent[] {
    if (!session.browserId) return [];
    const surface = this.surfaceRegistry.getSurface(session.browserId);
    if (!surface || surface.type !== "browser" || surface.state !== "running") return session.browserEvents;
    return (surface as BrowserSurface).getEvents();
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
      lastError: session.lastError,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }
}
