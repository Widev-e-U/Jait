import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { SandboxManager } from "./sandbox-manager.js";

describe.skipIf(process.env["JAIT_TEST_DOCKER"] !== "1")("agent sandbox Docker lifecycle", () => {
  it("recovers an exited gateway's idle sandbox while retaining a live gateway's sandbox", async () => {
    const artifacts = fileURLToPath(new URL("../../../../.jait/artifacts/", import.meta.url));
    mkdirSync(artifacts, { recursive: true });
    const projectRoot = mkdtempSync(join(artifacts, "agent-sandbox-lifecycle-"));
    const previousState = process.env["JAIT_STATE_DIR"];
    process.env["JAIT_STATE_DIR"] = projectRoot;
    const manager = new SandboxManager();
    const cleanup = new Set<string>();
    try {
      const live = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
      cleanup.add(live.containerName);
      const modulePath = fileURLToPath(new URL("./sandbox-manager.ts", import.meta.url));
      const script = `import { SandboxManager } from ${JSON.stringify(modulePath)};
        const session = await new SandboxManager().startCommandSandbox({ projectRoot: ${JSON.stringify(projectRoot)}, networkEnabled: false });
        console.log(JSON.stringify(session));`;
      const dead = JSON.parse(execFileSync("bun", ["-e", script], { encoding: "utf8", timeout: 30_000 }).trim());
      cleanup.add(dead.containerName);
      expect(await manager.isCommandSandboxIdle(live.containerName)).toBe(true);
      expect(await manager.cleanupOrphanedCommandSandboxes()).toEqual([dead.containerName]);
      cleanup.delete(dead.containerName);
      expect(await manager.isCommandSandboxIdle(live.containerName)).toBe(true);
      const background = await manager.execInContainer({ containerName: live.containerName,
        command: "nohup sleep 300 >/dev/null 2>&1 &", timeoutMs: 5_000 });
      expect(background.ok).toBe(true);
      expect(await manager.isCommandSandboxIdle(live.containerName)).toBe(false);
    } finally {
      await Promise.all([...cleanup].map(name => manager.stopContainer(name)));
      if (previousState === undefined) delete process.env["JAIT_STATE_DIR"];
      else process.env["JAIT_STATE_DIR"] = previousState;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
