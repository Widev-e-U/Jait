import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { AuditWriter } from "../services/audit.js";
import { SecretInputService } from "../services/secret-input.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { buildTieredToolSchemas } from "./agent-loop.js";
import { createToolRegistry } from "./index.js";
import { ToolRegistry } from "./registry.js";
import { createElevatedRunTool, type ElevatedSpawnFactory } from "./elevated-tools.js";

function context(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "elevated-test-session",
    actionId: "elevated-test-action",
    workspaceRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}

function autoSubmitSecret(secret = "sudo-password") {
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

class FakeSpawnedProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdinWrites: string[] = [];
  constructor(private readonly onStdinWrite?: (chunk: string, proc: FakeSpawnedProcess) => void) {
    super();
  }
  readonly stdin = {
    write: (chunk: string) => {
      this.stdinWrites.push(chunk);
      this.onStdinWrite?.(chunk, this);
    },
  };

  kill(): boolean {
    this.emit("close", 143, "SIGTERM");
    return true;
  }
}

function fakeSpawnFactory(onSpawn?: (command: string, args: string[], proc: FakeSpawnedProcess) => void) {
  const calls: Array<{ command: string; args: string[]; proc: FakeSpawnedProcess }> = [];
  const factory: ElevatedSpawnFactory = (command, args) => {
    const proc = new FakeSpawnedProcess((chunk, current) => {
      if (chunk.includes("sudo-password")) {
        current.stdout.write("root-owned output\n");
        current.emit("close", 0, null);
      }
    });
    calls.push({ command, args, proc });
    onSpawn?.(command, args, proc);
    return proc;
  };
  return { factory, calls };
}

describe("elevated.run for external providers", () => {
  it("executes with a secret prompt and keeps the password out of tool inputs and audit output", async () => {
    const { service, requests, secret } = autoSubmitSecret();
    const { factory, calls } = fakeSpawnFactory();
    const registry = new ToolRegistry();
    registry.register(createElevatedRunTool(service, factory, {
      platform: () => "linux",
      getuid: () => 1000,
    }));
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "elevated.run",
      {
        command: "apt-get update",
        reason: "install system packages",
      },
      context(),
      audit,
    );

    expect(result.ok).toBe(true);
    expect((result.data as { output: string }).output).toContain("root-owned output");
    expect(requests).toEqual([{
      title: "Administrator password",
      prompt: "Password to run an elevated command: install system packages",
      requestedBy: "elevated.run",
    }]);
    expect(calls[0]?.command).toBe("sudo");
    expect(calls[0]?.args).toEqual(["-S", "-k", "-p", "", "--", "sh", "-lc", "apt-get update"]);
    expect(JSON.stringify(auditEntries)).not.toContain(secret);
    expect(auditEntries[0]).toMatchObject({
      actionType: "tool.execute",
      toolName: "elevated.run",
    });
  });
});

describe("elevated.run for Jait provider tool discovery", () => {
  it("exposes the elevated tool through the tiered schema path without password parameters", () => {
    const tools = createToolRegistry(new SurfaceRegistry(), {
      secretInputService: new SecretInputService(),
    });

    const schemas = buildTieredToolSchemas(tools);
    const byName = new Map(schemas.map((schema) => [schema.function.name, schema]));

    expect(byName.has("elevated_run")).toBe(true);
    expect(byName.get("elevated_run")?.function.parameters).not.toHaveProperty("properties.password");
  });
});

describe("elevated.run on Windows", () => {
  it("requires an explicit administrator username", async () => {
    const { service } = autoSubmitSecret();
    const tool = createElevatedRunTool(service, fakeSpawnFactory().factory, {
      platform: () => "win32",
      getuid: () => undefined,
    });

    const result = await tool.execute({
      command: "Get-Service",
    }, context());

    expect(result.ok).toBe(false);
    expect(result.message).toBe("On Windows, elevated.run requires `username` for an administrator account");
  });

  it("runs powershell under the provided administrator account without exposing the password in inputs", async () => {
    const { service, requests, secret } = autoSubmitSecret();
    const { factory, calls } = fakeSpawnFactory((command, args, proc) => {
      if (command !== "powershell.exe") return;
      queueMicrotask(() => {
        expect(args).toContain("-EncodedCommand");
        proc.stdout.write(JSON.stringify({
          exitCode: 0,
          stdout: "windows-admin-output\n",
          stderr: "",
        }));
        proc.emit("close", 0, null);
      });
    });
    const registry = new ToolRegistry();
    registry.register(createElevatedRunTool(service, factory, {
      platform: () => "win32",
      getuid: () => undefined,
    }));
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "elevated.run",
      {
        command: "Get-Service",
        username: ".\\Administrator",
        reason: "inspect local services",
      },
      context(),
      audit,
    );

    expect(result.ok).toBe(true);
    expect((result.data as { output: string }).output).toContain("windows-admin-output");
    expect(requests).toEqual([{
      title: "Administrator password",
      prompt: "Password for .\\Administrator to run an elevated command: inspect local services",
      requestedBy: "elevated.run",
    }]);
    expect(calls[0]?.command).toBe("powershell.exe");
    expect(JSON.stringify(calls[0])).not.toContain(secret);
    expect(JSON.stringify(auditEntries)).not.toContain(secret);
    expect(auditEntries[0]).toMatchObject({
      actionType: "tool.execute",
      toolName: "elevated.run",
      inputs: expect.not.objectContaining({ password: expect.anything() }),
    });
  });
});
