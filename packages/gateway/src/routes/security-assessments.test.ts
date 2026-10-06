import Fastify from "fastify";
import type { SqliteDatabase } from "../db/sqlite-shim.js";
import { describe, it, expect, afterEach, vi } from "vitest";
import { registerSecurityAssessmentRoutes } from "./security-assessments.js";
import { loadConfig } from "../config.js";
import { signAuthToken } from "../security/http-auth.js";
import { getAssessmentService } from "../security/assessment.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function setup(sqlite?: SqliteDatabase) {
  const app = Fastify(); apps.push(app);
  const config = { ...loadConfig(), jwtSecret: "assessment-route-test-secret" };
  registerSecurityAssessmentRoutes(app, config, sqlite);
  const token = await signAuthToken({ id: "route-owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "route-other", username: "other" }, config.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token }, otherHeaders: { authorization: "Bearer " + other } };
}

describe("security assessment API", () => {
  it("requires authentication for history and scope creation", async () => {
    const { app } = await setup();
    expect((await app.inject({ url: "/api/security/assessments" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/security/scopes", payload: {} })).statusCode).toBe(401);
  });
  it("does not infer authorization or accept malformed targets", async () => {
    const { app, headers } = await setup();
    for (const payload of [{}, { authorized: true, targets: ["router.local"] }])
      expect((await app.inject({ method: "POST", url: "/api/security/scopes", headers, payload })).statusCode).toBe(400);
  });
  it("records the authenticated operator and rejects scope/run access by another user", async () => {
    const { app, headers, otherHeaders } = await setup();
    const response = await app.inject({ method: "POST", url: "/api/security/scopes", headers, payload: {
      targets: ["127.0.0.1"], exclusions: [], ports: [1], expiresAt: new Date(Date.now() + 60_000).toISOString(),
      authorized: true, operatorId: "forged", nodeId: "remote-node",
    } });
    expect(response.statusCode).toBe(200);
    const scope = response.json();
    expect(scope.operatorId).toBe("route-owner");
    expect(scope.nodeId).toBe("gateway");
    const denied = await app.inject({ method: "POST", url: "/api/security/assessments", headers: otherHeaders, payload: { scopeId: scope.id } });
    expect(denied.statusCode).toBe(400);
    const started = await app.inject({ method: "POST", url: "/api/security/assessments", headers, payload: { scopeId: scope.id } });
    expect(started.statusCode).toBe(202);
    const run = started.json();
    expect((await app.inject({ url: "/api/security/assessments/" + run.id, headers: otherHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/security/assessments/" + run.id + "/cancel", headers: otherHeaders, payload: {} })).statusCode).toBe(404);
    await getAssessmentService().wait(run.id, "route-owner");
    const final = await app.inject({ url: "/api/security/assessments/" + run.id, headers });
    expect(final.statusCode).toBe(200);
    expect(final.json().status).toBe("completed");
    const otherHistory = await app.inject({ url: "/api/security/assessments", headers: otherHeaders });
    expect(otherHistory.json()).toEqual({ scopes: [], runs: [] });
  });
});

it("binds filesystem roots to an owned local session and rejects remote projects",async()=>{
 let session:{project_path:string;metadata?:string;node_id?:string}|undefined={project_path:process.cwd()};
 const get=vi.fn((id,owner)=>id==="owned"&&owner==="route-owner"?session:undefined);
 const sqlite={prepare:vi.fn(()=>({get}))} as unknown as SqliteDatabase;
 const {app,headers}=await setup(sqlite);
 const payload={sessionId:"owned",projectRoot:"/forged",targets:["127.0.0.1"],exclusions:[],ports:[1],methods:["trivy"],paths:["package.json"],authorized:true,expiresAt:new Date(Date.now()+60_000).toISOString()};
 const local=await app.inject({method:"POST",url:"/api/security/scopes",headers,payload});
 expect(local.statusCode).toBe(200);expect(local.json().projectRoot).toBe(process.cwd());
 expect(get).toHaveBeenLastCalledWith("owned","route-owner");
 session={project_path:process.cwd(),node_id:"remote-fixture"};
 expect((await app.inject({method:"POST",url:"/api/security/scopes",headers,payload})).statusCode).toBe(400);
 session={project_path:process.cwd(),metadata:JSON.stringify({executionNodeId:"remote-fixture"})};
 expect((await app.inject({method:"POST",url:"/api/security/scopes",headers,payload})).statusCode).toBe(400);
 expect((await app.inject({method:"POST",url:"/api/security/scopes",headers,payload:{...payload,sessionId:"other"}})).statusCode).toBe(400);
});
