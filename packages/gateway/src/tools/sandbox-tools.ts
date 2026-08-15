import { SandboxManager, type SandboxMountMode } from "../security/sandbox-manager.js";
import type { ToolDefinition, ToolResult } from "./contracts.js";

interface WindowsSandboxStartInput {
  /** VM RAM, dockur format e.g. "6G" (default "6G"). */
  ramSize?: string;
  /** VM CPU cores (default 4). */
  cpuCores?: number;
  /** VM disk size, dockur format e.g. "64G" (default "64G"). */
  diskSize?: string;
  /** Windows version to install: "11", "10", "11l", "10l", ... (default "11"). */
  windowsVersion?: string;
  /** Host RDP port (default: a reserved free port). */
  rdpPort?: number;
  /** Host web viewer port (default: a reserved free port). */
  webViewerPort?: number;
  /** Host SSH port for the VM's OpenSSH server (container port 22; default: a reserved free port). */
  sshPort?: number;
  /** Block until the web viewer port accepts connections (default false). */
  waitForWebViewer?: boolean;
  /** Windows username created during install (default "Docker"). */
  username?: string;
  /** Windows password created during install (default "admin"). */
  password?: string;
}

interface WindowsSandboxStopInput {
  /** Container name returned by windows.sandbox.start. */
  containerName: string;
  /** Also delete the VM disk directory (only safe paths under the sandbox storage root are removed). */
  removeStorage?: boolean;
}

interface LinuxDesktopSandboxStartInput {
  /** Xvfb screen geometry, e.g. "1920x1080x24" (default "1920x1080x24"). */
  screenRes?: string;
  /** Project mount mode: none, read-only, read-write (default read-only). */
  mountMode?: SandboxMountMode;
  /** Enable container networking (default true). */
  networkEnabled?: boolean;
  /** Host noVNC port (default: a reserved free port). */
  novncPort?: number;
  /** Host VNC port (default: a reserved free port). */
  vncPort?: number;
  /** Host Chromium CDP port (default: not published). */
  cdpPort?: number;
  /** Block until the CDP endpoint accepts connections (default true when cdpPort is set). */
  waitForCdp?: boolean;
  /** Add a host.docker.internal host-gateway mapping. */
  hostGateway?: boolean;
}

interface LinuxDesktopSandboxStopInput {
  /** Container name returned by linux.desktop.sandbox.start. */
  containerName: string;
}

export function createWindowsSandboxStartTool(
  sandboxManager = new SandboxManager(),
): ToolDefinition<WindowsSandboxStartInput> {
  return {
    name: "windows.sandbox.start",
    description:
      "Start a Windows VM sandbox (dockur/windows) for browser testing. Returns RDP and web viewer URLs. "
      + "The first start downloads the Windows ISO and performs a hands-free install (10-30 min); the disk "
      + "image persists so later starts boot straight into Windows.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        ramSize: { type: "string", description: "VM RAM, dockur format e.g. \"6G\" (default 6G)" },
        cpuCores: { type: "number", description: "VM CPU cores (default 4)" },
        diskSize: { type: "string", description: "VM disk size, dockur format e.g. \"64G\" (default 64G)" },
        windowsVersion: { type: "string", description: "Windows version to install: \"11\", \"10\", \"11l\", \"10l\", ... (default \"11\")" },
        rdpPort: { type: "number", description: "Host RDP port (default: a reserved free port)" },
        webViewerPort: { type: "number", description: "Host web viewer port (default: a reserved free port)" },
        sshPort: { type: "number", description: "Host SSH port for the VM's OpenSSH server, container port 22 (default: a reserved free port)" },
        waitForWebViewer: { type: "boolean", description: "Block until the web viewer port accepts connections (default false)" },
        username: { type: "string", description: "Windows username created during install (default \"Docker\")" },
        password: { type: "string", description: "Windows password created during install (default \"admin\")" },
      },
      required: [],
    },
    async execute(input, context): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      const result = await sandboxManager.startWindowsSandbox({
        ramSize: input.ramSize,
        cpuCores: input.cpuCores,
        diskSize: input.diskSize,
        version: input.windowsVersion,
        rdpPort: input.rdpPort,
        webViewerPort: input.webViewerPort,
        sshPort: input.sshPort,
        waitForWebViewer: input.waitForWebViewer,
        username: input.username,
        password: input.password,
      });

      return {
        ok: true,
        message:
          result.status === "running"
            ? "Windows sandbox started"
            : "Windows sandbox starting (first boot installs Windows; this can take 10-30 minutes)",
        data: result,
      };
    },
  };
}

export function createWindowsSandboxStopTool(
  sandboxManager = new SandboxManager(),
): ToolDefinition<WindowsSandboxStopInput> {
  return {
    name: "windows.sandbox.stop",
    description: "Stop and remove a Windows VM sandbox container. With removeStorage the VM disk directory is deleted as well.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Container name returned by windows.sandbox.start" },
        removeStorage: { type: "boolean", description: "Also delete the VM disk directory (default false)" },
      },
      required: ["containerName"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      await sandboxManager.stopWindowsSandbox(input.containerName, {
        removeStorage: input.removeStorage,
      });

      return {
        ok: true,
        message: `Windows sandbox ${input.containerName} stopped`,
        data: { containerName: input.containerName },
      };
    },
  };
}

export function createLinuxDesktopSandboxStartTool(
  sandboxManager = new SandboxManager(),
): ToolDefinition<LinuxDesktopSandboxStartInput> {
  return {
    name: "linux.desktop.sandbox.start",
    description:
      "Start a Linux desktop sandbox (XFCE + Chromium + Firefox) for interactive testing. "
      + "Returns noVNC/VNC URLs and an optional Chromium CDP URL for automation.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        screenRes: { type: "string", description: "Xvfb screen geometry e.g. \"1920x1080x24\" (default 1920x1080x24)" },
        mountMode: { type: "string", description: "Project mount mode: none, read-only, read-write" },
        networkEnabled: { type: "boolean", description: "Enable container networking (default true)" },
        novncPort: { type: "number", description: "Host noVNC port (default: a reserved free port)" },
        vncPort: { type: "number", description: "Host VNC port (default: a reserved free port)" },
        cdpPort: { type: "number", description: "Host Chromium CDP port (default: not published)" },
        waitForCdp: { type: "boolean", description: "Block until the CDP endpoint accepts connections (default true when cdpPort is set)" },
        hostGateway: { type: "boolean", description: "Add a host.docker.internal host-gateway mapping" },
      },
      required: [],
    },
    async execute(input, context): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      const result = await sandboxManager.startLinuxDesktopSandbox({
        projectRoot: context.projectRoot,
        screenRes: input.screenRes,
        mountMode: input.mountMode ?? "read-only",
        networkEnabled: input.networkEnabled,
        novncPort: input.novncPort,
        vncPort: input.vncPort,
        cdpPort: input.cdpPort,
        waitForCdp: input.waitForCdp,
        hostGateway: input.hostGateway,
      });

      return {
        ok: true,
        message: "Linux desktop sandbox started",
        data: result,
      };
    },
  };
}

export function createLinuxDesktopSandboxStopTool(
  sandboxManager = new SandboxManager(),
): ToolDefinition<LinuxDesktopSandboxStopInput> {
  return {
    name: "linux.desktop.sandbox.stop",
    description: "Stop and remove a Linux desktop sandbox container.",
    tier: "standard",
    category: "browser",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        containerName: { type: "string", description: "Container name returned by linux.desktop.sandbox.start" },
      },
      required: ["containerName"],
    },
    async execute(input, context): Promise<ToolResult> {
      if (context.signal?.aborted) return { ok: false, message: "Cancelled" };
      await sandboxManager.stopLinuxDesktopSandbox(input.containerName);

      return {
        ok: true,
        message: `Linux desktop sandbox ${input.containerName} stopped`,
        data: { containerName: input.containerName },
      };
    },
  };
}
