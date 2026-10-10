import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { execAsync } = vi.hoisted(() => ({ execAsync: vi.fn() }));
vi.mock("node:child_process", () => ({
  exec: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: execAsync }),
}));
import { createOsInstallTool, createOsQueryTool } from "./os-tools.js";
const context = { sessionId: "os-tests", actionId: "os-action", projectRoot: "/project", requestedBy: "test" };
beforeEach(() => { execAsync.mockReset().mockResolvedValue({ stdout: " completed \n", stderr: "" }); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("os.query", () => {
  it("returns basic system information even when optional commands fail", async () => {
    execAsync.mockRejectedValue(new Error("Command unavailable"));
    expect(await createOsQueryTool().execute({ query: "info" }, context)).toMatchObject({
      ok: true, data: { platform: process.platform, pid: process.pid, cwd: process.cwd() },
    });
  });
  it.each(["processes", "disk"] as const)("returns %s command output", async (query) => {
    expect(await createOsQueryTool().execute({ query }, context)).toMatchObject({ ok: true, data: { output: "completed" } });
  });
  it.each(["processes", "disk"] as const)("reports %s command failures", async (query) => {
    execAsync.mockRejectedValue(new Error("Permission denied"));
    expect(await createOsQueryTool().execute({ query }, context)).toEqual({ ok: false, message: "Permission denied" });
  });
  it("exposes only the safe environment subset", async () => {
    vi.stubEnv("JAIT_PRIVATE_TEST_TOKEN", "must-not-leak");
    const result = await createOsQueryTool().execute({ query: "env" }, context);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(execAsync).not.toHaveBeenCalled();
  });
});
describe("os.install", () => {
  it.each(["apt", "brew", "winget"] as const)("dispatches a package through %s and returns output", async (manager) => {
    const result = await createOsInstallTool().execute({ package: "ripgrep", manager }, context);
    expect(result).toMatchObject({ ok: true, data: { manager, stdout: "completed", stderr: "" } });
    expect(execAsync).toHaveBeenCalledWith(expect.stringContaining("ripgrep"), { timeout: 120000 });
  });
  it.each(["ripgrep;echo injected", "$(echo injected)", "ripgrep\nwhoami", "--allow-unauthenticated"])("rejects shell or option injection %s", async (pkg) => {
    expect((await createOsInstallTool().execute({ package: pkg, manager: "apt" }, context)).ok).toBe(false);
    expect(execAsync).not.toHaveBeenCalled();
  });
  it("reports package manager failure", async () => {
    execAsync.mockRejectedValue(new Error("Package not found"));
    expect(await createOsInstallTool().execute({ package: "missing-package", manager: "apt" }, context)).toEqual({ ok: false, message: "Package not found" });
  });
});
