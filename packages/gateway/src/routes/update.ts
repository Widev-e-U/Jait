/**
 * Update REST routes — check for new versions and trigger self-update.
 *
 *   GET    /api/update/check   — compare running version against npm latest
 *   POST   /api/update/apply   — install the new version and restart
 */

import type { FastifyInstance } from "fastify";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";

const require = createRequire(import.meta.url);
const { version: CURRENT_VERSION } = require("../../package.json") as { version: string };

export function registerUpdateRoutes(
  app: FastifyInstance,
  config: AppConfig,
  deps: { shutdown: () => Promise<void>; port: number },
): void {
  /** Check for a newer version on npm. */
  app.get("/api/update/check", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    try {
      const latest = execSync("npm view @jait/gateway version", {
        encoding: "utf8",
        timeout: 15_000,
      }).trim();

      const hasUpdate = latest !== CURRENT_VERSION && compareVersions(latest, CURRENT_VERSION) > 0;

      return {
        currentVersion: CURRENT_VERSION,
        latestVersion: latest,
        hasUpdate,
      };
    } catch (err) {
      return reply.status(502).send({
        error: "Failed to check for updates",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /** Install a new version and restart the gateway. */
  app.post("/api/update/apply", async (request, reply) => {
    const user = await requireAuth(request, reply, config.jwtSecret);
    if (!user) return;

    const body = (request.body as Record<string, unknown>) ?? {};
    const raw = typeof body["version"] === "string" ? body["version"] : "latest";
    // Sanitise: only allow semver-ish or "latest"
    const version = /^[0-9a-zA-Z._-]+$/.test(raw) ? raw : "latest";
    const pkg = `@jait/gateway@${version}`;

    try {
      // 1. Install new version
      execSync(`npm install -g ${pkg}`, {
        encoding: "utf8",
        timeout: 120_000,
        stdio: "pipe",
      });

      // 2. Read newly installed version
      let newVersion = version;
      try {
        newVersion = execSync(
          "node -e \"process.stdout.write(require('@jait/gateway/package.json').version)\"",
          { encoding: "utf8", timeout: 10_000 },
        );
      } catch { /* best effort */ }

      // 3. Schedule restart after response is sent
      const isSystemdEnv = !!process.env.INVOCATION_ID;
      setTimeout(async () => {
        if (isSystemdEnv) {
          const unit = process.env.JAIT_UNIT ?? "jait-gateway";
          try {
            const { spawn } = await import("node:child_process");
            const child = spawn("systemctl", ["--user", "restart", unit], {
              stdio: "ignore",
              detached: true,
              windowsHide: true,
            });
            child.unref();
          } catch { /* fall through */ }
          setTimeout(() => process.exit(0), 1_000);
        } else {
          await deps.shutdown();
        }
      }, 500);

      return {
        ok: true,
        previousVersion: CURRENT_VERSION,
        newVersion,
        message: `Updated to ${newVersion}. Restarting...`,
      };
    } catch (err) {
      return reply.status(500).send({
        error: "Update failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/** Simple semver comparison: returns >0 if a > b, <0 if a < b, 0 if equal. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
