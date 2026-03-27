import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
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
  mountMode?: SandboxMountMode;
}

export interface SandboxBrowserResult {
  containerName: string;
  novncUrl: string;
  vncPort: number;
  novncPort: number;
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
    const workspaceRoot = resolve(options.workspaceRoot);
    const novncPort = options.novncPort ?? 6080;
    const vncPort = options.vncPort ?? 5900;
    const mountArgs = this.buildMountArgs(workspaceRoot, options.mountMode ?? "read-only");

    const containerName = `jait-browser-sb-${Date.now().toString(36)}`;
    const cmd = [
      "docker",
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--network",
      "none",
      ...mountArgs,
      "-p",
      `${novncPort}:6080`,
      "-p",
      `${vncPort}:5900`,
      "jait/sandbox-browser:latest",
    ];

    const result = await this.runProcess(cmd, 30_000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start sandbox browser: ${result.output}`);
    }

    return {
      containerName,
      novncUrl: `http://127.0.0.1:${novncPort}/vnc.html`,
      vncPort,
      novncPort,
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
