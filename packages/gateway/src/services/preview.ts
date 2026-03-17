import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { BrowserSurface, type BrowserRuntimeEvent } from "../surfaces/browser.js";

export type PreviewStatus = "idle" | "starting" | "ready" | "error" | "stopped";
export type PreviewMode = "local" | "url";

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
  logs: Array<{ id: number; stream: "stdout" | "stderr" | "system"; text: string; timestamp: string }>;
  browserEvents: BrowserRuntimeEvent[];
  lastError: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface StartPreviewInput {
  sessionId: string;
  workspaceRoot?: string | null;
  target?: string | null;
  command?: string | null;
  port?: number | null;
}

interface InternalPreviewSession extends PreviewSession {
  process: ChildProcessWithoutNullStreams | null;
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

function detectPackageManager(workspaceRoot: string): "bun" | "pnpm" | "npm" {
  if (existsSync(join(workspaceRoot, "bun.lockb"))) return "bun";
  if (existsSync(join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  return "npm";
}

function loadPackageJson(workspaceRoot: string): Record<string, any> | null {
  const file = join(workspaceRoot, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
  } catch {
    return null;
  }
}

function detectPreviewCommand(workspaceRoot: string, requestedCommand: string | null, port: number): string {
  if (requestedCommand?.trim()) return requestedCommand.trim();

  const packageJson = loadPackageJson(workspaceRoot);
  if (!packageJson) {
    throw new Error("No package.json found and no preview command was provided.");
  }

  const deps = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  } as Record<string, string>;
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  const packageManager = detectPackageManager(workspaceRoot);

  if ("vite" in deps) {
    return `${packageManager} exec vite --host 127.0.0.1 --port ${port}`;
  }
  if ("next" in deps) {
    return `${packageManager} exec next dev --hostname 127.0.0.1 --port ${port}`;
  }
  if (scripts.preview) {
    return `${packageManager} run preview -- --host 127.0.0.1 --port ${port}`;
  }
  if (scripts.dev) {
    return `${packageManager} run dev`;
  }

  throw new Error("Unable to detect a preview command. Provide one explicitly.");
}

async function allocatePort(preferred?: number | null): Promise<number> {
  if (preferred && preferred > 0) return preferred;
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate preview port")));
        return;
      }
      const port = address.port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitForHttp(url: string, timeoutMs = 45_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok || response.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Preview server did not become ready at ${url} within ${timeoutMs}ms`);
}

export class PreviewService {
  private readonly sessions = new Map<string, InternalPreviewSession>();
  private nextLogId = 1;

  constructor(private readonly surfaceRegistry: SurfaceRegistry) {}

  async start(input: StartPreviewInput): Promise<PreviewSession> {
    if (!input.sessionId) throw new Error("sessionId is required");
    await this.stop(input.sessionId);

    const startedAt = nowIso();
    const session: InternalPreviewSession = {
      id: `preview-${input.sessionId}`,
      sessionId: input.sessionId,
      workspaceRoot: input.workspaceRoot?.trim() || null,
      mode: input.command?.trim() || input.workspaceRoot?.trim() ? "local" : "url",
      status: "starting",
      target: input.target?.trim() || null,
      command: null,
      port: null,
      url: null,
      browserId: `preview-browser-${input.sessionId}`,
      logs: [],
      browserEvents: [],
      lastError: null,
      startedAt,
      updatedAt: startedAt,
      process: null,
    };
    this.sessions.set(input.sessionId, session);
    this.appendLog(session, "system", "Starting preview session");

    try {
      if (session.mode === "local") {
        if (!session.workspaceRoot) {
          throw new Error("workspaceRoot is required for managed project previews");
        }
        session.port = await allocatePort(input.port);
        session.command = detectPreviewCommand(session.workspaceRoot, input.command?.trim() || null, session.port);
        session.url = normalizeTargetUrl(input.target ?? "") ?? `http://127.0.0.1:${session.port}/`;
        session.process = this.spawnLocalProcess(session);
        await waitForHttp(session.url);
      } else {
        session.url = normalizeTargetUrl(input.target ?? "");
        if (!session.url) {
          throw new Error("A loopback target URL or port is required");
        }
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

    if (session.process && !session.process.killed) {
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

  list(): PreviewSession[] {
    return [...this.sessions.values()].map((session) => this.get(session.sessionId)!).filter(Boolean);
  }

  async stopAll(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    for (const sessionId of sessionIds) {
      await this.stop(sessionId);
    }
  }

  private spawnLocalProcess(session: InternalPreviewSession): ChildProcessWithoutNullStreams {
    const child = spawn(session.command!, {
      cwd: session.workspaceRoot!,
      env: {
        ...process.env,
        PORT: String(session.port!),
        HOST: "127.0.0.1",
        HOSTNAME: "127.0.0.1",
        BROWSER: "none",
      },
      shell: true,
      stdio: "pipe",
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.appendLog(session, "stdout", chunk));
    child.stderr.on("data", (chunk: string) => this.appendLog(session, "stderr", chunk));
    child.on("exit", (code, signal) => {
      if (session.status === "stopped") return;
      session.updatedAt = nowIso();
      if (session.status !== "ready") {
        session.status = "error";
      }
      const message = `Preview process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
      session.lastError = message;
      this.appendLog(session, "stderr", message);
    });
    child.on("error", (error) => {
      session.status = "error";
      session.lastError = error.message;
      session.updatedAt = nowIso();
      this.appendLog(session, "stderr", error.message);
    });

    return child;
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
    await browser.navigate(session.url!);
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
      logs: [...session.logs],
      browserEvents: [...session.browserEvents],
      lastError: session.lastError,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
    };
  }
}
