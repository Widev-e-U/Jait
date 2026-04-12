import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer, createConnection } from "node:net";
import { resolve } from "node:path";

/**
 * Resolve the container runtime binary.  On Windows with Podman, `docker` is
 * only a PowerShell alias and cannot be used from `child_process.spawn`.
 * We probe for `docker` first then fall back to `podman`.
 */
let _containerBinary: string | null = null;
const SANDBOX_BROWSER_IMAGE = "jait/sandbox-browser:app-window-v1";

function containerBinary(): string {
  if (_containerBinary) return _containerBinary;
  for (const bin of ["docker", "podman"]) {
    try {
      execFileSync(bin, ["--version"], { stdio: "ignore", windowsHide: true, timeout: 5_000 });
      _containerBinary = bin;
      return bin;
    } catch {
      // not available
    }
  }
  _containerBinary = "docker"; // let the caller fail with a clear error
  return _containerBinary;
}

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
      containerBinary(),
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
    const novncPort = options.novncPort ?? await reserveLocalPort();
    const vncPort = options.vncPort ?? await reserveLocalPort();
    const cdpPort = options.cdpPort;
    const mountArgs = this.buildMountArgs(workspaceRoot, options.mountMode ?? "read-only");
    const networkArgs = options.networkEnabled === false ? ["--network", "none"] : [];
    const hostGatewayArgs = options.hostGateway
      ? ["--add-host", `host.docker.internal:${await resolveHostGatewayValue(this.runProcess)}`]
      : [];

    const containerName = `jait-browser-sb-${Date.now().toString(36)}`;
    const cmd = [
      containerBinary(),
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
      SANDBOX_BROWSER_IMAGE,
    ];

    let result = await this.runProcess(cmd, 30_000);
    if (result.exitCode !== 0 && isPortBindConflict(result.output)) {
      await this.cleanupConflictingBrowserSandboxes({
        novncPort,
        vncPort,
        cdpPort,
      });
      result = await this.runProcess(cmd, 30_000);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start sandbox browser: ${result.output}`);
    }

    // Port mappings are published on the host, so consumers must connect to the
    // host-side endpoint rather than mixing a host port with a container IP.
    const host = await resolvePublishedPortHost(this.runProcess);

    if (typeof cdpPort === "number" && options.waitForCdp !== false) {
      await waitForPort(host, cdpPort, 15_000);
      await waitForHttpReady(`http://${host}:${cdpPort}/json/version`, 15_000);
    }

    return {
      containerName,
      novncUrl: `http://${host}:${novncPort}/vnc_lite.html`,
      vncPort,
      novncPort,
      cdpUrl: typeof cdpPort === "number" ? `http://${host}:${cdpPort}` : undefined,
    };
  }

  async stopContainer(containerName: string): Promise<void> {
    const trimmed = containerName.trim();
    if (!trimmed) return;
    await this.runProcess([
      containerBinary(),
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
    const inspect = await this.runProcess([containerBinary(), "image", "inspect", SANDBOX_BROWSER_IMAGE], 15_000);
    if (inspect.exitCode === 0) return;
    await buildBrowserSandboxImage();
  }

  private async cleanupConflictingBrowserSandboxes(ports: {
    novncPort: number;
    vncPort: number;
    cdpPort?: number;
  }): Promise<void> {
    const list = await this.runProcess(
      [containerBinary(), "ps", "--format", "{{.Names}}\t{{.Ports}}"],
      15_000,
    );
    if (list.exitCode !== 0) return;
    const candidates = list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawName, portInfo = ""] = line.split("\t");
        const name = rawName?.trim() ?? "";
        return { name, portInfo };
      })
      .filter(({ name, portInfo }) =>
        /^jait-browser-sb-/.test(name)
        && [ports.novncPort, ports.vncPort, ports.cdpPort]
          .filter((value): value is number => typeof value === "number")
          .some((port) => new RegExp(`(^|[,: ])${port}->`).test(portInfo) || portInfo.includes(`:${port}->`)),
      );
    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
    }
  }
}

function isPortBindConflict(output: string): boolean {
  return /port is already allocated|address already in use|Bind for .* failed/i.test(output);
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
    [containerBinary(), "build", "-t", SANDBOX_BROWSER_IMAGE, "-f", "-", "."],
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
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Math.min(remaining, 5_000)),
      });
      if (response.ok) return;
    } catch {
      // Retry until the CDP endpoint responds.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
  }
  throw new Error(`HTTP endpoint ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Resolve the IP that containers should use to reach the Windows host.
 *
 * On Docker Desktop `host-gateway` works out of the box for `--add-host`.
 * On Podman + WSL2, `host-gateway` maps to `169.254.1.2` which silently drops
 * TCP traffic.  Instead we use the WSL VM's default gateway — the Windows host's
 * virtual-switch IP — which *is* routable from slirp4netns containers.
 */
async function resolveHostGatewayValue(
  runProcess: (cmd: string[], timeoutMs: number) => Promise<ProcessResult>,
): Promise<string> {
  if (process.platform !== "win32" || containerBinary() !== "podman") return "host-gateway";

  try {
    const machineList = await runProcess(
      [containerBinary(), "machine", "ls", "--format", "{{.Name}}"],
      10_000,
    );
    const rawName = machineList.output.trim().split(/\s+/)[0]?.replace(/\*$/, "") ?? "default";
    const wslDistro = rawName.startsWith("podman-machine-") ? rawName : `podman-machine-${rawName}`;

    const gw = await runProcess(
      ["wsl", "-d", wslDistro, "sh", "-c", "ip route 2>/dev/null | awk '/^default/{print $3}'"],
      10_000,
    );
    const gwMatch = gw.output.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
    if (gwMatch) return gwMatch[1]!;
  } catch { /* fall through */ }

  return "host-gateway";
}

/**
 * Determine the reachable IP for a container's forwarded ports.
 *
 * On native Docker Desktop, `127.0.0.1` works because Docker binds ports on the
 * host network.  On Podman + WSL, port forwarding goes through `wslrelay.exe`
 * (bound to `[::1]`) which frequently fails to relay TCP data.  In that case we
 * resolve to the WSL VM's IP that is directly routable from the Windows host.
 */
async function resolvePublishedPortHost(
  runProcess: (cmd: string[], timeoutMs: number) => Promise<ProcessResult>,
): Promise<string> {
  // Docker on Linux and Docker Desktop expose published ports on localhost.
  if (!(process.platform === "win32" && containerBinary() === "podman")) {
    return "127.0.0.1";
  }

  // Podman on WSL forwards ports through the WSL VM rather than localhost.
  // Use the VM's routable IP so the published ports are reachable.
  if (process.platform === "win32") {
    // Find the WSL distro backing Podman.
    const machineList = await runProcess(
      [containerBinary(), "machine", "ls", "--format", "{{.Name}}"],
      10_000,
    );
    // `podman machine ls` returns names like "podman-machine-default" or just
    // "default" depending on version.  The WSL distro is always prefixed with
    // "podman-machine-".
    const rawName = machineList.output.trim().split(/\s+/)[0]?.replace(/\*$/, "") ?? "default";
    const wslDistro = rawName.startsWith("podman-machine-") ? rawName : `podman-machine-${rawName}`;

    const wslIp = await runProcess(
      ["wsl", "-d", wslDistro, "sh", "-c", "ip -4 addr show eth0 2>/dev/null | sed -n 's/.*inet \\([0-9.]*\\).*/\\1/p'"],
      10_000,
    );
    // wsl may write path-translation warnings to stderr which gets mixed into
    // output.  Extract the first valid IPv4 address from the combined output.
    const ipMatch = wslIp.output.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
    if (ipMatch) return ipMatch[1]!;
  }

  // Fallback: localhost
  return "127.0.0.1";
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
  socat \\
  ca-certificates \\
  && rm -rf /var/lib/apt/lists/* \\
  && sed -i 's/#top_bar {/#top_bar { display:none !important;/' /usr/share/novnc/vnc_lite.html

RUN cat <<'EOF' >/usr/local/bin/jait-sandbox-browser.sh
#!/usr/bin/env bash
set -euo pipefail

export DISPLAY=:99

cleanup() {
  jobs -pr | xargs -r kill 2>/dev/null || true
}

trap cleanup EXIT INT TERM

Xvfb :99 -screen 0 1280x720x24 &

for _ in $(seq 1 50); do
  [[ -S /tmp/.X11-unix/X99 ]] && break
  sleep 0.1
done

chromium --no-sandbox --disable-gpu --disable-software-rasterizer --no-first-run --no-default-browser-check --window-size=1280,720 --window-position=0,0 --remote-debugging-port=9222 --app=about:blank &

(
  while true; do
    socat TCP-LISTEN:9223,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:9222
    sleep 1
  done
) &

(
  while true; do
    # x11vnc has been observed to segfault after client disconnects when XDamage
    # is enabled. Disable that path and auto-restart so the live-view endpoint
    # survives transient x11vnc crashes instead of breaking the preview session.
    x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -forever -shared -noxdamage -rfbport 5900
    echo "x11vnc exited with status $?; restarting in 1s" >&2
    sleep 1
  done
) &

exec websockify --web /usr/share/novnc/ 6080 localhost:5900
EOF

RUN chmod +x /usr/local/bin/jait-sandbox-browser.sh

EXPOSE 5900 6080 9223

CMD ["/usr/local/bin/jait-sandbox-browser.sh"]
`;
