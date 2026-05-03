import { describe, expect, it } from "vitest";
import { createTerminalRunTool, detectInteractivePrompt } from "./tools/terminal-tools.js";
import { SurfaceRegistry } from "./surfaces/registry.js";
import { SandboxManager } from "./security/sandbox-manager.js";
import type { TerminalSurface } from "./surfaces/terminal.js";
import { SecretInputService } from "./services/secret-input.js";

function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    workspaceRoot: process.cwd(),
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

function makeSecretPromptTool(secret = "remote-password") {
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
      if (data === "ssh jakob@host\r") {
        queueMicrotask(() => listener?.("jakob@host's password: "));
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

  it("rewrites host workspace paths to the sandbox mount path", async () => {
    const commands: string[][] = [];
    const sandbox = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), workspaceRoot: "/home/jakob/jait" };

    await tool.execute({ command: "cd /home/jakob/jait && bun test", sandbox: true }, context);

    expect(commands[0]).toContain("cd /workspace && bun test");
  });

  it("executes sandbox commands inside a thread sandbox container when provided", async () => {
    const commands: string[][] = [];
    const sandbox = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), workspaceRoot: "/home/jakob/jait", sandboxContainerName: "jait-agent-sb-test" };

    const result = await tool.execute({ command: "pwd", sandbox: true }, context);

    expect(result.ok).toBe(true);
    expect(commands[0]).toEqual(["docker", "exec", "-w", "/workspace", "jait-agent-sb-test", "bash", "-lc", "pwd"]);
    expect((result.data as any).threadSandbox).toBe(true);
  });

  it("rewrites host paths before executing inside a thread sandbox container", async () => {
    const commands: string[][] = [];
    const sandbox = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), workspaceRoot: "/home/jakob/jait", sandboxContainerName: "jait-agent-sb-test" };

    await tool.execute({ command: "cd /home/jakob/jait && bun test", sandbox: true }, context);

    expect(commands[0]).toContain("cd /workspace && bun test");
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

  it("completes when a non-OSC shell prompt returns", async () => {
    const { tool } = makePromptFallbackTool([
      "rg\r\nCommand 'rg' not found, but can be installed with:\r\nsudo apt install ripgrep\r\njakob@movable-base:~/jait$ ",
    ]);

    const result = await tool.execute({ command: "rg", terminalId: "term-existing", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("exit code 127");
    expect((result.data as any).timedOut).toBe(false);
    expect((result.data as any).output).toContain("Command 'rg' not found");
  });

  it("completes when a zsh-style path prompt returns", async () => {
    const { tool } = makePromptFallbackTool([
      "pwd\r\n/home/jakob/jait\r\n~/jait % ",
    ], "/bin/zsh");

    const result = await tool.execute({ command: "pwd", terminalId: "term-existing", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(true);
    expect(result.message).toContain("exit code 0");
    expect((result.data as any).timedOut).toBe(false);
    expect((result.data as any).output).toContain("/home/jakob/jait");
    expect((result.data as any).output).not.toContain("~/jait %");
  });

  it("captures late output that arrives after prompt fallback starts settling", async () => {
    const { tool } = makePromptFallbackTool([
      "echo hi\r\nhi\r\njakob@movable-base:~/jait$ ",
      "\r\nlate formatter output",
    ]);

    const result = await tool.execute({ command: "echo hi", terminalId: "term-existing", timeout: 1000 }, makeContext());

    expect(result.ok).toBe(true);
    expect((result.data as any).timedOut).toBe(false);
    expect((result.data as any).output).toContain("hi");
    expect((result.data as any).output).toContain("late formatter output");
    expect((result.data as any).output).not.toContain("jakob@movable-base");
  });

  it("still times out when no OSC marker or shell prompt returns", async () => {
    const { tool, writes } = makePromptFallbackTool(["running without prompt\r\n"]);

    const result = await tool.execute({ command: "long-running", terminalId: "term-existing", timeout: 20 }, makeContext());

    expect(result.ok).toBe(false);
    expect(result.message).toContain("timed out");
    expect((result.data as any).timedOut).toBe(true);
    expect(writes).toContain("\x03\r");
  });

  it("requests an inline secret when a terminal command asks for a password", async () => {
    const { tool, writes, requests } = makeSecretPromptTool();

    const result = await tool.execute({ command: "ssh jakob@host", terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    expect((result.data as any).output).toContain("connected");
    expect(writes).toContain("remote-password\r");
    expect(requests).toEqual([{
      title: "Terminal input required",
      prompt: "jakob@host's password:",
      requestedBy: "terminal.run",
    }]);
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
