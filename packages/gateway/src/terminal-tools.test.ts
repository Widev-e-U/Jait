import { describe, expect, it } from "vitest";
import {
  createTerminalRunTool,
  getManagedTerminalExecution,
  getManagedTerminalExecutions,
  detectInteractivePrompt,
  rewriteProjectPathForSandboxCommand,
  buildAgentCommand,
} from "./tools/terminal-tools.js";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { SandboxManager } from "./security/sandbox-manager.js";
import { TerminalSurfaceFactory, type TerminalSurface } from "./surfaces/terminal.js";
import { SecretInputService } from "./services/secret-input.js";
import { backgroundCommandMonitor } from "./services/background-command-monitor.js";
import type { WsControlPlane } from "./ws.js";

function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}

function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}

function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
  service = new SecretInputService({
    onRequest: (request) => {
      requests.push({
        title: request.title,
        prompt: request.prompt,
        requestedBy: request.requestedBy,
      });
      queueMicrotask(() => service.submit(request.id, secret, "user-1"));
    },
  });
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}

describe("terminal.run tool status reporting", () => {
  it("returns ok=true when sandbox exit code is zero", async () => {
    const sandbox = new SandboxManager(async () => ({ output: "done", exitCode: 0, timedOut: false }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "echo hi", sandbox: true }, makeContext());

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Sandbox command completed");
    expect((result.data as any).exitCode).toBe(0);
    expect((result.data as any).timedOut).toBe(false);
  });

  it("rewrites host project paths to the sandbox mount path", async () => {
    const commands: string[][] = [];
    const sandbox = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), projectRoot: "/tmp/alice/jait" };

    await tool.execute({ command: "cd /tmp/alice/jait && bun test", sandbox: true }, context);

    expect(commands[0]).toContain("cd /project && bun test");
  });

  it("rewrites quoted project file paths to the sandbox mount path", () => {
    const command = "cat '/tmp/alice/jait/packages/gateway/src/tools/terminal-tools.ts'";

    const rewritten = rewriteProjectPathForSandboxCommand(command, "/tmp/alice/jait");

    expect(rewritten).toBe("cat '/project/packages/gateway/src/tools/terminal-tools.ts'");
  });

  it("does not rewrite path prefixes that only partially match the project root", () => {
    const command = "echo /tmp/alice/jait-backup && cat /tmp/tmp/alice/jait";

    const rewritten = rewriteProjectPathForSandboxCommand(command, "/tmp/alice/jait");

    expect(rewritten).toBe(command);
  });

  it("executes sandbox commands inside a thread sandbox container when provided", async () => {
    const commands: string[][] = [];
    const sandbox = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), projectRoot: "/tmp/alice/jait", sandboxContainerName: "jait-agent-sb-test" };

    const result = await tool.execute({ command: "pwd", sandbox: true }, context);

    expect(result.ok).toBe(true);
    // Container runtime is docker or podman depending on the host (see containerBinary()).
    expect(commands[0]![0]).toMatch(/^(docker|podman)$/);
    expect(commands[0]!.slice(1)).toEqual(["exec", "-w", "/project", "jait-agent-sb-test", "bash", "-lc", "pwd"]);
    expect((result.data as any).threadSandbox).toBe(true);
  });

  it("rewrites host paths before executing inside a thread sandbox container", async () => {
    const commands: string[][] = [];
    const sandbox = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), projectRoot: "/tmp/alice/jait", sandboxContainerName: "jait-agent-sb-test" };

    await tool.execute({ command: "cd /tmp/alice/jait && bun test", sandbox: true }, context);

    expect(commands[0]).toContain("cd /project && bun test");
  });

  it("returns ok=false when sandbox exit code is non-zero", async () => {
    const sandbox = new SandboxManager(async () => ({ output: "error", exitCode: 1, timedOut: false }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "bad-command", sandbox: true }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("exit code 1");
    expect((result.data as any).output).toContain("error");
  });

  it("returns ok=false when sandbox command times out", async () => {
    const sandbox = new SandboxManager(async () => ({
      output: "[timeout after 1000ms]",
      exitCode: null,
      timedOut: true,
    }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "sleep 20", timeout: 1000, sandbox: true }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect((result.data as any).timedOut).toBe(true);
  });

  it("announces the terminal binding before the command is written to the PTY", async () => {
    backgroundCommandMonitor.clearForTests();
    const events: Array<{ sessionId: string; userId?: string; payload: unknown }> = [];
    const writes: string[] = [];
    const surface = {
      id: "term-bind",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return 7; },
      addOutputListener() {},
      removeOutputListener() {},
      write(data: string) {
        // The card cannot attach to output it has already missed, so the
        // binding has to be out before the first byte reaches the shell.
        expect(events).toHaveLength(1);
        writes.push(data);
      },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const ws = {
      broadcastTerminalExecution(sessionId: string, userId: string | undefined, payload: unknown) {
        events.push({ sessionId, userId, payload });
      },
    } as unknown as WsControlPlane;
    const tool = createTerminalRunTool(registry, undefined, ws);

    await tool.execute(
      { command: "printf hi", terminalId: "term-bind", isBackground: true },
      { ...makeContext(), userId: "u-test" },
    );

    expect(writes).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: "s-test",
      userId: "u-test",
      payload: {
        terminalId: "term-bind",
        execution: {
          command: "printf hi",
          actionId: "a-test",
          outputOffset: 7,
          outputEndOffset: null,
          completedAt: null,
          isBackground: true,
          watched: true,
        },
      },
    });
    // The command's full output belongs on the terminal stream, not on every
    // binding event.
    expect(events[0]?.payload).not.toHaveProperty("execution.output");
    backgroundCommandMonitor.clearForTests();
  });

  it("announces the bounded output range when a background command finishes", async () => {
    backgroundCommandMonitor.clearForTests();
    const events: Array<{ payload: { terminalId: string; execution: Record<string, unknown> | null } }> = [];
    let outputOffset = 4;
    let listener: ((data: string) => void) | null = null;
    const writes: string[] = [];
    const surface = {
      id: "term-bind-done",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return outputOffset; },
      addOutputListener(next: (data: string) => void) { listener = next; },
      removeOutputListener() { listener = null; },
      write(data: string) { writes.push(data); },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const ws = {
      broadcastTerminalExecution(_sessionId: string, _userId: string | undefined, payload: never) {
        events.push({ payload });
      },
    } as unknown as WsControlPlane;
    const tool = createTerminalRunTool(registry, undefined, ws);

    await tool.execute(
      { command: "printf hi", terminalId: "term-bind-done", isBackground: true },
      makeContext(),
    );
    const completionToken = writes[0]?.match(/__JAIT_BACKGROUND_DONE_[0-9a-f-]+__/)?.[0];
    outputOffset = 9;
    listener?.(`printf hi\r\nhi\r\n${completionToken}:0\r\n`);

    expect(events.at(-1)?.payload.execution).toMatchObject({
      command: "printf hi",
      outputOffset: 4,
      outputEndOffset: 9,
      watched: false,
    });
    expect(events.at(-1)?.payload.execution?.completedAt).toBeTruthy();
    backgroundCommandMonitor.clearForTests();
  });

  it("background mode appends a completion sentinel after the requested command", async () => {
    backgroundCommandMonitor.clearForTests();
    const writes: string[] = [];
    const surface = {
      id: "term-existing",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return 4; },
      addOutputListener() {},
      removeOutputListener() {},
      write(data: string) {
        writes.push(data);
      },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    const result = await tool.execute({ command: "printf hi", terminalId: "term-existing", isBackground: true }, makeContext());

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ outputOffset: 4 });
    const [agentCommand, sentinel] = (writes[0] ?? "").split("\n");
    expect(agentCommand).toBe(buildAgentCommand("printf hi", "/bin/bash"));
    expect(sentinel).toMatch(/^printf '\\n__JAIT_BACKGROUND_DONE_[0-9a-f-]+__:%s\\n' "\$\?"\r$/);
    expect(getManagedTerminalExecution("term-existing")).toMatchObject({
      command: "printf hi",
      actionId: "a-test",
      outputOffset: 4,
      isBackground: true,
      watched: true,
    });
    backgroundCommandMonitor.clearForTests();
    expect(getManagedTerminalExecution("term-existing")).toBeNull();
  });

  it("persists the completed output range for a watched background command", async () => {
    backgroundCommandMonitor.clearForTests();
    const writes: string[] = [];
    let outputOffset = 4;
    let listener: ((data: string) => void) | null = null;
    const surface = {
      id: "term-background-range",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return outputOffset; },
      addOutputListener(nextListener: (data: string) => void) {
        listener = nextListener;
      },
      removeOutputListener() {
        listener = null;
      },
      write(data: string) {
        writes.push(data);
      },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    await tool.execute(
      { command: "printf hi", terminalId: "term-background-range", isBackground: true },
      makeContext(),
    );
    const completionToken = writes[0]?.match(/__JAIT_BACKGROUND_DONE_[0-9a-f-]+__/)?.[0];
    expect(completionToken).toBeTruthy();

    outputOffset = 5;
    listener?.(`printf hi\r\nhi\r\n${completionToken}:0\r\n`);

    expect(getManagedTerminalExecution("term-background-range")).toBeNull();
    expect(getManagedTerminalExecutions("term-background-range").at(-1)).toMatchObject({
      command: "printf hi",
      actionId: "a-test",
      outputOffset: 4,
      outputEndOffset: 5,
      output: "hi",
      isBackground: true,
      watched: false,
    });
    backgroundCommandMonitor.clearForTests();
  });

  it("runs a background command in its own terminal, separate from the session default", async () => {
    backgroundCommandMonitor.clearForTests();
    const registry = new SurfaceRegistry();
    registry.register(new TerminalSurfaceFactory());
    const tool = createTerminalRunTool(registry);

    // Foreground command creates + records the session default terminal.
    const fg1 = await tool.execute({ command: "printf fg1", timeout: 5000 }, makeContext());
    expect(fg1.ok).toBe(true);
    const fgTerminalId = (fg1.data as any).terminalId as string;
    expect(fgTerminalId).toBeTruthy();

    // Background command must NOT reuse the session default terminal — otherwise
    // the next foreground command would be typed into a busy shell and Ctrl+C it.
    const bg = await tool.execute(
      { command: "printf bg", isBackground: true, timeout: 5000 },
      makeContext(),
    );
    expect(bg.ok).toBe(true);
    const bgTerminalId = (bg.data as any).terminalId as string;
    expect(bgTerminalId).toBeTruthy();
    expect(bgTerminalId).not.toBe(fgTerminalId);

    // Next foreground command reuses the session default terminal.
    const fg2 = await tool.execute({ command: "printf fg2", timeout: 5000 }, makeContext());
    expect(fg2.ok).toBe(true);
    expect((fg2.data as any).terminalId).toBe(fgTerminalId);

    backgroundCommandMonitor.clearForTests();
  });

  it("does not write a second command into an explicitly requested watched terminal", async () => {
    backgroundCommandMonitor.clearForTests();
    const listeners = new Set<(data: string) => void>();
    const writes: string[] = [];
    const surface = {
      id: "term-watched",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return writes.length; },
      addOutputListener(listener: (data: string) => void) { listeners.add(listener); },
      removeOutputListener(listener: (data: string) => void) { listeners.delete(listener); },
      write(data: string) { writes.push(data); },
      snapshot() { return { metadata: { shell: "/bin/bash" } }; },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    const background = await tool.execute(
      { command: "sleep 30", terminalId: "term-watched", isBackground: true },
      makeContext(),
    );
    expect(background.ok).toBe(true);
    expect(backgroundCommandMonitor.hasWatcherForTerminal("term-watched")).toBe(true);

    const foreground = await tool.execute(
      { command: "printf probe", terminalId: "term-watched", timeout: 5 },
      makeContext(),
    );

    expect(foreground.ok).toBe(false);
    expect(foreground.message).toContain("still running a watched background command");
    expect(writes).toHaveLength(1);
    backgroundCommandMonitor.clearForTests();
  });

  it("reattaches a requested remote terminal after gateway surface state is lost", async () => {
    backgroundCommandMonitor.clearForTests();
    const proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];
    const ws = {
      async proxyTerminalOp<T>(nodeId: string, op: string, params: Record<string, unknown>): Promise<T> {
        proxyCalls.push({ nodeId, op, params });
        return { ok: true, pid: 1234, shell: "pwsh.exe", reused: true } as T;
      },
      sendTerminalOp() {},
      broadcastTerminalExecution() {},
    } as unknown as WsControlPlane;
    const registry = new SurfaceRegistry();
    const tool = createTerminalRunTool(registry, undefined, ws);

    const result = await tool.execute(
      { command: "Write-Output hi", terminalId: "term-existing", isBackground: true },
      { ...makeContext(), executionNodeId: "node-1" },
    );

    expect(result.ok).toBe(true);
    expect((result.data as any).terminalId).toBe("term-existing");
    expect(proxyCalls[0]).toMatchObject({
      nodeId: "node-1",
      op: "start",
      params: { terminalId: "term-existing", reuseOnly: true },
    });
    backgroundCommandMonitor.clearForTests();
  });

  it("does not replace an unavailable requested remote terminal", async () => {
    const proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];
    const ws = {
      async proxyTerminalOp<T>(nodeId: string, op: string, params: Record<string, unknown>): Promise<T> {
        proxyCalls.push({ nodeId, op, params });
        throw new Error("Terminal term-missing is not running on this node");
      },
      sendTerminalOp() {},
    } as unknown as WsControlPlane;
    const registry = new SurfaceRegistry();
    const tool = createTerminalRunTool(registry, undefined, ws);

    const result = await tool.execute(
      { command: "Write-Output hi", terminalId: "term-missing" },
      { ...makeContext(), executionNodeId: "node-1" },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Requested terminal term-missing is unavailable");
    expect(proxyCalls).toHaveLength(1);
    expect(proxyCalls[0]).toMatchObject({
      nodeId: "node-1",
      op: "start",
      params: { terminalId: "term-missing", reuseOnly: true },
    });
    expect(registry.listSurfaces()).toEqual([]);
  });

  it("does not replace an unavailable requested local terminal", async () => {
    const registry = new SurfaceRegistry();
    const tool = createTerminalRunTool(registry);

    const result = await tool.execute(
      { command: "printf hi", terminalId: "term-missing" },
      makeContext(),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toBe("Requested terminal term-missing is not running");
    expect(registry.listSurfaces()).toEqual([]);
  });

  it("completes when a non-OSC shell prompt returns", async () => {
    const { tool } = makePromptFallbackTool([
      "rg\r\nCommand 'rg' not found, but can be installed with:\r\nsudo apt install ripgrep\r\nalice@dev-host:~/jait$ ",
    ]);

    const result = await tool.execute({ command: "rg", terminalId: "term-existing", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("exit code 127");
    expect((result.data as any).timedOut).toBe(false);
    expect((result.data as any).output).toContain("Command 'rg' not found");
  });

  it("completes when a zsh-style path prompt returns", async () => {
    const { tool } = makePromptFallbackTool([
      "pwd\r\n/tmp/alice/jait\r\n~/jait % ",
    ], "/bin/zsh");

    const result = await tool.execute({ command: "pwd", terminalId: "term-existing", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(true);
    expect(result.message).toContain("exit code 0");
    expect((result.data as any).timedOut).toBe(false);
    expect((result.data as any).output).toContain("/tmp/alice/jait");
    expect((result.data as any).output).not.toContain("~/jait %");
  });

  it("captures late output that arrives after prompt fallback starts settling", async () => {
    const { tool } = makePromptFallbackTool([
      "echo hi\r\nhi\r\nalice@dev-host:~/jait$ ",
      "\r\nlate formatter output",
    ]);

    const result = await tool.execute({ command: "echo hi", terminalId: "term-existing", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(true);
    expect((result.data as any).timedOut).toBe(false);
    expect((result.data as any).output).toContain("hi");
    expect((result.data as any).output).toContain("late formatter output");
    expect((result.data as any).output).not.toContain("alice@dev-host");
  });

  it("still times out when no OSC marker or shell prompt returns", async () => {
    const { tool, writes } = makePromptFallbackTool(["running without prompt\r\n"]);

    const result = await tool.execute({ command: "long-running", terminalId: "term-existing", timeout: 20 }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect((result.data as any).timedOut).toBe(true);
    expect(writes).toContain("\x03\r");
  });

  it("requests an inline secret when a non-SSH terminal command asks for a password", async () => {
    const { tool, writes, requests } = makeSecretPromptTool();

    const result = await tool.execute({ command: "sudo whoami", terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect((result.data as any).output).toContain("connected");
    expect(writes).toContain("remote-password\r");
    expect(requests).toEqual([{
      title: "Terminal input required",
      prompt: "[sudo] password for alice:",
      requestedBy: "terminal.run",
    }]);
  });

  it("requests an inline secret when an SSH terminal command asks for a password", async () => {
    const { tool, writes, requests } = makeSecretPromptTool();

    const result = await tool.execute({ command: "ssh alice@host", terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect((result.data as any).output).toContain("connected");
    expect(writes).toContain("remote-password\r");
    expect(requests).toEqual([{
      title: "SSH password",
      prompt: "alice@host's password:",
      requestedBy: "terminal.run",
    }]);
  });

  it("does not request a secret for a completed test log containing password prompt fixtures", async () => {
    const command = "bunx vitest run packages/gateway/src/terminal-tools.test.ts";
    const { tool, writes, requests } = makeSecretPromptTool("unused-secret", {
      command,
      output: "[sudo] password for alice: \r\n✓ password fixture passed\r\n\x1b]633;D;0\x07\x1b]633;B\x07",
    });

    const result = await tool.execute({ command, terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect(requests).toEqual([]);
    expect(writes).not.toContain("unused-secret\r");
  });
});


describe("interactive prompt detection", () => {
  it("detects sudo password prompts", () => {
    expect(detectInteractivePrompt("[sudo] password for alice:")).toBe(true);
  });

  it("does not flag regular command output", () => {
    expect(detectInteractivePrompt("build finished successfully")).toBe(false);
  });
});
