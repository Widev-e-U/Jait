import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { SandboxManager } from "../security/sandbox-manager.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { ToolContext } from "./contracts.js";
import { createJaitTerminalTool } from "./terminal-tools.js";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";

describe.skipIf(process.env["JAIT_TEST_DOCKER"] !== "1")("sandbox background Docker lifecycle", () => {
  const manager = new SandboxManager();
  const tool = createJaitTerminalTool({} as SurfaceRegistry, manager);
  let projectRoot: string;
  let containerName: string;
  let context: ToolContext;
  beforeEach(async () => {
    const artifacts = resolve(__dirname, "../../../../.jait/artifacts/sandbox-background");
    await mkdir(artifacts, { recursive: true });
    projectRoot = await mkdtemp(join(artifacts, "docker-"));
    const session = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
    containerName = session.containerName;
    context = { sessionId: "docker-test", actionId: "action", requestedBy: "test", projectRoot, sandboxContainerName: containerName };
  });
  afterEach(async () => {
    backgroundCommandMonitor.clearForTests();
    if (containerName) await manager.stopContainer(containerName);
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  });

  it("releases a real listening server and cancels it without stopping the thread container", async () => {
    const abort = new AbortController();
    const start = Date.now();
    const notify = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notify);
    const result = await tool.execute({
      sandbox: true, isBackground: true, timeout: 30000,
      command: `bun -e 'Bun.serve({hostname:"127.0.0.1",port:3411,fetch(){return new Response("ok")}}); console.log("Listening")'`,
    }, { ...context, signal: abort.signal });
    expect(Date.now() - start).toBeLessThan(6000);
    expect(result.ok, result.message).toBe(true);
    expect(result.data).toMatchObject({ isBackground: true, exitCode: null, watched: true });
    expect((result.data as { output: string }).output).toContain("Listening");
    const probe = await manager.execInContainer({
      containerName, timeoutMs: 5000,
      command: `bun -e 'console.log(await (await fetch("http://127.0.0.1:3411")).text())'`,
    });
    expect(probe.output).toBe("ok");
    abort.abort();
    await new Promise(resolve => setTimeout(resolve, 2500));
    const after = await manager.execInContainer({
      containerName, timeoutMs: 5000,
      command: `bun -e 'try { await fetch("http://127.0.0.1:3411"); process.exit(1) } catch { console.log("stopped") }'`,
    });
    expect(after.ok, after.output).toBe(true);
    expect(after.output).toBe("stopped");
    expect(notify).not.toHaveBeenCalled();
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  }, 15000);

  it("reports timeout completion exactly once and bounds noisy output", async () => {
    const notify = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notify);
    const result = await tool.execute({
      sandbox: true, isBackground: true, timeout: 1500,
      command: `bun -e 'console.log("x".repeat(50000)); setInterval(()=>{},1000)'`,
    }, context);
    expect(result.ok).toBe(true);
    expect((result.data as { output: string }).output.length).toBeLessThanOrEqual(16000);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(notify.mock.calls[0]![0]).toMatchObject({ exitCode: 124, sessionId: "docker-test" });
    expect(notify.mock.calls[0]![0].output.length).toBeLessThanOrEqual(16000);
  }, 10000);

  it("does not reinterpret quotes, substitutions or multiline commands outside the container", async () => {
    const result = await tool.execute({
      sandbox: true, isBackground: true,
      command: "printf '%s\\n' '$(echo literal)' '`echo also-literal`'\nprintf 'container=%s\\n' \"$PWD\"\nexit 9",
    }, context);
    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({ exitCode: 9, isBackground: false });
    const output = (result.data as { output: string }).output;
    expect(output).toContain("$(echo literal)");
    expect(output).toContain("`echo also-literal`");
    expect(output).toContain("container=/project");
    expect(output).not.toContain("__JAIT_SANDBOX_PID_");
  }, 10000);

  it("supports standalone background containers with host-owned bind writes", async () => {
    const abort = new AbortController();
    const result = await tool.execute({
      sandbox: true, isBackground: true, timeout: 15000,
      command: "id -u; echo owned > owned.txt; sleep 10",
    }, { ...context, sandboxContainerName: undefined, signal: abort.signal });
    expect(result.data).toMatchObject({ isBackground: true, threadSandbox: false });
    const { stat } = await import("node:fs/promises");
    expect((await stat(join(projectRoot, "owned.txt"))).uid).toBe(process.getuid!());
    abort.abort();
    await new Promise(resolve => setTimeout(resolve, 2500));
    expect(backgroundCommandMonitor.activeCount).toBe(0);
  }, 10000);
});
