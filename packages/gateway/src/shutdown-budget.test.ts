/**
 * Regression guard for a shutdown deadline race that silently broke three
 * releases (v0.1.959, v0.1.961, v0.1.964): the gateway's watchdog exited 1 at 5s
 * while the desktop shell's backstop exited 0 at 6s, so on a loaded Windows VM
 * the failure code won and the packaging smoke's `graceful shutdown` assertion
 * failed. `Create GitHub Release` is gated on that job, so the tags produced no
 * Release at all. These three numbers must stay strictly ordered, and each
 * deadline must have exactly one owner.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

function numeric(source: string, pattern: RegExp, label: string): number {
  const match = pattern.exec(source);
  if (!match) throw new Error(`Could not find the ${label} deadline; update this guard with the new shape`);
  return Number.parseInt(match[1]!.replaceAll("_", ""), 10);
}

const gatewayWatchdogMs = () =>
  numeric(read("./index.ts"), /\?\s*configured\s*:\s*([\d_]+)/, "gateway watchdog");
const shellBackstopMs = () =>
  numeric(read("../bin/desktop-host.mjs"), /process\.exit\(0\),\s*([\d_]+)\)/, "desktop shell backstop");
const smokeKillMs = () =>
  numeric(read("../scripts/smoke-desktop.mjs"), /child\.kill\(\),\s*([\d_]+)\)/, "smoke test kill");

describe("shutdown deadlines", () => {
  it("orders gateway watchdog < desktop backstop < smoke kill", () => {
    const gateway = gatewayWatchdogMs();
    const backstop = shellBackstopMs();
    const smoke = smokeKillMs();
    expect(gateway).toBeGreaterThan(0);
    expect(backstop).toBeGreaterThan(gateway);
    expect(smoke).toBeGreaterThan(backstop);
  });

  it("lets the desktop shell own the exit code instead of racing it", () => {
    const index = read("./index.ts");
    expect(index).toContain('process.env["JAIT_DESKTOP_HOST"] === "1" ? 0 : 1');
  });
});
