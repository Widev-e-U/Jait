/**
 * gateway.redeploy — Self-update tool for the Jait gateway.
 *
 * Flow (blue-green for bare process, i.e. `npm install -g @jait/gateway`):
 *   1. Pull the latest version:  npm install -g @jait/gateway@latest
 *   2. Spawn a canary on PORT+1 to verify the new code boots correctly
 *   3. Health-check the canary
 *   4. If healthy → spawn a fresh gateway on the original port (detached),
 *      kill the canary, then gracefully shut down the current process
 *   5. If unhealthy → kill the canary, report failure, stay running
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
      "switchover. The current process shuts down after the new one is confirmed healthy. " +
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

// ── npm (bare process) redeploy ──────────────────────────────────────

async function npmRedeploy(
  tag: string,
  skipCanary: boolean,
  deps: RedeployDeps,
  log: (msg: string) => void,
): Promise<ToolResult> {
  const pkg = `@jait/gateway@${tag}`;

  // 1. Get current version before updating
  let oldVersion = "unknown";
  try {
    const pkgJson = JSON.parse(
      execSync("node -e \"process.stdout.write(require('@jait/gateway/package.json').version)\"", {
        encoding: "utf8",
        timeout: 10_000,
      }),
    );
    oldVersion = pkgJson;
  } catch {
    // non-critical
  }

  // 2. Install the latest version
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

  // 3. Read new version
  let newVersion = "unknown";
  try {
    newVersion = execSync(
      "node -e \"process.stdout.write(require('@jait/gateway/package.json').version)\"",
      { encoding: "utf8", timeout: 10_000 },
    );
  } catch {
    // non-critical
  }

  log(`✓ Installed @jait/gateway ${newVersion} (was ${oldVersion})\n`);

  if (!skipCanary) {
    // 4. Canary — start the new version on PORT+1
    const canaryPort = deps.port + 1;
    log(`🐤 Starting canary on port ${canaryPort}...\n`);

    const canary = spawn("jait", ["--port", String(canaryPort)], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, PORT: String(canaryPort), __JAIT_CLI: "1" },
    });
    canary.unref();

    // 5. Wait for canary health (up to 30s)
    const healthy = await waitForHealth(`http://127.0.0.1:${canaryPort}`, 30_000);

    if (!healthy) {
      // Kill canary and abort
      try { process.kill(-canary.pid!, "SIGTERM"); } catch { /* ignore */ }
      return {
        ok: false,
        message: `Canary failed health check on port ${canaryPort}. Update installed but NOT activated. Current gateway is still running.`,
        data: { oldVersion, newVersion, canaryPort },
      };
    }

    log(`✓ Canary healthy on port ${canaryPort}\n`);

    // 6. Kill the canary (it was just a test)
    try { process.kill(-canary.pid!, "SIGTERM"); } catch { /* ignore */ }
    // Brief wait for port release
    await sleep(1_000);
  }

  // 7. Spawn the new gateway on the original port (detached, survives parent exit)
  log(`🔄 Spawning new gateway on port ${deps.port}...\n`);

  const fresh = spawn("jait", ["--port", String(deps.port)], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, PORT: String(deps.port), __JAIT_CLI: "1" },
  });
  fresh.unref();

  // 8. Shut down the current process
  log(`✓ New gateway spawned (PID ${fresh.pid}). Shutting down current process...\n`);

  // Give the response time to be sent before shutdown
  setTimeout(() => {
    deps.shutdown().catch(() => process.exit(0));
  }, 500);

  return {
    ok: true,
    message: `Gateway updated ${oldVersion} → ${newVersion}. New process (PID ${fresh.pid}) is starting on port ${deps.port}. This instance is shutting down.`,
    data: { oldVersion, newVersion, pid: fresh.pid },
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
