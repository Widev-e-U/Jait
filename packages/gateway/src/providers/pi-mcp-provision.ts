/**
 * Per-session MCP provisioning for pi-based ACP providers.
 *
 * Why this exists
 * ---------------
 * Jait hands its MCP servers (`jait_core` + `jait`) to CLI agents through the
 * ACP `newSession({ mcpServers })` param. codex/claude/cursor/deepagents all
 * forward that param to their underlying agents, but `pi-acp` (and the pi-gemini
 * variant) only *store* it — it is never wired through to the `pi` subprocess.
 * On top of that, pi has no built-in MCP: tool access comes from the
 * `pi-mcp-adapter` extension, which reads config from files or the
 * `--mcp-config` argv flag.
 *
 * This module bridges that gap from Jait's side:
 *   - it writes Jait's MCP servers into a *per-session* config file, and
 *   - it injects `--mcp-config <file>` into pi's argv via a tiny wrapper on
 *     `PI_ACP_PI_COMMAND` (pi-acp spawns `$PI_ACP_PI_COMMAND --mode rpc ...`).
 *
 * Using a per-session config (instead of writing `~/.pi/agent/mcp.json` or a
 * project `.mcp.json`) keeps Jait's session-scoped URLs out of the user's
 * global/project pi config, so normal `pi` usage isn't polluted and concurrent
 * sessions don't clobber each other. Requires `pi-mcp-adapter` to be installed
 * in pi; without it the wrapper simply launches pi with no MCP tooling.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServerRef } from "./contracts.js";

/** ACP provider types that run on the pi coding agent under `pi-acp`. */
export const PI_BASED_PROVIDER_TYPES = ["pi", "pi-gemini"] as const;

export interface PiMcpProvisionResult {
  /** Env entries to merge into the ACP provider spawn env. */
  env: Record<string, string>;
  /** Remove the per-session config + wrapper. Idempotent. */
  cleanup: () => void;
}

export function isPiBasedProvider(providerType: string): boolean {
  return (PI_BASED_PROVIDER_TYPES as readonly string[]).includes(providerType);
}

/**
 * Build a per-session MCP config + a `PI_ACP_PI_COMMAND` wrapper that injects
 * it into pi. Returns `null` when no provisioning is needed (non-pi provider or
 * no MCP servers).
 */
export function provisionPiMcp(
  providerType: string,
  mcpServers: McpServerRef[] | undefined,
  opts: { sessionId: string; realPiCommand?: string },
): PiMcpProvisionResult | null {
  if (!isPiBasedProvider(providerType)) return null;
  if (!mcpServers?.length) return null;

  const dir = mkdtempSync(join(tmpdir(), `jait-pi-mcp-${opts.sessionId}-`));
  const configPath = join(dir, "mcp.json");
  const wrapperPath = join(dir, isWindows() ? "pi-wrapper.cmd" : "pi-wrapper.sh");

  try {
    writeFileSync(
      configPath,
      `${JSON.stringify({ mcpServers: toPiMcpServers(mcpServers) }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      wrapperPath,
      buildWrapper(configPath, opts.realPiCommand?.trim() || "pi"),
      "utf8",
    );
    if (!isWindows()) chmodSync(wrapperPath, 0o755);
  } catch (error) {
    // Best-effort: never fail session startup because provisioning broke.
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
    console.warn(`[acp] pi MCP provisioning failed, continuing without Jait tools: ${String(error)}`);
    return null;
  }

  return {
    env: { PI_ACP_PI_COMMAND: wrapperPath },
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
    },
  };
}

function toPiMcpServers(servers: McpServerRef[]): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const ref of servers) {
    if (ref.transport === "stdio") {
      result[ref.name] = {
        command: ref.command,
        args: ref.args ?? [],
        ...(ref.env ? { env: ref.env } : {}),
      };
    } else {
      // http / sse → pi-mcp-adapter uses StreamableHTTP with SSE fallback.
      result[ref.name] = { url: ref.url, lifecycle: "lazy" };
    }
  }
  return result;
}

function buildWrapper(configPath: string, realPi: string): string {
  if (isWindows()) {
    return [
      "@echo off",
      `"${realPi}" --mcp-config "${configPath}" %*`,
      "",
    ].join("\r\n");
  }
  return `#!/bin/sh\nexec "${realPi}" --mcp-config "${configPath}" "$@"\n`;
}

function isWindows(): boolean {
  return process.platform === "win32";
}
