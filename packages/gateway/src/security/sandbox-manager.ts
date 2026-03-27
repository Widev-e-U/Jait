import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer, createConnection } from "node:net";
import { resolve } from "node:path";

export type SandboxMountMode = "none" | "read-only" | "read-write";

export interface SandboxRunOptions {
  command: string;
  workspaceRoot: string;
  timeoutMs: number;
  mountMode?: SandboxMountMode;
  networkEnabled?: boolean;
  memoryLimitMb?: number;
  cpuLimit?: string;
}

export interface SandboxRunResult {
  ok: boolean;
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  containerName: string;
}

export interface SandboxBrowserOptions {
  workspaceRoot: string;
  novncPort?: number;
  vncPort?: number;
  cdpPort?: number;
  waitForCdp?: boolean;
  mountMode?: SandboxMountMode;
  networkEnabled?: boolean;
  hostGateway?: boolean;
}

export interface SandboxBrowserResult {
  containerName: string;
  novncUrl: string;
  vncPort: number;
  novncPort: number;
  cdpUrl?: string;
}

interface ProcessResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
}

export class SandboxManager {
  constructor(
    private readonly runProcess: (cmd: string[], timeoutMs: number) => Promise<ProcessResult> = runDockerProcess,
  ) {}

  async runCommand(options: SandboxRunOptions): Promise<SandboxRunResult> {
    const workspaceRoot = resolve(options.workspaceRoot);
    const mountMode = options.mountMode ?? "read-write";
    const containerName = `jait-sb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = Math.max(1000, options.timeoutMs);

    const mountArgs = this.buildMountArgs(workspaceRoot, mountMode);
    const networkArgs = options.networkEnabled === false ? ["--network", "none"] : [];
    const memoryArgs = options.memoryLimitMb ? ["--memory", `${options.memoryLimitMb}m`] : [];
    const cpuArgs = options.cpuLimit ? ["--cpus", options.cpuLimit] : [];

    const cmd = [
      "docker",
      "run",
      "--rm",
      "--name",
      containerName,
      ...networkArgs,
      ...memoryArgs,
      ...cpuArgs,
      ...mountArgs,
      "-w",
      "/workspace",
      "jait/sandbox:latest",
      "bash",
      "-lc",
      options.command,
    ];

    const result = await this.runProcess(cmd, timeoutMs);
    return {
      ok: !result.timedOut && result.exitCode === 0,
      output: result.output,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      containerName,
    };
  }

  async startBrowserSandbox(options: SandboxBrowserOptions): Promise<SandboxBrowserResult> {
    await this.ensureBrowserSandboxImage();
    const workspaceRoot = resolve(options.workspaceRoot);
    const novncPort = options.novncPort ?? 6080;
    const vncPort = options.vncPort ?? 5900;
    const cdpPort = options.cdpPort;
    const mountArgs = this.buildMountArgs(workspaceRoot, options.mountMode ?? "read-only");
    const networkArgs = options.networkEnabled === false ? ["--network", "none"] : [];
    const hostGatewayArgs = options.hostGateway ? ["--add-host", "host.docker.internal:host-gateway"] : [];

    const containerName = `jait-browser-sb-${Date.now().toString(36)}`;
    const cmd = [
      "docker",
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      ...networkArgs,
      ...hostGatewayArgs,
      ...mountArgs,
      "-p",
      `${novncPort}:6080`,
      "-p",
      `${vncPort}:5900`,
      ...(typeof cdpPort === "number" ? ["-p", `${cdpPort}:9223`] : []),
      "jait/sandbox-browser:latest",
    ];

    const result = await this.runProcess(cmd, 30_000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start sandbox browser: ${result.output}`);
    }

    if (typeof cdpPort === "number" && options.waitForCdp !== false) {
      await waitForPort("127.0.0.1", cdpPort, 15_000);
      await waitForHttpReady(`http://127.0.0.1:${cdpPort}/json/version`, 15_000);
    }

    return {
      containerName,
      novncUrl: `http://127.0.0.1:${novncPort}/vnc.html`,
      vncPort,
      novncPort,
      cdpUrl: typeof cdpPort === "number" ? `http://127.0.0.1:${cdpPort}` : undefined,
    };
  }

  async stopContainer(containerName: string): Promise<void> {
    const trimmed = containerName.trim();
    if (!trimmed) return;
    await this.runProcess([
      "docker",
      "rm",
      "-f",
      trimmed,
    ], 15_000);
  }

  private buildMountArgs(workspaceRoot: string, mode: SandboxMountMode): string[] {
    mkdirSync(workspaceRoot, { recursive: true });
    if (mode === "none") return [];
    const readOnly = mode === "read-only" ? ":ro" : "";
    return ["-v", `${workspaceRoot}:/workspace${readOnly}`];
  }

  private async ensureBrowserSandboxImage(): Promise<void> {
    const inspect = await this.runProcess(["docker", "image", "inspect", "jait/sandbox-browser:latest"], 15_000);
    if (inspect.exitCode === 0) return;
    await buildBrowserSandboxImage();
  }
}

async function runDockerProcess(cmd: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolveResult) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolveResult({ output: `${output}\n${err.message}`.trim(), exitCode: null, timedOut });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({ output: output.trim() || "(no output)", exitCode: code, timedOut });
    });
  });
}

async function buildBrowserSandboxImage(): Promise<void> {
  const result = await runProcessWithInput(
    ["docker", "build", "-t", "jait/sandbox-browser:latest", "-f", "-", "."],
    10 * 60_000,
    SANDBOX_BROWSER_DOCKERFILE,
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to build sandbox browser image: ${result.output}`);
  }
}

async function runProcessWithInput(cmd: string[], timeoutMs: number, input: string): Promise<ProcessResult> {
  return new Promise<ProcessResult>((resolveResult) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolveResult({ output: `${output}\n${err.message}`.trim(), exitCode: null, timedOut });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({ output: output.trim() || "(no output)", exitCode: code, timedOut });
    });

    child.stdin.end(input);
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolveConnection) => {
      const socket = createConnection({ host, port });
      const done = (ok: boolean) => {
        socket.destroy();
        resolveConnection(ok);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
    });
    if (connected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`Port ${port} on ${host} did not become ready within ${timeoutMs}ms`);
}

async function waitForHttpReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the CDP endpoint responds.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`HTTP endpoint ${url} did not become ready within ${timeoutMs}ms`);
}

export async function reserveLocalPort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve a port")));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

const SANDBOX_BROWSER_DOCKERFILE = `FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \\
  chromium \\
  x11vnc \\
  xvfb \\
  websockify \\
  novnc \\
  fluxbox \\
  ca-certificates \\
  && rm -rf /var/lib/apt/lists/*

EXPOSE 5900 6080 9223

CMD ["bash", "-lc", "export DISPLAY=:99; Xvfb :99 -screen 0 1280x720x24 & sleep 1; fluxbox & chromium --no-sandbox --disable-gpu --remote-debugging-port=9222 about:blank & socat TCP-LISTEN:9223,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:9222 & x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -forever -shared -rfbport 5900 & websockify --web /usr/share/novnc/ 6080 localhost:5900"]
`;
