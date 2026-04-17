import { describe, expect, it, vi } from "vitest";
import type { AuditWriter } from "../services/audit.js";
import { SecretInputService } from "../services/secret-input.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { ToolRegistry } from "./registry.js";
import { buildTieredToolSchemas } from "./agent-loop.js";
import { createToolRegistry } from "./index.js";
import {
  createSshRunTool,
  createSshSessionCloseTool,
  createSshSessionRunTool,
  createSshSessionStartTool,
  type SshPtyFactory,
} from "./ssh-tools.js";

function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    workspaceRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}

function autoSubmitSecret(secret = "remote-password") {
  let service: SecretInputService;
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
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
  return { service, requests, secret };
}

class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}

function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}

describe("ssh tools for external providers", () => {
  it("executes ssh.run for a Codex-like provider without putting the password in tool inputs or audit output", async () => {
    const { service, requests, secret } = autoSubmitSecret();
    const { factory } = fakePtyFactory();
    const registry = new ToolRegistry();
    registry.register(createSshRunTool(service, factory));
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "ssh.run",
      {
        host: "linux-box.local",
        username: "jakob",
        command: "printf codex-remote",
        strictHostKeyChecking: false,
      },
      context({ providerId: "codex", requestedBy: "agent" }),
      audit,
    );

    expect(result.ok).toBe(true);
    expect((result.data as { output: string }).output).toContain("codex-remote");
    expect(requests).toEqual([{
      title: "SSH password",
      prompt: "Password for jakob@linux-box.local",
      requestedBy: "ssh.run",
    }]);
    expect(JSON.stringify(auditEntries)).not.toContain(secret);
    expect(auditEntries[0]).toMatchObject({
      actionType: "tool.execute",
      toolName: "ssh.run",
      inputs: expect.not.objectContaining({ password: expect.anything() }),
    });
  });
});

describe("ssh tools for Jait provider tool discovery", () => {
  it("exposes SSH tools through the tiered schema path without password parameters", () => {
    const tools = createToolRegistry(new SurfaceRegistry(), {
      secretInputService: new SecretInputService(),
    });

    const schemas = buildTieredToolSchemas(tools);
    const byName = new Map(schemas.map((schema) => [schema.function.name, schema]));

    expect(byName.has("ssh_run")).toBe(true);
    expect(byName.has("ssh_session_start")).toBe(true);
    expect(byName.has("ssh_session_run")).toBe(true);
    expect(byName.has("ssh_session_close")).toBe(true);
    expect(byName.get("ssh_run")?.function.parameters).not.toHaveProperty("properties.password");
    expect(byName.get("ssh_session_start")?.function.parameters).not.toHaveProperty("properties.password");
  });
});

describe("persistent ssh sessions", () => {
  it("starts an SSH PTY, runs commands with preserved session state, and closes it", async () => {
    const { service } = autoSubmitSecret();
    const { factory, ptys } = fakePtyFactory();
    const startTool = createSshSessionStartTool(service, factory);
    const runTool = createSshSessionRunTool();
    const closeTool = createSshSessionCloseTool();

    const startPromise = startTool.execute({
      host: "linux-box.local",
      username: "jakob",
      strictHostKeyChecking: false,
    }, context({ providerId: "jait" }));
    const started = await startPromise;

    expect(started.ok).toBe(true);
    const sshSessionId = (started.data as { sshSessionId: string }).sshSessionId;
    expect(sshSessionId).toMatch(/^ssh-/);
    expect(ptys[0]?.writes.some((write) => write.includes("remote-password"))).toBe(true);

    const ran = await runTool.execute({
      sshSessionId,
      command: "pwd",
    }, context({ providerId: "jait" }));

    expect(ran.ok).toBe(true);
    expect((ran.data as { output: string }).output).toContain("/stateful-directory");

    const closed = await closeTool.execute({ sshSessionId }, context({ providerId: "jait" }));
    expect(closed.ok).toBe(true);
  });
});
