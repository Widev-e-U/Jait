import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";

// ── Contracts ────────────────────────────────────────────────────────

export interface PreviewRunnerResult {
  process: ChildProcessWithoutNullStreams | null;
  port: number;
  command: string;
  url: string;
  mode: "local" | "docker";
  containerId?: string;
  processId?: number;
}

export interface PreviewRunnerInput {
  workspaceRoot: string;
  command?: string | null;
  port?: number | null;
  target?: string | null;
  frameworkHint?: string | null;
}

export type PreviewLogCallback = (stream: "stdout" | "stderr" | "system", text: string) => void;

export interface PreviewRunner {
  readonly mode: "local" | "docker";
  start(input: PreviewRunnerInput, onLog: PreviewLogCallback): Promise<PreviewRunnerResult>;
  stop(result: PreviewRunnerResult): Promise<void>;
}

// ── Detection helpers ────────────────────────────────────────────────

export function detectPackageManager(workspaceRoot: string): "bun" | "pnpm" | "npm" {
  if (existsSync(join(workspaceRoot, "bun.lockb"))) return "bun";
  if (existsSync(join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  return "npm";
}

export function loadPackageJson(workspaceRoot: string): Record<string, any> | null {
  const file = join(workspaceRoot, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;
  } catch {
    return null;
  }
}

export interface DetectedFramework {
  name: string;
  devCommand: string;
  likelyPort: number;
}

function buildExecCommand(
  packageManager: "bun" | "pnpm" | "npm",
  executable: string,
  args: string[],
): string {
  const suffix = args.length > 0 ? ` ${args.join(" ")}` : "";
  if (packageManager === "npm") {
    return `npm exec -- ${executable}${suffix}`;
  }
  return `${packageManager} exec ${executable}${suffix}`;
}

export function detectFramework(workspaceRoot: string, hint?: string | null): DetectedFramework | null {
  if (hint) {
    const lower = hint.toLowerCase();
    const pm = detectPackageManager(workspaceRoot);
    if (lower === "vite") return { name: "vite", devCommand: buildExecCommand(pm, "vite", []), likelyPort: 5173 };
    if (lower === "next" || lower === "nextjs") return { name: "next", devCommand: buildExecCommand(pm, "next", ["dev"]), likelyPort: 3000 };
    if (lower === "nuxt" || lower === "nuxtjs") return { name: "nuxt", devCommand: buildExecCommand(pm, "nuxt", ["dev"]), likelyPort: 3000 };
    if (lower === "remix") return { name: "remix", devCommand: `${pm} run dev`, likelyPort: 3000 };
    if (lower === "astro") return { name: "astro", devCommand: buildExecCommand(pm, "astro", ["dev"]), likelyPort: 4321 };
  }

  const pm = detectPackageManager(workspaceRoot);
  const pkg = loadPackageJson(workspaceRoot);
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, string>;

  // Config-file detection (works even without deps in package.json)
  if (existsSync(join(workspaceRoot, "vite.config.ts")) || existsSync(join(workspaceRoot, "vite.config.js"))) {
    return { name: "vite", devCommand: buildExecCommand(pm, "vite", []), likelyPort: 5173 };
  }
  if (existsSync(join(workspaceRoot, "next.config.ts")) || existsSync(join(workspaceRoot, "next.config.js")) || existsSync(join(workspaceRoot, "next.config.mjs"))) {
    return { name: "next", devCommand: buildExecCommand(pm, "next", ["dev"]), likelyPort: 3000 };
  }
  if (existsSync(join(workspaceRoot, "nuxt.config.ts")) || existsSync(join(workspaceRoot, "nuxt.config.js"))) {
    return { name: "nuxt", devCommand: buildExecCommand(pm, "nuxt", ["dev"]), likelyPort: 3000 };
  }
  if (existsSync(join(workspaceRoot, "astro.config.mjs")) || existsSync(join(workspaceRoot, "astro.config.ts"))) {
    return { name: "astro", devCommand: buildExecCommand(pm, "astro", ["dev"]), likelyPort: 4321 };
  }

  // Dependency detection
  if ("vite" in deps) return { name: "vite", devCommand: buildExecCommand(pm, "vite", []), likelyPort: 5173 };
  if ("next" in deps) return { name: "next", devCommand: buildExecCommand(pm, "next", ["dev"]), likelyPort: 3000 };
  if ("nuxt" in deps) return { name: "nuxt", devCommand: buildExecCommand(pm, "nuxt", ["dev"]), likelyPort: 3000 };
  if ("astro" in deps) return { name: "astro", devCommand: buildExecCommand(pm, "astro", ["dev"]), likelyPort: 4321 };
  if ("@remix-run/dev" in deps) return { name: "remix", devCommand: `${pm} run dev`, likelyPort: 3000 };

  return null;
}

export function detectPreviewCommand(workspaceRoot: string, requestedCommand: string | null, port: number, frameworkHint?: string | null): string {
  if (requestedCommand?.trim()) return requestedCommand.trim();

  const framework = detectFramework(workspaceRoot, frameworkHint);
  const pm = detectPackageManager(workspaceRoot);

  if (framework) {
    switch (framework.name) {
      case "vite":
        return buildExecCommand(pm, "vite", ["--host", "127.0.0.1", "--port", String(port)]);
      case "next":
        return buildExecCommand(pm, "next", ["dev", "--hostname", "127.0.0.1", "--port", String(port)]);
      case "nuxt":
        return buildExecCommand(pm, "nuxt", ["dev", "--host", "127.0.0.1", "--port", String(port)]);
      case "astro":
        return buildExecCommand(pm, "astro", ["dev", "--host", "127.0.0.1", "--port", String(port)]);
      default:
        return `${pm} run dev`;
    }
  }

  const pkg = loadPackageJson(workspaceRoot);
  if (!pkg) {
    throw new Error("No package.json found and no preview command was provided.");
  }
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  if (scripts.preview) return `${pm} run preview -- --host 127.0.0.1 --port ${port}`;
  if (scripts.dev) return `${pm} run dev`;

  throw new Error("Unable to detect a preview command. Provide one explicitly.");
}

export async function allocatePort(preferred?: number | null): Promise<number> {
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

export async function waitForHttp(url: string, timeoutMs = 45_000): Promise<void> {
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

function normalizeTargetUrl(target: string, port: number): string {
  const trimmed = target.trim();
  if (!trimmed) return `http://127.0.0.1:${port}/`;
  if (/^\d+$/.test(trimmed)) {
    return `http://127.0.0.1:${Number.parseInt(trimmed, 10)}/`;
  }
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase();
    if (!["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"].includes(host)) {
      return `http://127.0.0.1:${port}/`;
    }
    return url.toString();
  } catch {
    return `http://127.0.0.1:${port}/`;
  }
}

// ── LocalPreviewRunner ───────────────────────────────────────────────

export class LocalPreviewRunner implements PreviewRunner {
  readonly mode = "local" as const;

  async start(input: PreviewRunnerInput, onLog: PreviewLogCallback): Promise<PreviewRunnerResult> {
    const port = await allocatePort(input.port);
    const command = detectPreviewCommand(input.workspaceRoot, input.command ?? null, port, input.frameworkHint);
    const url = normalizeTargetUrl(input.target ?? "", port);

    onLog("system", `Running: ${command} (port ${port})`);

    const child = spawn(command, {
      cwd: input.workspaceRoot,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        HOSTNAME: "127.0.0.1",
        BROWSER: "none",
      },
      shell: true,
      stdio: "pipe",
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => onLog("stdout", chunk));
    child.stderr.on("data", (chunk: string) => onLog("stderr", chunk));
    child.on("error", (error) => onLog("stderr", error.message));

    try {
      await waitForHttp(url);
    } catch (err) {
      // Kill the child process so it doesn't leak
      if (!child.killed) child.kill("SIGTERM");
      throw err;
    }

    return {
      process: child,
      port,
      command,
      url,
      mode: "local",
      processId: child.pid,
    };
  }

  async stop(result: PreviewRunnerResult): Promise<void> {
    if (result.process && !result.process.killed) {
      result.process.kill("SIGTERM");
    }
  }
}

// ── DockerPreviewRunner (stub for Phase 2) ───────────────────────────

export class DockerPreviewRunner implements PreviewRunner {
  readonly mode = "docker" as const;

  async start(_input: PreviewRunnerInput, onLog: PreviewLogCallback): Promise<PreviewRunnerResult> {
    onLog("system", "Docker preview runner is not yet implemented. Use local runner.");
    throw new Error("Docker preview runner is not available in V1. Falling back to local runner.");
  }

  async stop(_result: PreviewRunnerResult): Promise<void> {
    // Docker cleanup will go here in Phase 2
  }
}

// ── Runner factory with fallback ─────────────────────────────────────

export function createPreviewRunner(preferDocker = false): PreviewRunner {
  if (preferDocker) {
    // Phase 2: attempt DockerPreviewRunner, fallback to local
    // For now, always use local
  }
  return new LocalPreviewRunner();
}
