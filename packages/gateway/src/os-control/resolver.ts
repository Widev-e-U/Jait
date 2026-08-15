/**
 * os-control resolver — discovers running OS sandboxes and maps a requested
 * sandbox (by container name) to its concrete OsControlDriver.
 */

import type { OsSandboxInfo, SandboxManager } from "../security/sandbox-manager.js";
import { LinuxDesktopOsControlDriver } from "./linux-desktop-driver.js";
import type { OsControlDriver, OsDriverBinding } from "./types.js";
import { WindowsOsControlDriver } from "./windows-driver.js";

/** Connection details surfaced to callers/UI for a running OS sandbox. */
export interface OsSandboxConnection {
  containerName: string;
  type: "linux-desktop" | "windows";
  display?: string;
  vncPort?: number;
  novncPort?: number;
  rdpPort?: number;
  webViewerPort?: number;
  sshPort?: number;
}

export interface OsControlResolver {
  /** List currently running OS sandboxes with their type + connection details. */
  listSandboxes(): Promise<OsSandboxConnection[]>;
  /**
   * Resolve an OS control driver for a sandbox. If `containerName` is omitted,
   * the most recently started running sandbox is used.
   */
  resolve(containerName?: string): Promise<OsDriverBinding>;
}

/** Optional SSH credentials for the Windows VM, when configured. */
export interface WindowsSshConfig {
  username?: string;
  password?: string;
}

function buildDriver(
  sandboxManager: SandboxManager,
  windowsSsh: WindowsSshConfig,
  containerName: string,
  type: "linux-desktop" | "windows",
): OsControlDriver {
  if (type === "windows") {
    return new WindowsOsControlDriver(
      containerName,
      windowsSsh.username ?? "docker",
      windowsSsh.password,
    );
  }
  return new LinuxDesktopOsControlDriver(sandboxManager, containerName);
}

/**
 * Build an os-control resolver bound to the gateway's SandboxManager.
 *
 * @param sandboxManager the shared sandbox driver.
 * @param windowsSsh      optional dockur SSH credentials (SSH_USERNAME/SSH_PASSWORD).
 */
export function createOsControlResolver(
  sandboxManager: SandboxManager,
  windowsSsh: WindowsSshConfig = {},
): OsControlResolver {
  const driver = (name: string, type: "linux-desktop" | "windows") =>
    buildDriver(sandboxManager, windowsSsh, name, type);

  return {
    async listSandboxes(): Promise<OsSandboxConnection[]> {
      const infos = await sandboxManager.listRunningOsSandboxes();
      const connections: OsSandboxConnection[] = [];
      for (const info of infos) {
        if (!info.running) continue;
        const base = { containerName: info.containerName, type: info.type };
        if (info.type === "linux-desktop") {
          connections.push({
            ...base,
            display: ":99",
            vncPort: info.vncPort ?? 5900,
            novncPort: info.novncPort ?? 6080,
          });
        } else {
          connections.push({
            ...base,
            rdpPort: info.rdpPort ?? 3389,
            webViewerPort: info.webViewerPort ?? 8006,
            sshPort: info.sshPort ?? 2222,
          });
        }
      }
      return connections;
    },

    async resolve(containerName?: string): Promise<OsDriverBinding> {
      const infos = await sandboxManager.listRunningOsSandboxes();
      const running = infos.filter(
        (i): i is OsSandboxInfo & { running: true } => i.running,
      );

      let target: OsSandboxInfo | undefined;
      if (containerName && containerName.trim()) {
        const byName = infos.find((i) => i.containerName === containerName.trim());
        if (!byName) {
          throw new Error(
            `No OS sandbox named "${containerName}" was found. Start one first ` +
              `(see os.sandbox list) and try again.`,
          );
        }
        if (!byName.running) {
          throw new Error(`OS sandbox "${containerName}" is not running. Start it first.`);
        }
        target = byName;
      } else {
        if (running.length === 0) {
          throw new Error(
            "No OS sandbox is running. Start a Linux desktop or Windows sandbox first, " +
              "or pass a containerName.",
          );
        }
        // Most recently started sandbox is last in the list returned by Docker.
        target = running[running.length - 1];
      }

      if (!target) {
        throw new Error('Could not resolve an OS sandbox target.');
      }

      return {
        driver: driver(target.containerName, target.type),
        containerName: target.containerName,
        type: target.type,
      };
    },
  };
}
