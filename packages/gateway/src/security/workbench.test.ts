import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { getAssessmentService, setAssessmentDb } from "./assessment.js";
import { SecurityWorkbenchService } from "./workbench.js";
import { parseTrivy } from "../lib/security/engines.js";
import { openRawSqlite } from "../db/sqlite-shim.js";
import { migrations } from "../db/migrations.js";
import { evidence, rule, type AdapterResult } from "../lib/security/protocols.js";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); });
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
describe("unified security workflow", () => {
  it("enforces methods, ports, target exclusions, server names, SSH users and node at every entry", () => {
    const s = scope(); const service = new SecurityWorkbenchService();
    const input = {scopeId: s.id, profile: "http" as const, target: "127.0.0.1", port: 80};
    for (const candidate of [
      {...input, target: "192.0.2.1"}, {...input, port: 443}, {...input, profile: "tls"},
      {...input, serverName: "unapproved.invalid"}, {...input, username: "root"},
      {...input, path: "../secret"},
    ]) expect(() => service.start(candidate as typeof input, "owner")).toThrow();
    expect(() => service.start(input, "other")).toThrow();
    expect(() => service.start(input, "owner", "remote-node")).toThrow("gateway only");
    const host = scope(["host-audit"], [80]);
    expect(() => service.start({scopeId:host.id, profile:"host-audit", target:"127.0.0.1", username:"root"}, "owner")).toThrow();
  });
  it("creates cited findings, preserves decisions, prepares rollback and verifies a real HTTP fix", async () => {
    let fixed = false;
    const server = createServer((_request, response) => { if (fixed) response.setHeader("X-Content-Type-Options", "nosniff"); response.end("fixture"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise(resolve => server.close(() => resolve())));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Expected port");
    const s = scope(["http"], [address.port]); const service = new SecurityWorkbenchService();
    const before = await service.wait(service.start({scopeId:s.id, profile:"http", target:"127.0.0.1", port:address.port}, "owner").id, "owner");
    const finding = service.history("owner").findings.find(f => f.ruleId === "http.nosniff")!;
    expect(finding.evidenceIds.every(id => before.evidence.some(e => e.id === id))).toBe(true);
    expect(service.plan(finding.id, "owner").rollback.length).toBeGreaterThan(0);
    service.decide(finding.id, "owner", "accepted-risk");
    const repeated = await service.wait(service.start(before.input, "owner").id, "owner");
    expect(service.finding(finding.id, "owner").disposition).toBe("accepted-risk");
    expect(before.findings[0]?.evidenceIds).not.toEqual(repeated.findings[0]?.evidenceIds);
    fixed = true;
    const verified = await service.verify(finding.id, "owner");
    expect(verified.status).toBe("verified-absent");
    expect(service.finding(finding.id, "owner").disposition).toBe("verified-absent");
    const report = service.report(before.id, "owner");
    expect(JSON.stringify(report)).not.toContain("127.0.0.1");
    expect(report.findings.some(f => f.evidenceIds.some(id => before.evidence.some(e => e.id === id)))).toBe(true);
    expect(service.history("other")).toEqual({runs:[], findings:[]});
  });
  it("never marks timeout, missing-engine, changed-engine or incomplete checks fixed", async () => {
    let output = fixture(); const service = new SecurityWorkbenchService(undefined, async () => output);
    const s = scope(); const first = await service.wait(service.start({scopeId:s.id, profile:"http", target:"127.0.0.1", port:80}, "owner").id, "owner");
    const id = first.findingIds[0]!;
    output = fixture(false, false);
    expect((await service.verify(id, "owner")).status).toBe("inconclusive");
    expect(service.finding(id, "owner").disposition).toBe("open");
    output = {...fixture(false), engineVersion:"2"};
    expect((await service.verify(id, "owner")).status).toBe("inconclusive");
  });
  it("shares the execution lease with TCP inventory and retains cancellation", async () => {
    const adapter = vi.fn((_input, _scope, signal: AbortSignal): Promise<AdapterResult> => new Promise(resolve => signal.addEventListener("abort", () => resolve(fixture(false, false)), {once:true})));
    const service = new SecurityWorkbenchService(undefined, adapter); const s = scope(["http", "tcp"]);
    const run = service.start({scopeId:s.id, profile:"http", target:"127.0.0.1", port:80}, "owner");
    expect(() => getAssessmentService().start(s.id,"owner")).toThrow("already running");
    expect(() => service.cancel(run.id,"other")).toThrow();
    service.cancel(run.id,"owner"); const result = await service.wait(run.id,"owner");
    expect(result.status).toBe("cancelled");
  });
  it("requires the specific Trivy configuration rule to pass, rather than disappearing behind different coverage",async()=>{
    const s=getAssessmentService().createScope({targets:["127.0.0.1"],exclusions:[],ports:[1],methods:["trivy"],paths:["Dockerfile"],authorized:true,expiresAt:new Date(Date.now()+60_000).toISOString()},"owner",process.cwd());
    let raw=JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"FAIL",Severity:"HIGH"}]}]});
    const service=new SecurityWorkbenchService(undefined,async()=>parseTrivy(raw,"Dockerfile","0.75.0"));
    const input={scopeId:s.id,profile:"trivy" as const,path:"Dockerfile"};
    const before=await service.wait(service.start(input,"owner").id,"owner");
    const finding=before.findings[0]!;
    raw=JSON.stringify({SchemaVersion:2,Results:[{Class:"lang-pkgs",Type:"npm"}]});
    expect((await service.verify(finding.id,"owner")).status).toBe("inconclusive");
    expect(service.finding(finding.id,"owner").disposition).toBe("open");
    raw=JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"PASS"}]}]});
    expect((await service.verify(finding.id,"owner")).status).toBe("verified-absent");
  });
  it("labels scope expiry as partial even when the wall clock remains frozen",async()=>{
    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now());
    try{
      const s=getAssessmentService().createScope({targets:["127.0.0.1"],exclusions:[],ports:[80],methods:["http"],authorized:true,expiresAt:new Date(Date.now()+20).toISOString()},"owner");
      const service=new SecurityWorkbenchService(undefined,(_input,_scope,signal)=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve(fixture(false,false)),{once:true})));
      const run=await service.wait(service.start({scopeId:s.id,profile:"http",target:"127.0.0.1",port:80},"owner").id,"owner");
      expect(run.status).toBe("partial");
    }finally{clock.mockRestore();}
  });
  it("persists immutable evidence and recovers runs while keeping ownership", async () => {
    const db = await openRawSqlite(":memory:");
    for (const id of [67,68]) migrations.find(m => m.id === id)!.run(db);
    setAssessmentDb(db);
    try {
      const s = scope(); const service = new SecurityWorkbenchService(db, async () => ({...fixture(), raw:"private artifact", contentType:"text/plain"}));
      const run = await service.wait(service.start({scopeId:s.id,profile:"http",target:"127.0.0.1",port:80},"owner").id,"owner");
      expect(run.artifact?.sha256).toMatch(/^[a-f0-9]{64}$/);
      const recovered = new SecurityWorkbenchService(db);
      expect(recovered.get(run.id,"owner")).toEqual(run);
      expect(recovered.history("other").findings).toEqual([]);
      expect(JSON.stringify(recovered.report(run.id,"owner"))).not.toContain("private artifact");
      recovered.deleteRun(run.id,"owner");
      expect((db.prepare("SELECT count(*) AS n FROM security_artifacts").get() as {n:number}).n).toBe(0);
    } finally {
      const fresh = await openRawSqlite(":memory:"); migrations.find(m => m.id === 67)!.run(fresh); setAssessmentDb(fresh);
      cleanup.push(async () => fresh.close()); db.close();
    }
  });
});
