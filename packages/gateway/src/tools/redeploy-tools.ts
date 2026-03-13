/**
 * gateway.redeploy — Self-update tool for the Jait gateway.
 *
 * Detects the runtime environment and uses the appropriate strategy:
 *
 * **systemd** (detected when INVOCATION_ID is set):
 *   1. npm install -g jait@latest
 *   2. Spawn canary on PORT+1, health-check it
 *   3. If healthy → kill canary, exit process.
 *      systemd's Restart=always automatically brings up the new version.
 *   4. If unhealthy → kill canary, report failure, stay running.
 *
 * **Bare process** (no service manager):
 *   1. npm install -g jait@latest
 *   2. Spawn canary on PORT+1, health-check it
 *   3. If healthy → spawn fresh gateway on original port (detached),
 *      kill canary, then gracefully shut down current process.
 *   4. If unhealthy → kill canary, report failure, stay running.
 */

import { execSync, spawn } from "node:child_process";
import type { ToolDefinition, ToolResult, ToolContext } from "./contracts.js";

interface RedeployInput {
  /** Version/tag to install. Defaults to "latest". */
  version?: string;
  /** Skip the canary health check (not recommended). */
  skipCanary?: boolean;
}

interface RedeployDeps {
  /** Current gateway port (from config) */
  port: number;
  /** Graceful shutdown callback — will be called when cutover succeeds */
  shutdown: () => Promise<void>;
}

export function createRedeployTool(deps: RedeployDeps): ToolDefinition<RedeployInput> {
  return {
    name: "gateway.redeploy",
    description:
      "Self-update the Jait gateway. Pulls the latest version via npm, " +
      "verifies it in a canary process, then performs a zero-downtime " +
      "switchover. Under systemd, uses `systemctl restart` for a clean " +
      "handoff. Otherwise spawns a detached replacement process. " +
      "This tool requires human consent.",
    tier: "standard",
    category: "gateway",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        version: {
          type: "string",
          description: 'Version/tag to install (default: "latest")',
        },
        skipCanary: {
          type: "boolean",
          description: "Skip the canary health check (not recommended)",
        },
      },
    },

    async execute(input: RedeployInput, context: ToolContext): Promise<ToolResult> {
      const tag = input.version ?? "latest";
      const log = context.onOutputChunk ?? console.log;

      return npmRedeploy(tag, input.skipCanary ?? false, deps, log);
    },
  };
}

// ── Environment detection ────────────────────────────────────────────

/** Returns true when the current process was started by systemd. */
function isSystemd(): boolean {
  return !!process.env.INVOCATION_ID;
}

/** Try to resolve the systemd unit name that manages us. */
function systemdUnit(): string {
  // The daemon installer writes this, but fall back to the well-known name.
  return process.env.JAIT_UNIT ?? "jait-gateway";
}

// ── Core redeploy logic ─────────────────────────────────────────────

async function npmRedeploy(
  tag: string,
  skipCanary: boolean,
  deps: RedeployDeps,
  log: (msg: string) => void,
): Promise<ToolResult> {
  const pkg = `jait@${tag}`;

  // ── 1. Capture current version ────────────────────────────────────
  let oldVersion = "unknown";
  try {
    oldVersion = execSync(
      "node -e \"process.stdout.write(require('jait/package.json').version)\"",
      { encoding: "utf8", timeout: 10_000 },
    );
  } catch {
    // non-critical
  }

  // ── 2. Install the new version ────────────────────────────────────
  log(`⬇ Installing ${pkg}...\n`);
  try {
    execSync(`npm install -g ${pkg}`, {
      encoding: "utf8",
      timeout: 120_000,
      stdio: "pipe",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `npm install failed: ${msg}` };
  }

  // ── 3. Read new version ───────────────────────────────────────────
  let newVersion = "unknown";
  try {
    newVersion = execSync(
      "node -e \"process.stdout.write(require('jait/package.json').version)\"",
      { encoding: "utf8", timeout: 10_000 },
    );
  } catch {
    // non-critical
  }

  log(`✓ Installed @jait/gateway ${newVersion} (was ${oldVersion})\n`);

  // ── 4. Canary health check ────────────────────────────────────────
  if (!skipCanary) {
    const canaryPort = deps.port + 1;
    log(`🐤 Starting canary on port ${canaryPort}...\n`);

    const canary = spawn("jait", ["--port", String(canaryPort)], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, PORT: String(canaryPort), __JAIT_CLI: "1" },
    });
    canary.unref();

    const healthy = await waitForHealth(`http://127.0.0.1:${canaryPort}`, 30_000);

    if (!healthy) {
      try { process.kill(-canary.pid!, "SIGTERM"); } catch { /* ignore */ }
      return {
        ok: false,
        message:
          `Canary failed health check on port ${canaryPort}. ` +
          `Update installed but NOT activated. Current gateway is still running.`,
        data: { oldVersion, newVersion, canaryPort },
      };
    }

    log(`✓ Canary healthy on port ${canaryPort}\n`);
    try { process.kill(-canary.pid!, "SIGTERM"); } catch { /* ignore */ }
    await sleep(1_000);
  }

  // ── 5. Switchover ─────────────────────────────────────────────────

  if (isSystemd()) {
    return systemdSwitchover(oldVersion, newVersion, deps, log);
  }
  return bareProcessSwitchover(oldVersion, newVersion, deps, log);
}

// ── systemd switchover ──────────────────────────────────────────────

/**
 * Under systemd: we just exit and let Restart=always bring the new
 * binary back up automatically.  A `systemctl restart` is cleaner
 * because it waits for the old process to fully stop before starting
 * the new one — no port conflicts.
 */
async function systemdSwitchover(
  oldVersion: string,
  newVersion: string,
  _deps: RedeployDeps,
  log: (msg: string) => void,
): Promise<ToolResult> {
  const unit = systemdUnit();
  log(`🔄 Restarting via systemd (${unit})...\n`);

  // Schedule the restart *after* we return the tool result, so the
  // HTTP response has time to flush.
  //
  // IMPORTANT: We must forcefully exit after spawning `systemctl restart`.
  // If we wait for a graceful shutdown, open handles (Codex child processes,
  // active HTTP connections) prevent the event loop from draining, and
  // systemd sits in `deactivating (stop-sigterm)` until TimeoutStopSec.
  setTimeout(() => {
    try {
      const child = spawn("systemctl", ["--user", "restart", unit], {
        stdio: "ignore",
        detached: true,
      });
      child.unref();
    } catch {
      // systemctl spawn failed — fall through to process.exit below
    }
    // Give systemctl a moment to register, then force-exit so the
    // restart isn't blocked by lingering handles in this process.
    setTimeout(() => process.exit(0), 1_000);
  }, 500);

  return {
    ok: true,
    message:
      `Gateway updated ${oldVersion} → ${newVersion}. ` +
      `Restarting via systemd unit "${unit}". ` +
      `The new version will be live in a few seconds.`,
    data: { oldVersion, newVersion, strategy: "systemd", unit },
  };
}

// ── Bare-process switchover ─────────────────────────────────────────

/**
 * Without a service manager: spawn a fresh `jait` process on the
 * original port (detached so it survives), then shut ourselves down.
 */
async function bareProcessSwitchover(
  oldVersion: string,
  newVersion: string,
  deps: RedeployDeps,
  log: (msg: string) => void,
): Promise<ToolResult> {
  log(`🔄 Spawning new gateway on port ${deps.port}...\n`);

  const fresh = spawn("jait", ["--port", String(deps.port)], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, PORT: String(deps.port), __JAIT_CLI: "1" },
  });
  fresh.unref();

  log(`✓ New gateway spawned (PID ${fresh.pid}). Shutting down current process...\n`);

  // Give the response time to be sent before shutdown
  setTimeout(() => {
    deps.shutdown().catch(() => process.exit(0));
  }, 500);

  return {
    ok: true,
    message:
      `Gateway updated ${oldVersion} → ${newVersion}. ` +
      `New process (PID ${fresh.pid}) is starting on port ${deps.port}. ` +
      `This instance is shutting down.`,
    data: { oldVersion, newVersion, pid: fresh.pid, strategy: "bare" },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  const healthUrl = `${url}/health`;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await sleep(1_000);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
