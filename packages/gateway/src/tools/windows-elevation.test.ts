import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { SecretInputService } from "../services/secret-input.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { buildToolSchemas } from "./agent-loop.js";
import type { ToolContext } from "./contracts.js";
import { createToolRegistry } from "./index.js";
import { runWindowsElevatedCommand, type ElevatedSpawnFactory } from "./windows-elevation.js";

const context = {
  sessionId: "elevated-test-session",
  actionId: "elevated-test-action",
  projectRoot: process.cwd(),
  requestedBy: "agent",
  userId: "user-1",
} as ToolContext;

class FakeSpawnedProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  kill(): boolean {
    this.emit("close", 143, "SIGTERM");
    return true;
  }
}

function fakeSpawn(stdout: string) {
  const calls: Array<{ command: string; args: string[]; env: NodeJS.ProcessEnv | undefined }> = [];
  const factory: ElevatedSpawnFactory = (command, args, options) => {
    const proc = new FakeSpawnedProcess();
    calls.push({ command, args, env: options.env });
    queueMicrotask(() => {
      proc.stdout.write(stdout);
      proc.emit("close", 0, null);
    });
    return proc;
  };
  return { factory, calls };
}

function decodedScript(args: string[]): string {
  return Buffer.from(args[args.indexOf("-EncodedCommand") + 1]!, "base64").toString("utf16le");
}

describe("terminal.run elevated schema", () => {
  it("exposes elevated/username/reason without a password parameter and drops elevated.run", () => {
    const tools = createToolRegistry(new SurfaceRegistry(), { secretInputService: new SecretInputService() });
    const byName = new Map(buildToolSchemas(tools).map((schema) => [schema.function.name, schema]));
    const properties = (byName.get("terminal_run")?.function.parameters as { properties: Record<string, unknown> }).properties;

    expect(properties).toHaveProperty("elevated");
    expect(properties).toHaveProperty("reason");
    expect(properties).not.toHaveProperty("password");
    expect(byName.has("elevated_run")).toBe(false);
  });
});

describe("runWindowsElevatedCommand", () => {
  it("uses UAC (-Verb RunAs) when no username is provided", async () => {
    const { factory, calls } = fakeSpawn(JSON.stringify({ exitCode: 0, stdout: "uac-output\n", stderr: "" }));

    const result = await runWindowsElevatedCommand({ command: "Get-Service", cwd: process.cwd(), timeoutMs: 5000 }, context, factory);

    expect(result).toMatchObject({ exitCode: 0, stdout: "uac-output", timedOut: false });
    expect(calls[0]?.command).toBe("powershell.exe");
    const script = decodedScript(calls[0]!.args);
    expect(script).toContain("-Verb RunAs");
    expect(script).not.toContain("-Credential");
  });

  it("uses credential elevation with the password only in the child environment", async () => {
    const { factory, calls } = fakeSpawn(JSON.stringify({ exitCode: 3, stdout: "", stderr: "denied\n" }));

    const result = await runWindowsElevatedCommand(
      { command: "Get-Service", cwd: process.cwd(), timeoutMs: 5000, username: ".\\Administrator", password: "hunter2" },
      context,
      factory,
    );

    expect(result).toMatchObject({ exitCode: 3, stderr: "denied" });
    const script = decodedScript(calls[0]!.args);
    expect(script).toContain("-Credential");
    expect(script).not.toContain("-Verb RunAs");
    expect(script).not.toContain("hunter2");
    expect(calls[0]?.args.join(" ")).not.toContain("hunter2");
    expect(calls[0]?.env?.JAIT_ELEVATED_PASSWORD).toBe("hunter2");
  });
});
