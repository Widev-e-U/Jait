import { describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import {
  AGENT_HALTED_CODE,
  AgentControlService,
  type AgentControlHooks,
  AgentHaltedError,
  RUNNING_STATE,
  agentHaltedBody,
  isAgentHaltedError,
} from "./agent-control.js";

async function makeService(hooks: AgentControlHooks = {}) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { service: new AgentControlService(db, hooks), sqlite };
}

describe("AgentControlService", () => {
  it("treats a user with no row as running and never invents a halt", async () => {
    const { service, sqlite } = await makeService();
    expect(service.getState("fresh-user")).toEqual(RUNNING_STATE);
    expect(service.isHalted("fresh-user")).toBe(false);
    // Absence of a row must be safe for empty ids too, so callers can pass an
    // unresolved user without guarding every call site.
    expect(service.getState("")).toEqual(RUNNING_STATE);
    expect(service.isHalted("")).toBe(false);
    expect(() => service.assertCanRun("fresh-user")).not.toThrow();
    sqlite.close();
  });

  it("persists a halt, stops running work, and makes assertCanRun authoritative", async () => {
    const stopRunning = vi.fn(async () => 3);
    const onChange = vi.fn();
    const { service, sqlite } = await makeService({ stopRunning, onChange });

    const result = await service.halt("user-1", { reason: "  runaway loop  " });

    expect(stopRunning).toHaveBeenCalledWith("user-1");
    expect(result.stopped).toBe(3);
    expect(result.stopError).toBeNull();
    expect(result.state).toMatchObject({ halted: true, reason: "runaway loop" });
    expect(result.state.haltedAt).toBeTruthy();
    expect(service.isHalted("user-1")).toBe(true);

    // A second user stays untouched: the stop is owner-wide, not global.
    expect(service.isHalted("user-2")).toBe(false);

    expect(() => service.assertCanRun("user-1")).toThrow(AgentHaltedError);
    try {
      service.assertCanRun("user-1", "send-message");
      throw new Error("expected assertCanRun to throw");
    } catch (error) {
      expect(isAgentHaltedError(error)).toBe(true);
      expect((error as AgentHaltedError).code).toBe(AGENT_HALTED_CODE);
      expect((error as AgentHaltedError).action).toBe("send-message");
      expect((error as AgentHaltedError).message).toContain("runaway loop");
    }

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ userId: "user-1" });
    sqlite.close();
  });

  it("keeps the original haltedAt on a repeated stop while still re-running teardown", async () => {
    const stopRunning = vi.fn(async () => 0);
    const { service, sqlite } = await makeService({ stopRunning });

    const first = await service.halt("user-1");
    const second = await service.halt("user-1", { reason: "second thought" });

    expect(second.state.haltedAt).toBe(first.state.haltedAt);
    expect(second.state.reason).toBe("second thought");
    // Re-running the hook is deliberate: a runner that came up between the two
    // calls would otherwise survive the stop.
    expect(stopRunning).toHaveBeenCalledTimes(2);
    sqlite.close();
  });

  it("still halts when the teardown hook throws, reporting the failure separately", async () => {
    const { service, sqlite } = await makeService({
      stopRunning: () => {
        throw new Error("runner refused to die");
      },
    });

    const result = await service.halt("user-1");

    expect(result.state.halted).toBe(true);
    expect(service.isHalted("user-1")).toBe(true);
    expect(result.stopped).toBe(0);
    expect(result.stopError).toBe("runner refused to die");
    expect(() => service.assertCanRun("user-1")).toThrow(AgentHaltedError);
    sqlite.close();
  });

  it("clears state only through resume and never keeps a stale reason or timestamp", async () => {
    const onChange = vi.fn();
    const { service, sqlite } = await makeService({ onChange });

    await service.halt("user-1", { reason: "incident" });
    const state = service.resume("user-1");

    expect(state.halted).toBe(false);
    expect(state.reason).toBeNull();
    expect(state.haltedAt).toBeNull();
    expect(service.isHalted("user-1")).toBe(false);
    expect(() => service.assertCanRun("user-1")).not.toThrow();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1]?.[0]).toMatchObject({ userId: "user-1", state: { halted: false } });
    sqlite.close();
  });

  it("requires a userId to halt or resume so an unknown user is never frozen", async () => {
    const { service, sqlite } = await makeService();
    await expect(service.halt("")).rejects.toThrow(/userId is required/);
    expect(() => service.resume("")).toThrow(/userId is required/);
    sqlite.close();
  });

  it("builds a stable refusal body clients can branch on without parsing prose", async () => {
    const { service, sqlite } = await makeService();
    await service.halt("user-1", { reason: "cost spike" });

    const body = agentHaltedBody(service.getState("user-1"), "start-thread");

    expect(body).toMatchObject({
      code: AGENT_HALTED_CODE,
      halted: true,
      reason: "cost spike",
      action: "start-thread",
    });
    expect(String(body.error)).toContain("Resume agents to continue");

    // A body without an action still names the code, so generic handlers work.
    expect(agentHaltedBody(service.getState("user-1"))).toMatchObject({ action: null });
    sqlite.close();
  });

  it("recognises structurally equivalent halt errors across module instances", () => {
    expect(isAgentHaltedError(new AgentHaltedError())).toBe(true);
    expect(isAgentHaltedError({ code: AGENT_HALTED_CODE })).toBe(true);
    expect(isAgentHaltedError(new Error("other"))).toBe(false);
    expect(isAgentHaltedError(null)).toBe(false);
  });
});
