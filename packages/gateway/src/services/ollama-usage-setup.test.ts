import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { access, stat } from "node:fs/promises";
import { getOllamaUsageSetup } from "./ollama-usage-setup.js";

vi.mock("node:fs/promises", () => ({ access: vi.fn(), stat: vi.fn() }));
vi.mock("node:os", () => ({
  hostname: () => "gateway-host",
  userInfo: () => ({ username: "gateway-user", uid: 1234 }),
  homedir: () => "/home/gateway-user",
}));
beforeEach(() => {
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/custom/key");
  vi.mocked(stat).mockReset().mockResolvedValue({ isFile: () => true } as never);
  vi.mocked(access).mockReset().mockRejectedValue(new Error("EACCES"));
});
afterEach(() => vi.unstubAllEnvs());

describe("Ollama setup guidance", () => {
  it("detects the host and grants only the gateway UID access to an unreadable Linux key", async () => {
    const setup = await getOllamaUsageSetup("http://localhost:11434");
    expect(setup).toMatchObject({ host: "gateway-host", gatewayUser: "gateway-user", keyStatus: "unreadable", keyPath: "/custom/key" });
    if (process.platform === "linux") expect(setup.permissionCommand).toBe("sudo setfacl -m u:1234:r -- '/custom/key'");
  });
  it("quotes operator-configured paths safely", async () => {
    vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/custom/it's a $(key)");
    const setup = await getOllamaUsageSetup("http://localhost:11434");
    if (process.platform === "linux") expect(setup.permissionCommand).toContain("'\\''");
  });
  it("does not inspect local keys for remote backends", async () => {
    expect(await getOllamaUsageSetup("http://other-host:11434")).toMatchObject({ local: false, keyStatus: "remote", permissionCommand: null });
    expect(stat).not.toHaveBeenCalled();
  });
  it("never suggests a permission command for a missing or readable key", async () => {
    vi.mocked(stat).mockRejectedValueOnce(new Error("ENOENT"));
    expect(await getOllamaUsageSetup("http://localhost:11434")).toMatchObject({ keyStatus: "missing", permissionCommand: null });
    vi.mocked(access).mockResolvedValue(undefined);
    expect(await getOllamaUsageSetup("http://localhost:11434")).toMatchObject({ keyStatus: "readable", permissionCommand: null });
  });
});

 it("reports blocked directory traversal as unreadable, without guessing a permission command", async () => {
   vi.mocked(stat).mockRejectedValue(Object.assign(new Error("Permission denied"), { code: "EACCES" }));
   expect(await getOllamaUsageSetup("http://localhost:11434")).toMatchObject({ keyStatus: "unreadable", keyPath: "/custom/key", permissionCommand: null });
 });
