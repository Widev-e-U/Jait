import { describe, expect, it } from "vitest";
import { AcpTerminal } from "./acp-terminal.js";

describe("ACP terminal failed spawn lifecycle", () => {
  it("settles exit and completion waits when no child process was created", async () => {
    const terminal = new AcpTerminal({ command: "jait-fixture-missing-acp-executable-7b8d4c" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const status = await Promise.race([
        terminal.waitForExit(),
        new Promise<string>((resolve) => { timer = setTimeout(() => resolve("unresolved"), 300); }),
      ]);
      expect(status).toEqual({ exitCode: null, signal: null });
      expect(terminal.isRunning).toBe(false);
      expect(terminal.currentOutput().output).toContain("[terminal error:");
      expect(await terminal.waitForExit()).toEqual(status);
      expect(await terminal.waitForCompletion()).toMatchObject({ exitCode: null });
    } finally {
      clearTimeout(timer);
      terminal.release();
    }
  });
});

describe("ACP terminal UTF-8 output ceiling", () => {
  it.each([
    { limit: 2, units: [] },
    { limit: 3, units: [0xde00] },
    { limit: 4, units: [0xd83d, 0xde00] },
    { limit: 0, units: [0x78, 0xd83d, 0xde00] },
    { limit: -1, units: [] },
  ])("retains the correct suffix for limit $limit", async ({ limit, units }) => {
    const terminal = new AcpTerminal({
      command: process.execPath,
      args: ["-e", "process.stdout.write('x😀')"],
      outputByteLimit: limit,
    });
    try {
      await terminal.waitForExit();
      const output = terminal.currentOutput().output;
      expect(Array.from({ length: output.length }, (_, i) => output.charCodeAt(i))).toEqual(units);
      if (limit > 0) expect(Buffer.from(output, "utf8").length).toBeLessThanOrEqual(limit);
    } finally {
      terminal.release();
    }
  });
});
