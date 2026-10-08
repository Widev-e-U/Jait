import { describe, expect, it } from "vitest";
import { ExecutionGuard } from "./execution-guard.js";

describe("bounded execution", () => {
  it("stops the same infrastructure failure across aliases and arguments after two retries", () => {
    const guard = new ExecutionGuard();
    for (const tool of ["execute", "terminal.run", "jait.terminal"]) {
      expect(guard.beforeCall()).toBeUndefined();
      guard.record(tool, { ok: false, message: "Command failed", data: { output: "fatal: not a git repository: /host/.git", exitCode: 128 } });
    }
    expect(guard.beforeCall()).toContain("two retries");
    expect(guard.snapshot().calls).toBe(3);
  });

  it("counts only new evidence, not labels, ranges, acknowledgments or todos", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 20; i++) {
      guard.beforeCall();
      guard.record("todo", { ok: true, message: `Progress ${i}`, data: { items: [] } });
    }
    expect(guard.stopReason).toContain("no new evidence");
    const progressing = new ExecutionGuard();
    for (let i = 0; i < 20; i++) {
      progressing.beforeCall();
      progressing.record("read", { ok: true, message: `Read range ${i}`, data: { content: "1\tNew evidence" } });
    }
    expect(progressing.stopReason).toBeUndefined();
    for (let i = 0; i < 20; i++) {
      progressing.beforeCall();
      progressing.record("file.read", { ok: true, message: "Different tool", data: { content: "New evidence" } });
    }
    expect(progressing.stopReason).toContain("no new evidence");
  });

  it("does not count MCP aliases for todos and coordination as progress", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 20; i++) {
      guard.beforeCall();
      guard.record(["mcp__jait_core__todo", "mcp__jait__team_chat", "mcp__jait__tools_search"][i % 3]!,
        { ok: true, message: `Acknowledged ${i}`, data: { id: `different-result-${i}` } });
    }
    expect(guard.stopReason).toContain("no new evidence");
  });

  it("preserves limits and partial progress across a restart", () => {
    const guard = new ExecutionGuard();
    guard.beforeCall(); guard.record("read", { ok: true, message: "fact", data: { content: "fact" } });
    guard.beforeCall(); guard.record("execute", { ok: false, message: "Source chat not found" });
    guard.beforeCall(); guard.record("team.chat", { ok: false, message: "Source chat not found" });
    const restored = new ExecutionGuard(guard.snapshot());
    restored.beforeCall(); restored.record("team.chat", { ok: false, message: "Source chat not found" });
    expect(restored.stopReason).toContain("Thread sender identity");
    expect(restored.snapshot().calls).toBe(4);
  });

  it("counts infrastructure errors hidden by successful shell pipelines across retries", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("jait.terminal", { ok: true, message: "Command completed", data: { exitCode: 0,
        output: "bash: bun: command not found; diagnostic attempt " + i } });
    }
    expect(guard.stopReason).toContain("Required executable unavailable");
  });

  it("bounds recovery across different environment failures and persists its budget", () => {
    let guard = new ExecutionGuard();
    const outputs = ["bun: command not found", "Cannot find module better-sqlite3", "Permission denied",
      "ENOENT: project", "Consent request timed out", "No test files found"];
    for (const output of outputs) {
      guard.beforeCall();
      guard.record("terminal.run", { ok: false, message: output });
      guard = new ExecutionGuard(guard.snapshot());
    }
    expect(guard.stopReason).toContain("environment recovery");
  });

  it("does not treat source text mentioning environment errors as a tool failure", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("file.read", { ok: true, message: "Read", data: { content: "command not found; permission denied" } });
    }
    expect(guard.stopReason).toBeUndefined();
  });

  it("does not count successful shell searches through error-handling source as failures", () => {
    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("jait.terminal", { ok: true, message: "Command completed", data: { exitCode: 0,
        output: "src/guard.ts: if (/command not found|permission denied/.test(message)) return;" } });
    }
    expect(guard.stopReason).toBeUndefined();
  });

  it("enforces a hard limit despite new observations on every call", () => {
    const guard = new ExecutionGuard(undefined, 120);
    for (let i = 0; i < 120; i++) {
      expect(guard.beforeCall()).toBeUndefined();
      guard.record("read", { ok: true, message: `fact ${i}` });
    }
    expect(guard.beforeCall()).toContain("120 tool calls");
    expect(guard.snapshot().calls).toBe(120);
  });
});
