import { describe, it, expect, vi } from "vitest";
import { createServer } from "node:net";
import { AssessmentService, validateScope } from "./assessment.js";
import type { SecurityScopeInput, SecurityProbeState } from "@jait/shared";
import { openRawSqlite } from "../db/sqlite-shim.js";
import { migrations } from "../db/migrations.js";

const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});

describe("TCP assessment authorization", () => {
  it.each(["--script=attack", "127.0.0.1;id", "router.local", "http://127.0.0.1", "::1", "192.0.2.0/24", "224.0.0.1", "0.0.0.0", "127.1", "0177.0.0.1"])("rejects unsupported target %s", target => {
    expect(() => validateScope(input({ targets: [target] }))).toThrow();
  });
  it("requires authorization, bounded targets, bounded ports and expiry", () => {
    for (const bad of [
      { authorized: false }, { targets: [] }, { ports: [] }, { ports: [0] }, { ports: [65536] }, { ports: [1.5] },
      { ports: Array(17).fill(22) }, { targets: Array(17).fill("127.0.0.1") },
      { expiresAt: new Date(Date.now() - 1).toISOString() }, { expiresAt: new Date(Date.now() + 3_700_000).toISOString() },
      { exclusions: ["not-an-ip"] }, { exclusions: ["192.0.2.10", "192.0.2.11"] },
    ]) expect(() => validateScope(input(bad))).toThrow();
  });
  it("only dispatches literal included targets and ports; exclusions override targets", async () => {
    const probe = vi.fn(async (): Promise<SecurityProbeState> => "open");
    const service = new AssessmentService(undefined, probe, 0);
    const scope = service.createScope(input({ exclusions: ["192.0.2.11"], targets: ["192.0.2.10", "192.0.2.11", "192.0.2.10"] }), "owner");
    scope.targets.push("203.0.113.5"); // caller mutations cannot expand stored scope
    const run = service.start(scope.id, "owner");
    const result = await service.wait(run.id, "owner");
    expect(probe.mock.calls.map(c => c.slice(0, 2))).toEqual([["192.0.2.10", 22], ["192.0.2.10", 80]]);
    expect(result.plannedChecks).toBe(2);
    expect(result.status).toBe("completed");
    expect(result.observations.every(o => o.evidenceId && o.observedAt)).toBe(true);
  });
  it("enforces ownership, gateway vantage and one active run", async () => {
    const service = new AssessmentService(undefined, async () => "open", 0);
    const scope = service.createScope(input(), "owner");
    expect(() => service.start(scope.id, "other")).toThrow("Scope not found");
    expect(() => service.start(scope.id, "owner", "remote-node")).toThrow("gateway only");
    const run = service.start(scope.id, "owner");
    expect(() => service.start(scope.id, "owner")).toThrow("already running");
    expect(() => service.cancel(run.id, "other")).toThrow("not found");
    expect(service.history("other").runs).toEqual([]);
    await service.wait(run.id, "owner");
  });
  it("rejects an expired scope on repeat execution", async () => {
    const service = new AssessmentService(undefined, async () => "open", 0);
    const scope = service.createScope(input({ expiresAt: new Date(Date.now() + 40).toISOString() }), "owner");
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(() => service.start(scope.id, "owner")).toThrow("expiry");
  });
  it("rechecks expiry between checks and preserves partial evidence", async () => {
    const probe = vi.fn(async (): Promise<SecurityProbeState> => "open");
    const service = new AssessmentService(undefined, probe, 100);
    const scope = service.createScope(input({ expiresAt: new Date(Date.now() + 45).toISOString() }), "owner");
    const result = await service.wait(service.start(scope.id, "owner").id, "owner");
    expect(result.status).toBe("partial");
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.coverageGaps.some(g => g.includes("not performed"))).toBe(true);
  });
  it("cancels an in-flight check and stops further dispatch", async () => {
    const probe = vi.fn((_target: string, _port: number, signal: AbortSignal): Promise<SecurityProbeState> =>
      new Promise(resolve => signal.addEventListener("abort", () => resolve("error"), { once: true })));
    const service = new AssessmentService(undefined, probe, 0);
    const scope = service.createScope(input(), "owner");
    const run = service.start(scope.id, "owner");
    service.cancel(run.id, "owner");
    const result = await service.wait(run.id, "owner");
    expect(result.status).toBe("cancelled");
    expect(result.observations).toEqual([]);
    expect(probe).toHaveBeenCalledTimes(1);
  });
  it("keeps budget expiry distinct from cancellation when wall time does not advance", async () => {
    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now());
    try {
      const service=new AssessmentService(undefined,(_target,_port,signal)=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve("error"),{once:true})),0,10);
      const s=service.createScope(input(),"owner");
      expect((await service.wait(service.start(s.id,"owner").id,"owner")).status).toBe("partial");
    } finally {clock.mockRestore();}
  });
  it("keeps explicit cancellation distinct when the wall clock moves forward", async () => {
    const service=new AssessmentService(undefined,(_target,_port,signal)=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve("error"),{once:true})),0);
    const s=service.createScope(input(),"owner"),run=service.start(s.id,"owner");
    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now()+3600_000);
    try { service.cancel(run.id,"owner");expect((await service.wait(run.id,"owner")).status).toBe("cancelled"); }
    finally {clock.mockRestore();}
  });
  it("bounds total duration and labels incomplete checks", async () => {
    const service = new AssessmentService(undefined, (_target, _port, signal) => new Promise(resolve =>
      signal.addEventListener("abort", () => resolve("error"), { once: true })), 0, 30);
    const scope = service.createScope(input(), "owner");
    const result = await service.wait(service.start(scope.id, "owner").id, "owner");
    expect(result.status).toBe("partial");
    expect(result.observations).toHaveLength(0);
  });
  it("keeps timeout/error observations inconclusive and handles a probe failure", async () => {
    let count = 0;
    const service = new AssessmentService(undefined, async () => {
      count++;
      if (count === 1) return "timeout";
      if (count === 2) return "error";
      throw new Error("untrusted scanner output");
    }, 0);
    const scope = service.createScope(input(), "owner");
    const result = await service.wait(service.start(scope.id, "owner").id, "owner");
    expect(result.observations.map(o => o.state)).toEqual(["timeout", "error"]);
    expect(result.status).toBe("partial");
    expect(JSON.stringify(result)).not.toContain("untrusted scanner output");
  });
  it("retains scope and evidence across service restart", async () => {
    const db = await openRawSqlite(":memory:");
    migrations.find(m => m.id === 67)!.run(db);
    try {
      const service = new AssessmentService(db, async () => "refused", 0);
      const scope = service.createScope(input(), "owner");
      const result = await service.wait(service.start(scope.id, "owner").id, "owner");
      const reopened = new AssessmentService(db);
      expect(reopened.getRun(result.id, "owner")).toEqual(result);
      expect(reopened.history("owner").scopes[0]).toEqual(scope);
      expect(reopened.history("other")).toEqual({ scopes: [], runs: [] });
    } finally { db.close(); }
  });
  it("retains measurements and reports failed completion persistence", async () => {
    const db = await openRawSqlite(":memory:");
    migrations.find(m => m.id === 67)!.run(db);
    try {
      const realPrepare = db.prepare.bind(db);
      let writes = 0;
      vi.spyOn(db, "prepare").mockImplementation(sql => {
        const statement = realPrepare(sql);
        if (sql.startsWith("INSERT INTO security_assessment_runs")) {
          const realRun = statement.run.bind(statement);
          statement.run = (...params: unknown[]) => {
            if (++writes > 1) throw new Error("private storage details");
            return realRun(...params);
          };
        }
        return statement;
      });
      const service = new AssessmentService(db, async () => "open", 0);
      const scope = service.createScope(input(), "owner");
      const result = await service.wait(service.start(scope.id, "owner").id, "owner");
      expect(result.status).toBe("partial");
      expect(result.observations).toHaveLength(4);
      expect(result.coverageGaps.some(g => g.includes("could not be persisted"))).toBe(true);
      expect(JSON.stringify(result)).not.toContain("private storage details");
    } finally { db.close(); }
  });
  it("marks unfinished runs interrupted after restart", async () => {
    const db = await openRawSqlite(":memory:");
    migrations.find(m => m.id === 67)!.run(db);
    try {
      const service = new AssessmentService(db, (_target, _port, signal) => new Promise(resolve =>
        signal.addEventListener("abort", () => resolve("error"), { once: true })), 0);
      const scope = service.createScope(input(), "owner");
      const run = service.start(scope.id, "owner");
      const reopened = new AssessmentService(db);
      expect(reopened.getRun(run.id, "owner").status).toBe("interrupted");
      service.cancel(run.id, "owner");
      await service.wait(run.id, "owner");
    } finally { db.close(); }
  });
});

describe("real TCP before/after verification", () => {
  it("observes a listening service, stops it, and verifies refusal from the same vantage", async () => {
    const server = createServer(socket => socket.end());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected listening address");
    const service = new AssessmentService();
    const scope = service.createScope(input({ targets: ["127.0.0.1"], ports: [address.port] }), "fixture-owner");
    try {
      const before = await service.wait(service.start(scope.id, "fixture-owner").id, "fixture-owner");
      expect(before.observations[0]?.state).toBe("open");
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
      const after = await service.wait(service.start(scope.id, "fixture-owner").id, "fixture-owner");
      expect(after.observations[0]?.state).toBe("refused");
      expect(after.scope.vantagePoint).toBe(before.scope.vantagePoint);
      expect(after.scopeId).toBe(before.scopeId);
      expect(after.status).toBe("completed");
    } finally { if (server.listening) server.close(); }
  });
});
