import { describe, expect, it, vi } from "vitest";
import { ProviderUpdateService } from "./provider-updates.js";

describe("ProviderUpdateService", () => {
  it("detects an available Codex update and caches the result", async () => {
    const run = vi.fn(async () => ({ stdout: "codex-cli 0.100.0\n", stderr: "" }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ version: "0.101.0" }), { status: 200 }));
    const service = new ProviderUpdateService({
      execFile: run,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-09-23T12:00:00.000Z"),
    });

    await expect(service.getStatus("codex")).resolves.toEqual({
      currentVersion: "0.100.0",
      latestVersion: "0.101.0",
      updateAvailable: true,
      checkedAt: "2026-09-23T12:00:00.000Z",
    });
    await service.getStatus("codex");

    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://registry.npmjs.org/%40openai%2Fcodex/latest",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) }),
    );
  });

  it("installs a supported update with fixed npm arguments and verifies it", async () => {
    let installed = false;
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === "npm" || command === "npm.cmd") {
        expect(args).toEqual(["install", "--global", "@openai/codex@latest"]);
        installed = true;
        return { stdout: "", stderr: "" };
      }
      return { stdout: installed ? "codex-cli 0.101.0" : "codex-cli 0.100.0", stderr: "" };
    });
    const service = new ProviderUpdateService({
      execFile: run,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ version: "0.101.0" }), { status: 200 })) as typeof fetch,
    });

    await expect(service.update("codex")).resolves.toMatchObject({
      ok: true,
      currentVersion: "0.101.0",
      updateAvailable: false,
    });
  });

  it("does not expose an updater for providers without a known package", async () => {
    const service = new ProviderUpdateService();
    await expect(service.getStatus("jait")).resolves.toBeNull();
    await expect(service.update("jait")).rejects.toThrow("Updates are not supported");
  });
});
