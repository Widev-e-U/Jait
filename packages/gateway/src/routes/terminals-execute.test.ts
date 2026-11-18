import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import type { ControlAccess } from "../security/control-access.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { AuditWriter } from "../services/audit.js";
import { ToolRegistry } from "../tools/registry.js";
import { registerTerminalRoutes } from "./terminals.js";

const osc = (payload: string) => `\x1b]633;${payload}\x07`;

async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    expect(response.statusCode).toBe(200);
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}

describe("PowerShell terminal execution", () => {
  it("waits past an echoed command for output and shell completion", async () => {
    const result = await executeWithOutput("echo JAIT_TERM_OK", [
      [0, "PS C:\\project> echo JAIT_TERM_OK"],
      [180, `\r\n${osc("C")}JAIT_TERM_OK\r\n${osc("D;0")}${osc("A")}PS C:\\project> ${osc("B")}`],
    ]);
    expect(result).toMatchObject({ output: expect.stringContaining("JAIT_TERM_OK"), exitCode: 0, timedOut: false });
  });

  it("retains a native failure code after its echoed command", async () => {
    const result = await executeWithOutput("cmd /c exit 7", [
      [0, "PS C:\\project> cmd /c exit 7"],
      [180, `\r\n${osc("C")}${osc("D;7")}${osc("A")}PS C:\\project> ${osc("B")}`],
    ]);
    expect(result).toMatchObject({ exitCode: 7, timedOut: false });
  });

  it("preserves program output that begins with PS and contains a greater-than sign", async () => {
    const result = await executeWithOutput("Write-Output 'PS report > complete'", [
      [0, `PS report > complete\r\n${osc("D;0")}${osc("B")}`],
    ]);
    expect(result.output).toBe("PS report > complete");
  });
});


describe("terminal tool listing", () => {
  it("returns registered tool metadata for the terminal client", async () => {
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "terminal-list-test-secret" };
    const registry = new ToolRegistry();
    registry.register({ name: "terminal.coverage_fixture", description: "Fixture tool", category: "terminal",
      tier: "standard", source: "builtin", parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "ok" }),
    });
    registerTerminalRoutes(app, {} as SurfaceRegistry, registry, { write: vi.fn() } as unknown as AuditWriter,
      undefined, undefined, { config, access: {} as ControlAccess });
    try {
      const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
      const response = await app.inject({ method: "GET", url: "/api/tools", headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(200);
      expect(response.json().tools).toEqual([expect.objectContaining({ name: "terminal.coverage_fixture",
        description: "Fixture tool", category: "terminal", source: "builtin" })]);
    } finally {
      await app.close();
    }
  });
});


it.each([
  ["permission denied", 126],
  ["command not found", 127],
  ["completed", 0],
])("uses prompt completion and reports fallback status for %s", async (output, exitCode) => {
  const result = await executeWithOutput("run-fixture", [[0, `run-fixture\r\n${output}\r\nPS C:\\project> `]]);
  expect(result).toMatchObject({ output, exitCode, timedOut: false });
});
