import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SandboxManager } from "./sandbox-manager.js";

// Explicit opt-in: requires local rootful Docker and jait/sandbox:latest.
// JAIT_TEST_DOCKER=1 bun run test sandbox-ownership.integration.test.ts
describe.skipIf(process.env["JAIT_TEST_DOCKER"] !== "1")("Docker bind-mount ownership", () => {
  const manager = new SandboxManager();
  let projectRoot: string;
  let containerName: string | undefined;

  beforeEach(async () => {
    expect(process.platform).toBe("linux");
    expect(process.getuid?.()).toBeGreaterThan(0);
    expect(process.env["JAIT_SANDBOX_HOST_USER"] ?? "").not.toMatch(/^(0|false)$/);
    projectRoot = await mkdtemp(join(tmpdir(), "sandbox-docker-ownership-"));
    await writeFile(join(projectRoot, "package.json"), '{"name":"ownership-test","version":"1.0.0","private":true}');
  });

  afterEach(async () => {
    if (containerName) await manager.stopContainer(containerName);
    containerName = undefined;
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  async function assertOwnedAndDelete(path: string) {
    const info = await stat(path);
    expect(info.uid).toBe(process.getuid!());
    expect(info.gid).toBe(process.getgid!());
    await rm(path, { recursive: true });
  }

  const command = [
    "set -e",
    "mkdir -p output/nested",
    "echo artifact > output/nested/file",
    'test -w "$HOME"',
    'mkdir -p "$HOME/npm-cache"',
    'npm install --offline --ignore-scripts --cache "$HOME/npm-cache"',
    "git init -q",
    "git status --porcelain >/dev/null",
  ].join("; ");

  it("creates deletable host-owned directories, npm output and Git metadata", async () => {
    const result = await manager.runCommand({ projectRoot, command, timeoutMs: 30_000, networkEnabled: false });
    containerName = result.containerName;
    expect(result.output, "command output").not.toMatch(/EACCES|permission denied/i);
    expect(result.ok, result.output).toBe(true);
    for (const path of ["output/nested/file", "output", "package-lock.json", ".git"]) {
      await assertOwnedAndDelete(join(projectRoot, path));
    }
  });

  it("inherits the same ownership and writable HOME through long-lived docker exec", async () => {
    const session = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
    containerName = session.containerName;
    const result = await manager.execInContainer({ containerName, command, timeoutMs: 30_000 });
    expect(result.ok, result.output).toBe(true);
    await assertOwnedAndDelete(join(projectRoot, "output"));
    await assertOwnedAndDelete(join(projectRoot, "package-lock.json"));
    await assertOwnedAndDelete(join(projectRoot, ".git"));
  });

  it("rejects writes through read-only mounts", async () => {
    const result = await manager.runCommand({
      projectRoot, command: "mkdir /project/output", timeoutMs: 10_000,
      networkEnabled: false, mountMode: "read-only",
    });
    containerName = result.containerName;
    expect(result.ok).toBe(false);
    await expect(stat(join(projectRoot, "output"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
