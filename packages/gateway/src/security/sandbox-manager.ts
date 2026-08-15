import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer, createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

/**
 * Resolve the container runtime binary.  On Windows with Podman, `docker` is
 * only a PowerShell alias and cannot be used from `child_process.spawn`.
 * We probe for `docker` first then fall back to `podman`.
 */
let _containerBinary: string | null = null;
const SANDBOX_BROWSER_IMAGE = "jait/sandbox-browser:app-window-v1";
const BROWSER_SANDBOX_NAME_PREFIX = "jait-browser-sb-";
const BROWSER_SANDBOX_HEALTH_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_BROWSER_SANDBOXES = 1;

const WINDOWS_SANDBOX_IMAGE = "jait/windows-sandbox:latest";
const WINDOWS_SANDBOX_NAME_PREFIX = "jait-windows-sb-";
const WINDOWS_SANDBOX_HEALTH_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_WINDOWS_SANDBOXES = 1;

const LINUX_DESKTOP_SANDBOX_IMAGE = "jait/sandbox-linux-desktop:latest";
const LINUX_DESKTOP_SANDBOX_NAME_PREFIX = "jait-linux-desktop-sb-";
const LINUX_DESKTOP_SANDBOX_HEALTH_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_LINUX_DESKTOP_SANDBOXES = 1;
// Devices passed through to the Windows VM.  Only devices that exist on the
// host are mounted; /dev/kvm is mandatory, the rest are optional accelerators.
const WINDOWS_SANDBOX_DEVICES = ["/dev/kvm", "/dev/vhost-net", "/dev/net/tun"];

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
  projectRoot: string;
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

export interface SandboxSessionOptions {
  projectRoot: string;
  mountMode?: SandboxMountMode;
  networkEnabled?: boolean;
  memoryLimitMb?: number;
  cpuLimit?: string;
}

export interface SandboxSessionResult {
  containerName: string;
  projectRoot: string;
  sandboxProjectRoot: string;
}

export interface SandboxExecOptions {
  containerName: string;
  command: string;
  timeoutMs: number;
}

/** Options for running a shell command inside a running OS sandbox. */
export interface SandboxShellOptions {
  containerName: string;
  command: string;
  /** Working directory inside the container. Defaults to the container HOME. */
  cwd?: string;
  /** Extra environment variables (KEY=VALUE) to pass to the command. */
  env?: Record<string, string>;
  timeoutMs?: number;
}

/** A running OS sandbox discovered by the sandbox manager. */
export interface OsSandboxInfo {
  containerName: string;
  /** Which desktop OS this sandbox runs. */
  type: "linux-desktop" | "windows";
  /** `true` when the container is currently running. */
  running: boolean;
  /** Published host port for the Linux desktop VNC server (container 5900). */
  vncPort?: number;
  /** Published host port for the Linux desktop noVNC web viewer (container 6080). */
  novncPort?: number;
  /** Published host port for the Windows VM RDP (container 3389/tcp). */
  rdpPort?: number;
  /** Published host port for the Windows VM web viewer (container 8006). */
  webViewerPort?: number;
  /** Published host port for the Windows VM SSH (container 22). */
  sshPort?: number;
}

export interface SandboxBrowserOptions {
  projectRoot: string;
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

export interface BrowserSandboxCleanupOptions {
  maxAgeMs?: number;
  excludeNames?: Iterable<string>;
}

export interface WindowsSandboxOptions {
  /** Host port for RDP (default: a reserved free port). */
  rdpPort?: number;
  /** Host port for the web viewer (default: a reserved free port). */
  webViewerPort?: number;
  /** Windows version to install: "11", "10", "11l", "10l", ... (default "11"). */
  version?: string;
  /** VM RAM, dockur format e.g. "6G" (default "6G" = 6442450944 bytes). */
  ramSize?: string;
  /** VM CPU cores (default 4). */
  cpuCores?: number;
  /** VM disk size, dockur format e.g. "64G" (default "64G"). */
  diskSize?: string;
  /** Host directory for the VM disk (/storage). Defaults to a per-sandbox dir under the sandbox storage root. */
  storageDir?: string;
  /** Windows username created during install (default "Docker"). */
  username?: string;
  /** Windows password created during install (default "admin"). */
  password?: string;
  /** Host SSH port for the VM (container port 22; default: a reserved free port). */
  sshPort?: number;
  /** SSH account username provisioned in the VM (dockur SSH_USERNAME). Defaults to the Windows username. */
  sshUsername?: string;
  /** SSH account password provisioned in the VM (dockur SSH_PASSWORD). Defaults to the Windows password. */
  sshPassword?: string;
  /** Block until the web viewer port accepts connections (default false). */
  waitForWebViewer?: boolean;
}

export interface WindowsSandboxResult {
  containerName: string;
  /** Stable identifier for this sandbox (equals containerName). */
  browserId: string;
  rdpPort: number;
  webViewerPort: number;
  rdpUrl: string;
  webViewerUrl: string;
  /** "starting" until the web viewer is reachable, then "running". */
  status: "starting" | "running";
  version: string;
  storageDir: string;
  /** Host SSH port for the VM (container port 22). */
  sshPort: number;
  /** SSH username provisioned inside the VM (dockur SSH_USERNAME). */
  sshUsername: string;
  /** SSH password provisioned inside the VM (dockur SSH_PASSWORD). */
  sshPassword: string;
}

export interface WindowsSandboxStopOptions {
  /** Also delete the VM disk directory (only safe paths under the sandbox storage root are removed). */
  removeStorage?: boolean;
}

export interface LinuxDesktopSandboxOptions {
  projectRoot: string;
  /** Host port for noVNC (default: a reserved free port). */
  novncPort?: number;
  /** Host port for VNC (default: a reserved free port). */
  vncPort?: number;
  /** Host port for Chromium CDP (default: not published). */
  cdpPort?: number;
  /** Block until the CDP endpoint accepts connections (default true when cdpPort is set). */
  waitForCdp?: boolean;
  mountMode?: SandboxMountMode;
  networkEnabled?: boolean;
  hostGateway?: boolean;
  /** Xvfb screen geometry, e.g. "1920x1080x24" (default "1920x1080x24"). */
  screenRes?: string;
}

export interface LinuxDesktopSandboxResult {
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
    const projectRoot = resolve(options.projectRoot);
    const mountMode = options.mountMode ?? "read-write";
    const containerName = `jait-sb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const timeoutMs = Math.max(1000, options.timeoutMs);

    const mountArgs = this.buildMountArgs(projectRoot, mountMode);
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
      "/project",
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

  async startCommandSandbox(options: SandboxSessionOptions): Promise<SandboxSessionResult> {
    const projectRoot = resolve(options.projectRoot);
    const mountMode = options.mountMode ?? "read-write";
    const containerName = `jait-agent-sb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const mountArgs = this.buildMountArgs(projectRoot, mountMode);
    const networkArgs = options.networkEnabled === false ? ["--network", "none"] : [];
    const memoryArgs = options.memoryLimitMb ? ["--memory", `${options.memoryLimitMb}m`] : [];
    const cpuArgs = options.cpuLimit ? ["--cpus", options.cpuLimit] : [];

    const cmd = [
      containerBinary(),
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      ...networkArgs,
      ...memoryArgs,
      ...cpuArgs,
      ...mountArgs,
      "-w",
      "/project",
      "jait/sandbox:latest",
      "tail",
      "-f",
      "/dev/null",
    ];

    const result = await this.runProcess(cmd, 30_000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start command sandbox: ${result.output}`);
    }

    return {
      containerName,
      projectRoot,
      sandboxProjectRoot: "/project",
    };
  }

  async execInContainer(options: SandboxExecOptions): Promise<SandboxRunResult> {
    const containerName = options.containerName.trim();
    const timeoutMs = Math.max(1000, options.timeoutMs);
    const cmd = [
      containerBinary(),
      "exec",
      "-w",
      "/project",
      containerName,
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

  /**
   * Run a shell command inside a running OS sandbox (Linux desktop or Windows
   * dockur container) without forcing a `/project` working directory.  This is
   * the primitive used by the os.* control drivers.
   */
  async execShell(options: SandboxShellOptions): Promise<SandboxRunResult> {
    const containerName = options.containerName.trim();
    const timeoutMs = Math.max(1000, options.timeoutMs ?? 30_000);
    const cwdArgs = options.cwd ? ["-w", options.cwd] : [];
    const envArgs = Object.entries(options.env ?? {}).map(([k, v]) => ["--env", `${k}=${v}`]).flat();
    const cmd = [
      containerBinary(),
      "exec",
      ...cwdArgs,
      ...envArgs,
      containerName,
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

  /**
   * Discover running OS sandboxes (Linux desktop and Windows dockur containers)
   * so the os.* control tools can resolve a container to its driver. The
   * published host ports (VNC/noVNC for Linux; RDP/web viewer/SSH for Windows)
   * are parsed from the docker ps Ports column so os.sandbox list reports the
   * real endpoints.
   */
  async listRunningOsSandboxes(): Promise<OsSandboxInfo[]> {
    const list = await this.runProcess(
      [containerBinary(), "ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Ports}}"],
      15_000,
    );
    if (list.exitCode !== 0) return [];

    return list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = "", , ports = ""] = line.split("\t");
        const trimmed = name.trim();
        if (trimmed.startsWith(LINUX_DESKTOP_SANDBOX_NAME_PREFIX)) {
          return {
            containerName: trimmed,
            type: "linux-desktop",
            running: true,
            vncPort: parsePublishedPort(ports, 5900),
            novncPort: parsePublishedPort(ports, 6080),
          } as OsSandboxInfo;
        }
        if (trimmed.startsWith(WINDOWS_SANDBOX_NAME_PREFIX)) {
          return {
            containerName: trimmed,
            type: "windows",
            running: true,
            rdpPort: parsePublishedPort(ports, 3389),
            webViewerPort: parsePublishedPort(ports, 8006),
            sshPort: parsePublishedPort(ports, 22),
          } as OsSandboxInfo;
        }
        return null;
      })
      .filter((item): item is OsSandboxInfo => Boolean(item));
  }

  async startBrowserSandbox(options: SandboxBrowserOptions): Promise<SandboxBrowserResult> {
    await this.assertBrowserSandboxStartAllowed();
    await this.ensureBrowserSandboxImage();
    const projectRoot = resolve(options.projectRoot);
    const novncPort = options.novncPort ?? await reserveLocalPort();
    const vncPort = options.vncPort ?? await reserveLocalPort();
    const cdpPort = options.cdpPort;
    const mountArgs = this.buildMountArgs(projectRoot, options.mountMode ?? "read-only");
    const networkArgs = options.networkEnabled === false ? ["--network", "none"] : [];
    const hostGatewayArgs = options.hostGateway
      ? ["--add-host", `host.docker.internal:${await resolveHostGatewayValue(this.runProcess)}`]
      : [];

    const containerName = `${BROWSER_SANDBOX_NAME_PREFIX}${Date.now().toString(36)}`;
    const createdAt = String(Date.now());
    const cmd = [
      containerBinary(),
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--label",
      "jait.kind=browser-sandbox",
      "--label",
      `jait.createdAt=${createdAt}`,
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

  async cleanupBrowserSandboxes(options: BrowserSandboxCleanupOptions = {}): Promise<string[]> {
    const excluded = new Set([...options.excludeNames ?? []].map((name) => name.trim()).filter(Boolean));
    const list = await this.runProcess(
      [containerBinary(), "ps", "--filter", `name=${BROWSER_SANDBOX_NAME_PREFIX}`, "--format", "{{.Names}}\t{{.CreatedAt}}\t{{.Labels}}"],
      15_000,
    );
    if (list.exitCode !== 0) return [];

    const now = Date.now();
    const stopped: string[] = [];
    const candidates = list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseBrowserSandboxListing(line))
      .filter((item): item is BrowserSandboxListing => Boolean(item))
      .filter((item) => item.name.startsWith(BROWSER_SANDBOX_NAME_PREFIX) && !excluded.has(item.name))
      .filter((item) => {
        if (typeof options.maxAgeMs !== "number") return true;
        const createdAtMs = parseBrowserSandboxCreatedAt(item.createdAt, item.labels);
        return createdAtMs === null || now - createdAtMs >= options.maxAgeMs;
      });

    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
      stopped.push(candidate.name);
    }
    return stopped;
  }

  /**
   * Start a Windows VM sandbox (dockur/windows) for browser testing.
   *
   * The VM is accelerated with KVM and exposes RDP (3389) plus a web viewer
   * (8006).  The first start downloads the Windows ISO and performs a
   * hands-free install, which can take 10-30 minutes; the disk image persists
   * in the returned storageDir so later starts boot straight into Windows.
   */
  async startWindowsSandbox(options: WindowsSandboxOptions = {}): Promise<WindowsSandboxResult> {
    await this.assertWindowsSandboxStartAllowed();
    await this.ensureWindowsSandboxImage();

    const rdpPort = options.rdpPort ?? await reserveLocalPort();
    const webViewerPort = options.webViewerPort ?? await reserveLocalPort();
    const sshPort = options.sshPort ?? await reserveLocalPort();
    const version = options.version ?? "11";
    const ramSize = options.ramSize ?? "6G"; // 6 GiB = 6442450944 bytes
    const cpuCores = options.cpuCores ?? 4;
    const diskSize = options.diskSize ?? "64G";
    // Provision the VM's OpenSSH server with the same account the sandbox
    // start tool uses for the Windows login, so the os.* Windows driver has
    // one known credential set. Falls back to the image defaults (Docker/admin).
    const sshUsername = options.sshUsername ?? options.username ?? "Docker";
    const sshPassword = options.sshPassword ?? options.password ?? "admin";

    const containerName = `${WINDOWS_SANDBOX_NAME_PREFIX}${Date.now().toString(36)}`;
    const createdAt = String(Date.now());
    const storageDir = resolve(options.storageDir ?? join(windowsSandboxStorageRoot(), containerName));
    mkdirSync(storageDir, { recursive: true });

    // Mount only the KVM-related devices that actually exist on the host.
    // /dev/kvm is mandatory; /dev/vhost-net and /dev/net/tun are optional
    // accelerators (vhost-net for virtio-net, tun for NAT networking).
    const devices = WINDOWS_SANDBOX_DEVICES.filter((device) => existsSync(device));
    const deviceArgs = devices.flatMap((device) => ["--device", device]);
    const capArgs = devices.includes("/dev/net/tun") ? ["--cap-add", "NET_ADMIN"] : [];

    const cmd = [
      containerBinary(),
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--label",
      "jait.kind=windows-sandbox",
      "--label",
      `jait.createdAt=${createdAt}`,
      // Graceful Windows shutdown: dockur needs up to 2 minutes to stop QEMU.
      "--stop-timeout",
      "120",
      ...deviceArgs,
      ...capArgs,
      "-e",
      `VERSION=${version}`,
      "-e",
      `RAM_SIZE=${ramSize}`,
      "-e",
      `CPU_CORES=${cpuCores}`,
      "-e",
      `DISK_SIZE=${diskSize}`,
      ...(options.username ? ["-e", `USERNAME=${options.username}`] : []),
      ...(options.password ? ["-e", `PASSWORD=${options.password}`] : []),
      // SSH channel for the os.* Windows driver: dockur forwards the VM's
      // OpenSSH (guest port 22) to the container's port 22, which we publish.
      "-e",
      `SSH_USERNAME=${sshUsername}`,
      "-e",
      `SSH_PASSWORD=${sshPassword}`,
      "-p",
      `${sshPort}:22`,
      "-p",
      `${rdpPort}:3389/tcp`,
      "-p",
      `${rdpPort}:3389/udp`,
      "-p",
      `${webViewerPort}:8006`,
      "-v",
      `${storageDir}:/storage`,
      WINDOWS_SANDBOX_IMAGE,
    ];

    let result = await this.runProcess(cmd, 30_000);
    if (result.exitCode !== 0 && isPortBindConflict(result.output)) {
      await this.cleanupConflictingWindowsSandboxes({ rdpPort, webViewerPort });
      result = await this.runProcess(cmd, 30_000);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start Windows sandbox: ${result.output}`);
    }

    // Port mappings are published on the host, so consumers must connect to the
    // host-side endpoint rather than mixing a host port with a container IP.
    const host = await resolvePublishedPortHost(this.runProcess);

    let status: WindowsSandboxResult["status"] = "starting";
    if (options.waitForWebViewer) {
      await waitForPort(host, webViewerPort, 60_000);
      status = "running";
    }

    return {
      containerName,
      browserId: containerName,
      rdpPort,
      webViewerPort,
      rdpUrl: `rdp://${host}:${rdpPort}`,
      webViewerUrl: `http://${host}:${webViewerPort}/`,
      status,
      version,
      storageDir,
      sshPort,
      sshUsername,
      sshPassword,
    };
  }

  /**
   * Stop and remove a Windows sandbox container.  With `removeStorage: true`
   * the VM disk directory is deleted as well (only paths under the sandbox
   * storage root are ever removed).
   */
  async stopWindowsSandbox(containerName: string, options: WindowsSandboxStopOptions = {}): Promise<void> {
    const trimmed = containerName.trim();
    if (!trimmed) return;

    let storageDir: string | null = null;
    if (options.removeStorage) {
      const inspect = await this.runProcess(
        [containerBinary(), "inspect", trimmed, "--format", "{{range .Mounts}}{{.Source}}{{end}}"],
        15_000,
      );
      if (inspect.exitCode === 0 && inspect.output.trim()) {
        storageDir = inspect.output.trim();
      }
    }

    await this.stopContainer(trimmed);

    if (storageDir && isWindowsSandboxStorageDir(storageDir)) {
      rmSync(storageDir, { recursive: true, force: true });
    }
  }

  async cleanupWindowsSandboxes(options: BrowserSandboxCleanupOptions = {}): Promise<string[]> {
    const excluded = new Set([...options.excludeNames ?? []].map((name) => name.trim()).filter(Boolean));
    const list = await this.runProcess(
      [containerBinary(), "ps", "--filter", `name=${WINDOWS_SANDBOX_NAME_PREFIX}`, "--format", "{{.Names}}\t{{.CreatedAt}}\t{{.Labels}}"],
      15_000,
    );
    if (list.exitCode !== 0) return [];

    const now = Date.now();
    const stopped: string[] = [];
    const candidates = list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseBrowserSandboxListing(line))
      .filter((item): item is BrowserSandboxListing => Boolean(item))
      .filter((item) => item.name.startsWith(WINDOWS_SANDBOX_NAME_PREFIX) && !excluded.has(item.name))
      .filter((item) => {
        if (typeof options.maxAgeMs !== "number") return true;
        const createdAtMs = parseBrowserSandboxCreatedAt(item.createdAt, item.labels);
        return createdAtMs === null || now - createdAtMs >= options.maxAgeMs;
      });

    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
      stopped.push(candidate.name);
    }
    return stopped;
  }

  /**
   * Start a Linux desktop sandbox (XFCE + Chromium + Firefox) for interactive
   * testing.  Exposes the same port conventions as the browser sandbox:
   * 5900 (VNC), 6080 (noVNC), 9223 (Chromium CDP).
   */
  async startLinuxDesktopSandbox(options: LinuxDesktopSandboxOptions): Promise<LinuxDesktopSandboxResult> {
    await this.assertLinuxDesktopSandboxStartAllowed();
    await this.ensureLinuxDesktopSandboxImage();
    const projectRoot = resolve(options.projectRoot);
    const novncPort = options.novncPort ?? await reserveLocalPort();
    const vncPort = options.vncPort ?? await reserveLocalPort();
    const cdpPort = options.cdpPort;
    const mountArgs = this.buildMountArgs(projectRoot, options.mountMode ?? "read-only");
    const networkArgs = options.networkEnabled === false ? ["--network", "none"] : [];
    const hostGatewayArgs = options.hostGateway
      ? ["--add-host", `host.docker.internal:${await resolveHostGatewayValue(this.runProcess)}`]
      : [];
    const screenResArgs = options.screenRes ? ["-e", `SCREEN_RES=${options.screenRes}`] : [];

    const containerName = `${LINUX_DESKTOP_SANDBOX_NAME_PREFIX}${Date.now().toString(36)}`;
    const createdAt = String(Date.now());
    const cmd = [
      containerBinary(),
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--label",
      "jait.kind=linux-desktop-sandbox",
      "--label",
      `jait.createdAt=${createdAt}`,
      // Chromium needs a larger /dev/shm than Docker's 64MB default.
      "--shm-size",
      "1gb",
      ...networkArgs,
      ...hostGatewayArgs,
      ...mountArgs,
      ...screenResArgs,
      "-p",
      `${novncPort}:6080`,
      "-p",
      `${vncPort}:5900`,
      ...(typeof cdpPort === "number" ? ["-p", `${cdpPort}:9223`] : []),
      LINUX_DESKTOP_SANDBOX_IMAGE,
    ];

    let result = await this.runProcess(cmd, 30_000);
    if (result.exitCode !== 0 && isPortBindConflict(result.output)) {
      await this.cleanupConflictingLinuxDesktopSandboxes({
        novncPort,
        vncPort,
        cdpPort,
      });
      result = await this.runProcess(cmd, 30_000);
    }
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start Linux desktop sandbox: ${result.output}`);
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

  /** Stop and remove a Linux desktop sandbox container. */
  async stopLinuxDesktopSandbox(containerName: string): Promise<void> {
    await this.stopContainer(containerName);
  }

  async cleanupLinuxDesktopSandboxes(options: BrowserSandboxCleanupOptions = {}): Promise<string[]> {
    const excluded = new Set([...options.excludeNames ?? []].map((name) => name.trim()).filter(Boolean));
    const list = await this.runProcess(
      [containerBinary(), "ps", "--filter", `name=${LINUX_DESKTOP_SANDBOX_NAME_PREFIX}`, "--format", "{{.Names}}\t{{.CreatedAt}}\t{{.Labels}}"],
      15_000,
    );
    if (list.exitCode !== 0) return [];

    const now = Date.now();
    const stopped: string[] = [];
    const candidates = list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseBrowserSandboxListing(line))
      .filter((item): item is BrowserSandboxListing => Boolean(item))
      .filter((item) => item.name.startsWith(LINUX_DESKTOP_SANDBOX_NAME_PREFIX) && !excluded.has(item.name))
      .filter((item) => {
        if (typeof options.maxAgeMs !== "number") return true;
        const createdAtMs = parseBrowserSandboxCreatedAt(item.createdAt, item.labels);
        return createdAtMs === null || now - createdAtMs >= options.maxAgeMs;
      });

    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
      stopped.push(candidate.name);
    }
    return stopped;
  }

  async assertLinuxDesktopSandboxStartAllowed(): Promise<void> {
    const health = await this.runProcess(
      [containerBinary(), "info", "--format", "{{.ServerVersion}}"],
      LINUX_DESKTOP_SANDBOX_HEALTH_TIMEOUT_MS,
    );
    if (health.timedOut || health.exitCode !== 0) {
      const reason = health.timedOut ? "timed out" : health.output;
      throw new Error(`Linux desktop sandbox disabled: container runtime health check failed (${reason})`);
    }

    const maxSandboxes = readMaxLinuxDesktopSandboxes();
    const active = await this.listLinuxDesktopSandboxContainers();
    if (active.length >= maxSandboxes) {
      throw new Error(
        `Linux desktop sandbox limit reached (${active.length} active, max ${maxSandboxes}). `
        + "Refusing to start another desktop sandbox.",
      );
    }
  }

  async assertWindowsSandboxStartAllowed(): Promise<void> {
    if (!existsSync("/dev/kvm")) {
      throw new Error(
        "Windows sandbox disabled: /dev/kvm is not available on this host. "
        + "KVM acceleration is required to run a Windows VM (dockur/windows).",
      );
    }

    const health = await this.runProcess(
      [containerBinary(), "info", "--format", "{{.ServerVersion}}"],
      WINDOWS_SANDBOX_HEALTH_TIMEOUT_MS,
    );
    if (health.timedOut || health.exitCode !== 0) {
      const reason = health.timedOut ? "timed out" : health.output;
      throw new Error(`Windows sandbox disabled: container runtime health check failed (${reason})`);
    }

    const maxSandboxes = readMaxWindowsSandboxes();
    const active = await this.listWindowsSandboxContainers();
    if (active.length >= maxSandboxes) {
      throw new Error(
        `Windows sandbox limit reached (${active.length} active, max ${maxSandboxes}). `
        + "Refusing to start another Windows VM.",
      );
    }
  }

  async assertBrowserSandboxStartAllowed(): Promise<void> {
    const health = await this.runProcess(
      [containerBinary(), "info", "--format", "{{.ServerVersion}}"],
      BROWSER_SANDBOX_HEALTH_TIMEOUT_MS,
    );
    if (health.timedOut || health.exitCode !== 0) {
      const reason = health.timedOut ? "timed out" : health.output;
      throw new Error(`Browser sandbox disabled: container runtime health check failed (${reason})`);
    }

    const maxSandboxes = readMaxBrowserSandboxes();
    const active = await this.listBrowserSandboxContainers();
    if (active.length >= maxSandboxes) {
      throw new Error(
        `Browser sandbox limit reached (${active.length} active, max ${maxSandboxes}). `
        + "Refusing to start another preview browser.",
      );
    }
  }

  private async listBrowserSandboxContainers(): Promise<string[]> {
    const list = await this.runProcess(
      [containerBinary(), "ps", "--filter", `name=${BROWSER_SANDBOX_NAME_PREFIX}`, "--format", "{{.Names}}"],
      BROWSER_SANDBOX_HEALTH_TIMEOUT_MS,
    );
    if (list.timedOut || list.exitCode !== 0) {
      const reason = list.timedOut ? "timed out" : list.output;
      throw new Error(`container runtime sandbox listing failed (${reason})`);
    }
    return list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((name) => name.startsWith(BROWSER_SANDBOX_NAME_PREFIX));
  }

  private async listWindowsSandboxContainers(): Promise<string[]> {
    const list = await this.runProcess(
      [containerBinary(), "ps", "--filter", `name=${WINDOWS_SANDBOX_NAME_PREFIX}`, "--format", "{{.Names}}"],
      WINDOWS_SANDBOX_HEALTH_TIMEOUT_MS,
    );
    if (list.timedOut || list.exitCode !== 0) {
      const reason = list.timedOut ? "timed out" : list.output;
      throw new Error(`container runtime sandbox listing failed (${reason})`);
    }
    return list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((name) => name.startsWith(WINDOWS_SANDBOX_NAME_PREFIX));
  }

  private async listLinuxDesktopSandboxContainers(): Promise<string[]> {
    const list = await this.runProcess(
      [containerBinary(), "ps", "--filter", `name=${LINUX_DESKTOP_SANDBOX_NAME_PREFIX}`, "--format", "{{.Names}}"],
      LINUX_DESKTOP_SANDBOX_HEALTH_TIMEOUT_MS,
    );
    if (list.timedOut || list.exitCode !== 0) {
      const reason = list.timedOut ? "timed out" : list.output;
      throw new Error(`container runtime sandbox listing failed (${reason})`);
    }
    return list.output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((name) => name.startsWith(LINUX_DESKTOP_SANDBOX_NAME_PREFIX));
  }

  private buildMountArgs(projectRoot: string, mode: SandboxMountMode): string[] {
    mkdirSync(projectRoot, { recursive: true });
    if (mode === "none") return [];
    const readOnly = mode === "read-only" ? ":ro" : "";
    return ["-v", `${projectRoot}:/project${readOnly}`];
  }

  private async ensureBrowserSandboxImage(): Promise<void> {
    const inspect = await this.runProcess([containerBinary(), "image", "inspect", SANDBOX_BROWSER_IMAGE], 15_000);
    if (inspect.exitCode === 0) return;
    await buildBrowserSandboxImage();
  }

  private async ensureWindowsSandboxImage(): Promise<void> {
    const inspect = await this.runProcess([containerBinary(), "image", "inspect", WINDOWS_SANDBOX_IMAGE], 15_000);
    if (inspect.exitCode === 0) return;
    await buildWindowsSandboxImage();
  }

  private async ensureLinuxDesktopSandboxImage(): Promise<void> {
    const inspect = await this.runProcess([containerBinary(), "image", "inspect", LINUX_DESKTOP_SANDBOX_IMAGE], 15_000);
    if (inspect.exitCode === 0) return;
    await buildLinuxDesktopSandboxImage();
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
        name.startsWith(BROWSER_SANDBOX_NAME_PREFIX)
        && [ports.novncPort, ports.vncPort, ports.cdpPort]
          .filter((value): value is number => typeof value === "number")
          .some((port) => new RegExp(`(^|[,: ])${port}->`).test(portInfo) || portInfo.includes(`:${port}->`)),
      );
    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
    }
  }

  private async cleanupConflictingWindowsSandboxes(ports: {
    rdpPort: number;
    webViewerPort: number;
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
        name.startsWith(WINDOWS_SANDBOX_NAME_PREFIX)
        && [ports.rdpPort, ports.webViewerPort]
          .filter((value): value is number => typeof value === "number")
          .some((port) => new RegExp(`(^|[,: ])${port}->`).test(portInfo) || portInfo.includes(`:${port}->`)),
      );
    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
    }
  }

  private async cleanupConflictingLinuxDesktopSandboxes(ports: {
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
        name.startsWith(LINUX_DESKTOP_SANDBOX_NAME_PREFIX)
        && [ports.novncPort, ports.vncPort, ports.cdpPort]
          .filter((value): value is number => typeof value === "number")
          .some((port) => new RegExp(`(^|[,: ])${port}->`).test(portInfo) || portInfo.includes(`:${port}->`)),
      );
    for (const candidate of candidates) {
      await this.runProcess([containerBinary(), "rm", "-f", candidate.name], 15_000).catch(() => {});
    }
  }
}

function readMaxBrowserSandboxes(): number {
  const raw = process.env["JAIT_MAX_BROWSER_SANDBOXES"];
  if (!raw) return DEFAULT_MAX_BROWSER_SANDBOXES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BROWSER_SANDBOXES;
}

function readMaxWindowsSandboxes(): number {
  const raw = process.env["JAIT_MAX_WINDOWS_SANDBOXES"];
  if (!raw) return DEFAULT_MAX_WINDOWS_SANDBOXES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_WINDOWS_SANDBOXES;
}

function readMaxLinuxDesktopSandboxes(): number {
  const raw = process.env["JAIT_MAX_LINUX_DESKTOP_SANDBOXES"];
  if (!raw) return DEFAULT_MAX_LINUX_DESKTOP_SANDBOXES;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_LINUX_DESKTOP_SANDBOXES;
}

/**
 * Root directory for Windows sandbox VM disks.  Each sandbox gets its own
 * subdirectory here so sandboxes stay isolated and cleanup is safe.
 */
function windowsSandboxStorageRoot(): string {
  return process.env["JAIT_WINDOWS_SANDBOX_STORAGE"] ?? join(tmpdir(), "jait-windows-sandbox");
}

/** Guard: only ever delete storage dirs that live under the sandbox storage root. */
function isWindowsSandboxStorageDir(dir: string): boolean {
  const root = resolve(windowsSandboxStorageRoot());
  const resolved = resolve(dir);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}

interface BrowserSandboxListing {
  name: string;
  createdAt: string;
  labels: string;
}

function parseBrowserSandboxListing(line: string): BrowserSandboxListing | null {
  const [rawName, createdAt = "", labels = ""] = line.split("\t");
  const name = rawName?.trim() ?? "";
  if (!name) return null;
  return { name, createdAt, labels };
}

/**
 * Parse the first `HOSTPORT->containerPort/tcp` mapping from a `docker ps`
 * Ports column (e.g. `0.0.0.0:2222->22/tcp, 0.0.0.0:3389->3389/tcp`).
 * Returns undefined when the container port is not published.
 */
function parsePublishedPort(ports: string, containerPort: number): number | undefined {
  const match = new RegExp(`(\\d+)->${containerPort}/tcp`).exec(ports);
  return match ? Number(match[1]) : undefined;
}

function parseBrowserSandboxCreatedAt(createdAt: string, labels: string): number | null {
  const labelCreatedAt = parseContainerLabels(labels).get("jait.createdAt");
  if (labelCreatedAt) {
    const parsed = Number.parseInt(labelCreatedAt, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  const match = createdAt.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-])(\d{2})(\d{2})/);
  if (match) {
    const [, date, time, sign, hours, minutes] = match;
    const parsed = Date.parse(`${date}T${time}${sign}${hours}:${minutes}`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Date.parse(createdAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseContainerLabels(labels: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of labels.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return result;
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

async function buildWindowsSandboxImage(): Promise<void> {
  const result = await runProcessWithInput(
    [containerBinary(), "build", "-t", WINDOWS_SANDBOX_IMAGE, "-f", "-", "."],
    10 * 60_000,
    WINDOWS_SANDBOX_DOCKERFILE,
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to build Windows sandbox image: ${result.output}`);
  }
}

async function buildLinuxDesktopSandboxImage(): Promise<void> {
  const result = await runProcessWithInput(
    [containerBinary(), "build", "-t", LINUX_DESKTOP_SANDBOX_IMAGE, "-f", "-", "."],
    10 * 60_000,
    LINUX_DESKTOP_SANDBOX_DOCKERFILE,
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to build Linux desktop sandbox image: ${result.output}`);
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

const WINDOWS_SANDBOX_DOCKERFILE = `# syntax=docker/dockerfile:1
FROM dockurr/windows:latest

# Default VM configuration for the Jait Windows sandbox.  All values can be
# overridden at runtime with -e (e.g. -e RAM_SIZE=8G -e CPU_CORES=8).
ENV VERSION="11" \\
    RAM_SIZE="6G" \\
    CPU_CORES="4" \\
    DISK_SIZE="64G"

EXPOSE 3389 8006
`;

const LINUX_DESKTOP_SANDBOX_DOCKERFILE = `# jait/sandbox-linux-desktop — full XFCE desktop sandbox with Chromium + Firefox
#
# Extends the headless-browser sandbox into a complete desktop environment for
# interactive testing:
#   - XFCE4 desktop (panel, window manager, app menu)
#   - Chromium (auto-started, CDP on 9223 for automation)
#   - Firefox (latest stable from Mozilla's APT repo, launch from the menu)
#   - Xvfb virtual display + x11vnc + websockify + noVNC (ports 5900/6080)
#   - PulseAudio (optional, for media/audio testing)
#   - Utilities: xfce4-terminal, Thunar file manager, Mousepad text editor
#
# Port conventions (kept identical to sandbox-browser for tool compatibility):
#   5900  VNC (x11vnc)
#   6080  noVNC web UI
#   9223  Chromium CDP (socat proxy to internal 9222)

FROM debian:bookworm-slim

# --- Latest stable Firefox via Mozilla's official APT repo -------------------
# (Debian's own firefox-esr is ESR, not latest stable; Mozilla's repo is the
#  officially supported way to get current Firefox on Debian.)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \\
  && install -d -m 0755 /etc/apt/keyrings \\
  && curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg \\
     -o /etc/apt/keyrings/packages.mozilla.org.asc \\
  && echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] https://packages.mozilla.org/apt mozilla main" \\
     > /etc/apt/sources.list.d/mozilla.list

# --- Desktop, display, remote access, browsers, audio, utilities ------------
RUN apt-get update && apt-get install -y --no-install-recommends \\
  # Desktop environment
  xfce4 \\
  xfce4-terminal \\
  xfce4-whiskermenu-plugin \\
  thunar \\
  mousepad \\
  dbus \\
  dbus-x11 \\
  # Virtual display + remote access (same stack as sandbox-browser)
  xvfb \\
  x11vnc \\
  websockify \\
  novnc \\
  socat \\
  # Audio (optional, for media testing)
  pulseaudio \\
  pulseaudio-utils \\
  # Browsers
  chromium \\
  firefox \\
  # Misc
  ca-certificates \\
  curl \\
  fonts-dejavu-core \\
  fonts-liberation \\
  && rm -rf /var/lib/apt/lists/* \\
  # Hide noVNC top bar for a cleaner live view (same tweak as sandbox-browser)
  && sed -i 's/#top_bar {/#top_bar { display:none !important;/' /usr/share/novnc/vnc_lite.html

# --- Entrypoint: start display, desktop, browsers, VNC, noVNC ---------------
RUN cat <<'EOF' >/usr/local/bin/jait-linux-desktop.sh
#!/usr/bin/env bash
set -euo pipefail

export DISPLAY=:99
export SCREEN_RES="\${SCREEN_RES:-1920x1080x24}"
export XDG_RUNTIME_DIR=/tmp/xdg
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"

cleanup() {
  jobs -pr | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# System + session D-Bus (XFCE needs a session bus)
mkdir -p /run/dbus
dbus-daemon --system --fork 2>/dev/null || true
eval "$(dbus-launch --sh-syntax)"

# Virtual display (same approach as sandbox-browser)
Xvfb :99 -screen 0 "$SCREEN_RES" &

for _ in $(seq 1 50); do
  [[ -S /tmp/.X11-unix/X99 ]] && break
  sleep 0.1
done

# PulseAudio (optional; ignore failure so the desktop still comes up)
pulseaudio --daemonize=yes --exit-idle-time=-1 --disallow-exit 2>/dev/null || true

# Full XFCE desktop
xfce4-session &

# Give the desktop a moment to come up before placing the browser window
sleep 3

# Chromium with CDP for automation (9222 inside, 9223 exposed via socat)
chromium --no-sandbox --disable-gpu --disable-software-rasterizer \\
  --disable-dev-shm-usage --no-first-run --no-default-browser-check \\
  --window-size=1280,720 --window-position=0,0 \\
  --remote-debugging-port=9222 about:blank &

# Firefox is available from the XFCE menu (Applications > Internet > Firefox);
# launch it manually when needed:  firefox &

# CDP proxy: 9223 -> 9222
(
  while true; do
    socat TCP-LISTEN:9223,bind=0.0.0.0,reuseaddr,fork TCP:127.0.0.1:9222
    sleep 1
  done
) &

# VNC with auto-restart (x11vnc has been observed to segfault after client
# disconnects when XDamage is enabled; disable that path and restart so the
# live view survives transient crashes)
(
  while true; do
    x11vnc -display :99 -nopw -listen 0.0.0.0 -xkb -forever -shared -noxdamage -rfbport 5900
    echo "x11vnc exited with status $?; restarting in 1s" >&2
    sleep 1
  done
) &

exec websockify --web /usr/share/novnc/ 6080 localhost:5900
EOF

RUN chmod +x /usr/local/bin/jait-linux-desktop.sh

EXPOSE 5900 6080 9223

CMD ["/usr/local/bin/jait-linux-desktop.sh"]
`;
