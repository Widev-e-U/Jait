import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  projectRoot: string;
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

export function detectPackageManager(projectRoot: string): "bun" | "pnpm" | "npm" {
  let directory = resolve(projectRoot);
  while (true) {
    if (existsSync(join(directory, "bun.lock")) || existsSync(join(directory, "bun.lockb"))) return "bun";
    if (existsSync(join(directory, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(directory, "package-lock.json"))) return "npm";
    const parent = dirname(directory);
    if (parent === directory) return "npm";
    directory = parent;
  }
}

export function loadPackageJson(projectRoot: string): Record<string, any> | null {
  const file = join(projectRoot, "package.json");
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

/** Choose a single frontend workspace when a monorepo root is not itself a web app. */
export function resolvePreviewProjectRoot(projectRoot: string): string {
  const pkg = loadPackageJson(projectRoot);
  if (!pkg?.workspaces || detectFramework(projectRoot)) return projectRoot;
  const appsRoot = join(projectRoot, "apps");
  if (!existsSync(appsRoot)) return projectRoot;
  let appNames: string[];
  try {
    appNames = readdirSync(appsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return projectRoot;
  }
  const frontends = appNames
    .map((name) => join(appsRoot, name))
    .filter((root) => {
      const app = loadPackageJson(root);
      return Boolean(app?.scripts?.dev && detectFramework(root));
    });
  if (frontends.length === 1) return frontends[0]!;
  if (frontends.length > 1) {
    throw new Error(`Multiple frontend apps found: ${frontends.join(", ")}. Set projectRoot to the app to preview.`);
  }
  return projectRoot;
}

function isAllowedPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (!host) return false;
  if (["127.0.0.1", "localhost", "0.0.0.0", "::1"].includes(host)) return true;
  if (host.endsWith(".localhost")) return true;
  if (host === "host.docker.internal") return true;
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;
  const a = Number.parseInt(ipv4Match[1] ?? "", 10);
  const b = Number.parseInt(ipv4Match[2] ?? "", 10);
  if (![a, b].every((part) => Number.isFinite(part) && part >= 0 && part <= 255)) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
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
  if (packageManager === "bun") {
    return `bun run ${executable}${suffix}`;
  }
  return `pnpm exec ${executable}${suffix}`;
}

export function detectFramework(projectRoot: string, hint?: string | null): DetectedFramework | null {
  if (hint) {
    const lower = hint.toLowerCase();
    const pm = detectPackageManager(projectRoot);
    if (lower === "vite") return { name: "vite", devCommand: buildExecCommand(pm, "vite", []), likelyPort: 5173 };
    if (lower === "next" || lower === "nextjs") return { name: "next", devCommand: buildExecCommand(pm, "next", ["dev"]), likelyPort: 3000 };
    if (lower === "nuxt" || lower === "nuxtjs") return { name: "nuxt", devCommand: buildExecCommand(pm, "nuxt", ["dev"]), likelyPort: 3000 };
    if (lower === "remix") return { name: "remix", devCommand: `${pm} run dev`, likelyPort: 3000 };
    if (lower === "astro") return { name: "astro", devCommand: buildExecCommand(pm, "astro", ["dev"]), likelyPort: 4321 };
  }

  const pm = detectPackageManager(projectRoot);
  const pkg = loadPackageJson(projectRoot);
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, string>;

  // Config-file detection (works even without deps in package.json)
  if (existsSync(join(projectRoot, "vite.config.ts")) || existsSync(join(projectRoot, "vite.config.js"))) {
    return { name: "vite", devCommand: buildExecCommand(pm, "vite", []), likelyPort: 5173 };
  }
  if (existsSync(join(projectRoot, "next.config.ts")) || existsSync(join(projectRoot, "next.config.js")) || existsSync(join(projectRoot, "next.config.mjs"))) {
    return { name: "next", devCommand: buildExecCommand(pm, "next", ["dev"]), likelyPort: 3000 };
  }
  if (existsSync(join(projectRoot, "nuxt.config.ts")) || existsSync(join(projectRoot, "nuxt.config.js"))) {
    return { name: "nuxt", devCommand: buildExecCommand(pm, "nuxt", ["dev"]), likelyPort: 3000 };
  }
  if (existsSync(join(projectRoot, "astro.config.mjs")) || existsSync(join(projectRoot, "astro.config.ts"))) {
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

export function detectPreviewCommand(projectRoot: string, requestedCommand: string | null, port: number, frameworkHint?: string | null): string {
  if (requestedCommand?.trim()) return requestedCommand.trim();

  const framework = detectFramework(projectRoot, frameworkHint);
  const pm = detectPackageManager(projectRoot);

  if (framework) {
    switch (framework.name) {
      case "vite":
        return buildExecCommand(pm, "vite", ["--host", "0.0.0.0", "--port", String(port)]);
      case "next":
        return buildExecCommand(pm, "next", ["dev", "--hostname", "0.0.0.0", "--port", String(port)]);
      case "nuxt":
        return buildExecCommand(pm, "nuxt", ["dev", "--host", "0.0.0.0", "--port", String(port)]);
      case "astro":
        return buildExecCommand(pm, "astro", ["dev", "--host", "0.0.0.0", "--port", String(port)]);
      default:
        return `${pm} run dev`;
    }
  }

  const pkg = loadPackageJson(projectRoot);
  if (!pkg) {
    throw new Error("No package.json found and no preview command was provided.");
  }
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  if (scripts.preview) return `${pm} run preview -- --host 0.0.0.0 --port ${port}`;
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

export async function waitForHttp(url: string, timeoutMs = 45_000, signal?: AbortSignal): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) throw signal.reason;
    try {
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
        : AbortSignal.timeout(3000);
      const response = await fetch(url, { signal: requestSignal });
      if (response.ok || response.status < 500) return;
    } catch {
      if (signal?.aborted) throw signal.reason;
    }
    await new Promise<void>((resolve) => {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, 1000);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
  if (signal?.aborted) throw signal.reason;
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
    if (!isAllowedPreviewHost(url.hostname)) {
      return `http://127.0.0.1:${port}/`;
    }
    return url.toString();
  } catch {
    return `http://127.0.0.1:${port}/`;
  }
}

function stopProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    }
  }
  if (!child.killed) child.kill("SIGTERM");
}

// ── LocalPreviewRunner ───────────────────────────────────────────────

export class LocalPreviewRunner implements PreviewRunner {
  readonly mode = "local" as const;

  async start(input: PreviewRunnerInput, onLog: PreviewLogCallback): Promise<PreviewRunnerResult> {
    const projectRoot = input.command || input.frameworkHint
      ? input.projectRoot
      : resolvePreviewProjectRoot(input.projectRoot);
    const port = await allocatePort(input.port);
    const command = detectPreviewCommand(projectRoot, input.command ?? null, port, input.frameworkHint);
    const url = normalizeTargetUrl(input.target ?? "", port);

    if (projectRoot !== input.projectRoot) onLog("system", `Using frontend app: ${projectRoot}`);
    onLog("system", `Running: ${command} (port ${port})`);

    const child = spawn(command, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "0.0.0.0",
        HOSTNAME: "0.0.0.0",
        BROWSER: "none",
      },
      shell: true,
      detached: process.platform !== "win32",
      stdio: "pipe",
      windowsHide: true,
    });

    const startupAbort = new AbortController();
    let lastOutput = "";
    const capture = (stream: "stdout" | "stderr", chunk: string) => {
      onLog(stream, chunk);
      lastOutput = (lastOutput + chunk).slice(-500).trim();
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: string) => capture("stderr", chunk));
    child.on("error", (error) => {
      capture("stderr", error.message);
      startupAbort.abort(error);
    });
    child.once("exit", (code, signal) => {
      startupAbort.abort(new Error(
        `Preview command exited before the server was ready (code=${code ?? "null"}, signal=${signal ?? "null"}).${lastOutput ? ` Last output: ${lastOutput}` : ""}`,
      ));
    });

    try {
      await waitForHttp(url, 45_000, startupAbort.signal);
      if (startupAbort.signal.aborted) throw startupAbort.signal.reason;
    } catch (err) {
      stopProcessTree(child);
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
    if (result.process) stopProcessTree(result.process);
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
