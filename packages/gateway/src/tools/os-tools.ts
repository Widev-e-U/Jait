/**
 * OS Tools — Sprint 3.6
 *
 * os.query  — system info, processes, disk usage
 * os.install — winget/apt/brew wrapper
 */

import type { ToolDefinition, ToolContext, ToolResult } from "./contracts.js";
import { platform, hostname, arch, cpus, totalmem, freemem, uptime, release, type as osType } from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface OsQueryInput {
  query: "info" | "processes" | "disk" | "env";
}

interface OsInstallInput {
  package: string;
  manager?: "winget" | "apt" | "brew" | "auto";
}

export function createOsQueryTool(): ToolDefinition<OsQueryInput> {
  return {
    name: "os.query",
    description: "Query system information: info, processes, disk usage, or environment",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to query", enum: ["info", "processes", "disk", "env"] },
      },
      required: ["query"],
    },
    async execute(input: OsQueryInput, _context: ToolContext): Promise<ToolResult> {
      switch (input.query) {
        case "info": {
          return {
            ok: true,
            message: "System info",
            data: {
              platform: platform(),
              type: osType(),
              release: release(),
              hostname: hostname(),
              arch: arch(),
              cpus: cpus().length,
              cpuModel: cpus()[0]?.model ?? "unknown",
              totalMemoryMB: Math.round(totalmem() / 1048576),
              freeMemoryMB: Math.round(freemem() / 1048576),
              uptimeSeconds: Math.round(uptime()),
            },
          };
        }
        case "processes": {
          try {
            const cmd = platform() === "win32"
              ? "tasklist /FO CSV /NH | Select-Object -First 25"
              : "ps aux --sort=-%mem | head -25";
            const { stdout } = await execAsync(cmd, { timeout: 10000 });
            return {
              ok: true,
              message: "Top processes",
              data: { output: stdout.trim() },
            };
          } catch (err) {
            return { ok: false, message: err instanceof Error ? err.message : "Failed to list processes" };
          }
        }
        case "disk": {
          try {
            const cmd = platform() === "win32"
              ? "wmic logicaldisk get size,freespace,caption /format:csv"
              : "df -h";
            const { stdout } = await execAsync(cmd, { timeout: 10000 });
            return {
              ok: true,
              message: "Disk usage",
              data: { output: stdout.trim() },
            };
          } catch (err) {
            return { ok: false, message: err instanceof Error ? err.message : "Failed to read disk info" };
          }
        }
        case "env": {
          // Only expose safe env vars
          const safe = ["PATH", "HOME", "USERPROFILE", "SHELL", "TERM", "LANG", "NODE_ENV"];
          const env: Record<string, string> = {};
          for (const key of safe) {
            if (process.env[key]) env[key] = process.env[key]!;
          }
          return { ok: true, message: "Environment variables (safe subset)", data: env };
        }
        default:
          return { ok: false, message: `Unknown query: ${input.query}` };
      }
    },
  };
}

export function createOsInstallTool(): ToolDefinition<OsInstallInput> {
  return {
    name: "os.install",
    description: "Install a system package via winget (Windows), apt (Linux), or brew (macOS)",
    parameters: {
      type: "object",
      properties: {
        "package": { type: "string", description: "Package name to install" },
        manager: { type: "string", description: "Package manager to use", enum: ["winget", "apt", "brew", "auto"] },
      },
      required: ["package"],
    },
    async execute(input: OsInstallInput, _context: ToolContext): Promise<ToolResult> {
      const mgr = input.manager === "auto" || !input.manager
        ? detectPackageManager()
        : input.manager;

      const cmd = buildInstallCommand(mgr, input.package);
      if (!cmd) {
        return { ok: false, message: `No package manager available for platform ${platform()}` };
      }

      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: 120000 });
        return {
          ok: true,
          message: `Installed ${input.package} via ${mgr}`,
          data: { stdout: stdout.trim(), stderr: stderr.trim(), manager: mgr },
        };
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : "Install failed",
        };
      }
    },
  };
}

function detectPackageManager(): string {
  if (platform() === "win32") return "winget";
  if (platform() === "darwin") return "brew";
  return "apt";
}

function buildInstallCommand(manager: string, pkg: string): string | null {
  // Sanitize package name — only allow alphanumeric, dash, dot, slash
  if (!/^[\w./@-]+$/.test(pkg)) return null;

  switch (manager) {
    case "winget": return `winget install --accept-package-agreements --accept-source-agreements -e --id ${pkg}`;
    case "apt": return `sudo apt-get install -y ${pkg}`;
    case "brew": return `brew install ${pkg}`;
    default: return null;
  }
}
