import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { SandboxManager, reserveLocalPort } from "../security/sandbox-manager.js";

export interface LiveViewSession {
  kind: "host" | "container";
  display: string;
  vncPort: number;
  websockifyPort: number;
  novncUrl: string;
  processes: ChildProcess[];
  containerName?: string;
  cdpUrl?: string;
}

/**
 * Starts Xvfb + x11vnc + websockify to make a headed browser visible via noVNC.
 * Returns a LiveViewSession with the display to set as DISPLAY env var
 * and the websocket URL the frontend can connect to.
 */
export async function startLiveView(options?: {
  workspaceRoot?: string;
  preferContainer?: boolean;
  displayNumber?: number;
  width?: number;
  height?: number;
}): Promise<LiveViewSession> {
  const preferContainer = options?.preferContainer !== false;
  if (preferContainer) {
    try {
      return await startContainerLiveView(options);
    } catch (err) {
      throw new Error(`Docker sandbox browser failed: ${(err as Error)?.message ?? err}`);
    }
  }

  return startHostLiveView(options);
}

async function startContainerLiveView(options?: {
  workspaceRoot?: string;
}): Promise<LiveViewSession> {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const [novncPort, vncPort, cdpPort] = await Promise.all([
    reserveLocalPort(),
    reserveLocalPort(),
    reserveLocalPort(),
  ]);
  const sandboxManager = new SandboxManager();
  const session = await sandboxManager.startBrowserSandbox({
    workspaceRoot,
    mountMode: "none",
    networkEnabled: true,
    hostGateway: true,
    novncPort,
    vncPort,
    cdpPort,
  });
  return {
    kind: "container",
    display: `container:${session.containerName}`,
    vncPort: session.vncPort,
    websockifyPort: session.novncPort,
    novncUrl: session.novncUrl,
    processes: [],
    containerName: session.containerName,
    cdpUrl: session.cdpUrl,
  };
}

async function startHostLiveView(options?: {
  displayNumber?: number;
  width?: number;
  height?: number;
}): Promise<LiveViewSession> {
  const width = options?.width ?? 1280;
  const height = options?.height ?? 720;
  const displayNum = options?.displayNumber ?? findAvailableDisplay();
  const display = `:${displayNum}`;

  const [vncPort, websockifyPort] = await Promise.all([
    reservePort(),
    reservePort(),
  ]);

  const processes: ChildProcess[] = [];

  try {
    // 1. Start Xvfb
    const xvfb = await spawnChecked(
      "Xvfb",
      [display, "-screen", "0", `${width}x${height}x24`],
    );
    processes.push(xvfb);
    await waitForDisplay(displayNum);

    // 2. Start x11vnc
    const x11vnc = await spawnChecked(
      "x11vnc",
      [
        "-display", display,
        "-nopw",
        "-listen", "127.0.0.1",
        "-xkb",
        "-forever",
        "-shared",
        "-rfbport", String(vncPort),
      ],
    );
    processes.push(x11vnc);

    // Brief wait for x11vnc to bind
    await sleep(300);

    // 3. Start websockify
    const websockify = await spawnChecked(
      "websockify",
      [String(websockifyPort), `127.0.0.1:${vncPort}`],
    );
    processes.push(websockify);

    // Brief wait for websockify to bind
    await sleep(200);

    return {
      kind: "host",
      display,
      vncPort,
      websockifyPort,
      novncUrl: `ws://127.0.0.1:${websockifyPort}`,
      processes,
    };
  } catch (err) {
    // Clean up on failure
    for (const proc of processes) {
      try { proc.kill(); } catch { /* ignore */ }
    }
    throw err;
  }
}

async function spawnChecked(command: string, args: string[]): Promise<ChildProcess> {
  const proc = spawn(command, args, { stdio: "ignore", detached: false });
  proc.unref();
  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      proc.off("spawn", onSpawn);
      proc.off("error", onError);
    };
    proc.once("spawn", onSpawn);
    proc.once("error", onError);
  });
  return proc;
}

export async function stopLiveView(session: LiveViewSession): Promise<void> {
  if (session.kind === "container" && session.containerName) {
    await new SandboxManager().stopContainer(session.containerName).catch(() => {});
    return;
  }
  for (const proc of [...session.processes].reverse()) {
    try { proc.kill(); } catch { /* ignore */ }
  }
  session.processes.length = 0;
}

function findAvailableDisplay(start = 99, max = 199): number {
  for (let n = start; n <= max; n++) {
    if (!existsSync(`/tmp/.X11-unix/X${n}`)) return n;
  }
  throw new Error(`No available X display found in range :${start}-:${max}`);
}

async function waitForDisplay(displayNum: number, timeoutMs = 5000): Promise<void> {
  const socketPath = `/tmp/.X11-unix/X${displayNum}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return;
    await sleep(100);
  }
  throw new Error(`Xvfb display :${displayNum} did not become ready within ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
