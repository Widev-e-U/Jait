// Translated fixture from packages/gateway/src/routes/plan-runs.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFileListTool, createFilePatchTool, createFileReadTool, createFileWriteTool } from "../../../../packages/gateway/src/tools/file-tools.js";
import type { PlanTask } from "@jait/shared";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { inertWorkspaces } from "../../../../packages/gateway/src/services/orchestration/inert-workspaces.js";
import { OrchestrationService } from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import type { UserService } from "../../../../packages/gateway/src/services/users.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { PlanService } from "../../../../packages/gateway/src/services/plans.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { registerPlanRoutes } from "../../../../packages/gateway/src/routes/plans.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/plan-runs.test.ts",import.meta.url).href;
const __jait_require=__jait_createRequire(__jait_original_url);
const __jait_original_dir=__jait_fileURLToPath(new URL('.',__jait_original_url));
const __jait_fixture_dir=__jait_fileURLToPath(new URL('../../../../.jait/artifacts/gateway-rust-readiness/tailstatic-fixtures/',import.meta.url));
const __jait_symbols=new Map<symbol,number>();
const __jait_nestedRefs=new WeakMap<object,number>();let __jait_nextNestedRef=1;
function __jait_nestedRef(value:object):number{let id=__jait_nestedRefs.get(value);if(!id){id=__jait_nextNestedRef++;__jait_nestedRefs.set(value,id)}return id;}
// Fixture transport only. Rust owns all comparison semantics.
function __jait_boxed(value: any): any {
 const type=typeof value;
 if(type==='symbol'){let id=__jait_symbols.get(value);if(!id){id=__jait_symbols.size+1;__jait_symbols.set(value,id)}return {type,value:id};}
 if(type==='function')return {type,name:value.name};
 if(type==='undefined')return {type};
 if(type==='bigint')return {type,value:String(value)};
 if(type==='number'&&!Number.isFinite(value))return {type:'nonfinite',value:String(value)};
 const prototype=type==='object'&&value!==null?(Object.getPrototypeOf(value)?.constructor?.name??null):null;
 if(value instanceof Error)value={...value,name:value.name,message:value.message,...('cause' in value?{cause:value.cause}:{})};
 return JSON.parse(JSON.stringify({type,value,prototype},function(this:any,_key:string,child:any){const original=Object.getOwnPropertyDescriptor(this,_key)?.value;if(original instanceof Date)return {__jait_type:'date',value:Number.isNaN(original.getTime())?'NaN':original.toISOString()};if(typeof child==='string'&&!child.isWellFormed())return {__jait_type:'utf16',units:Array.from({length:child.length},(_,i)=>child.charCodeAt(i))};if(typeof AbortSignal!=='undefined'&&child instanceof AbortSignal)return {__jait_type:'AbortSignal',aborted:child.aborted,ref:__jait_nestedRef(child)};if(child instanceof Map)return {__jait_type:'map',entries:[...child]};if(child instanceof Set)return {__jait_type:'set',values:[...child]};if(child instanceof RegExp)return {__jait_type:'regexp',source:child.source,flags:child.flags};if(ArrayBuffer.isView(child)&&!(child instanceof DataView))return {__jait_type:child.constructor.name,values:Array.from(child as any)};if(typeof child==='number'&&!Number.isFinite(child))return {__jait_type:'nonfinite',value:String(child)};return typeof child==='bigint'?{__jait_type:'bigint',value:String(child)}:typeof child==='undefined'?{__jait_type:'undefined'}:typeof child==='function'?{__jait_type:'function',ref:__jait_nestedRef(child)}:child;}));
}

export async function run(name: string): Promise<unknown> {
 await __jait_mkdir(__jait_fixture_dir,{recursive:true});
 const __jait_observations: any[]=[];
 const __jait_record=(row:any)=>{__jait_observations.push(row);__jait_observe(row)};
 const __jait_refs=new WeakMap<object,number>(); let __jait_nextRef=1;
 const __jait_ref=(v:any)=>{if((typeof v!=='object'||v===null)&&typeof v!=='function')return null;let n=__jait_refs.get(v);if(!n){n=__jait_nextRef++;__jait_refs.set(v,n)}return n};
 const __jait_capture=(slot:number,actual:any,...other:any[])=>{const row:any={slot,actual:__jait_boxed(actual),ref:__jait_ref(actual)};if(Array.isArray(actual)||actual instanceof Set)row.itemRefs=Array.from(actual,__jait_ref);if(other.length){row.other=__jait_boxed(other[0]);row.otherRef=__jait_ref(other[0])}__jait_record(row)};
 const __jait_captureType=(slot:number,actual:any)=>__jait_record({slot,actual:(typeof actual==='object'&&actual!==null)?{type:'object',value:{}}:__jait_boxed(actual)});
 const __jait_captureResolved=async(slot:number,p:Promise<unknown>,...other:any[])=>__jait_capture(slot,await p,...other);
 const __jait_errorRow=(slot:number,e:any,expected?:any)=>{const errorTypes=[],prototypes=[];let p=e&&typeof e==='object'?Object.getPrototypeOf(e):null;while(p){if(p.constructor?.name)errorTypes.push(p.constructor.name);prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}const identity=typeof expected==='function';if(identity&&(expected[Symbol.hasInstance]!==Function.prototype[Symbol.hasInstance]||expected.prototype===null||typeof expected.prototype!=='object'))throw new Error('unsupported exception constructor identity');return {slot,threw:true,error:String(e instanceof Error?e.message:e),errorTypes,...(identity?{prototypes,expectedPrototype:__jait_ref(expected.prototype)}:{})}};
 const __jait_thrown=(slot:number,fn:()=>unknown,...other:any[])=>{let row:any;try{fn();row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_rejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{await p;row={slot,threw:false}}catch(e){row=__jait_errorRow(slot,e,other[0])}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_captureRejected=async(slot:number,p:Promise<unknown>,...other:any[])=>{let row:any;try{const actual=await p;row={slot,threw:false,actual:__jait_boxed(actual)}}catch(e){row={...__jait_errorRow(slot,e,other[0]),actual:__jait_boxed(e)}}if(other.length)row.other=__jait_boxed(other[0]);__jait_record(row)};
 const __jait_instance=(slot:number,actual:any,expected:any,threw?:boolean)=>{const prototypes=[];let p=actual==null?null:Object.getPrototypeOf(actual);while(p){prototypes.push(__jait_ref(p));p=Object.getPrototypeOf(p)}__jait_record({slot,prototypes,expectedPrototype:__jait_ref(expected.prototype),...(threw===undefined?{}:{threw})})};
 const __jait_instanceRejected=async(slot:number,p:Promise<unknown>,expected:any)=>{let actual:any,threw=false;try{actual=await p}catch(e){actual=e;threw=true}__jait_instance(slot,actual,expected,threw)};
 switch(name){
case "tailstatic_packages_gateway_src_routes_plan_runs_test_ts_76_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-test-secret" };
const task: PlanTask = {
  id: "analyze",
  title: "Analyze project",
  description: "Inspect the project",
  status: "approved",
  verification: [{ id: "output", label: "Result exists", check: { kind: "artifact", path: "result.txt" } }],
};
async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let database: Awaited<ReturnType<typeof openDatabase>>;
let orchestration: OrchestrationService;
let planService: PlanService;
let planId: string;
let halted: boolean;
const __jait_hook_1873 = async () => {
    database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    app = Fastify();
    halted = false;
    const repoService = new RepositoryService(database.db);
    planService = new PlanService(database.db);
    const repo = repoService.create({ userId: owner, name: "repo", localPath: process.cwd() });
    planId = planService.create({ userId: owner, repoId: repo.id, title: "Plan", tasks: [task] }).id;
    orchestration = new OrchestrationService({
      db: database.db,
      workspaces: inertWorkspaces,
      isHalted: () => halted,
      executor: {
        execute: ({ signal, recordAgentRef, attemptNo }) => {
          recordAgentRef?.(`worker-${attemptNo}`);
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    registerPlanRoutes(app, config, { planService, repoService, orchestration });
  };
const __jait_hook_2866 = async () => {
    orchestration.stopForUser(owner);
    await orchestration.settle();
    await app.close();
    database.sqlite.close();
  };
await __jait_hook_1873();
try {
await (async()=>{

    const headers = await auth(owner);
    const start = await app.inject({ method: "POST", url: `/api/plans/${planId}/runs`, headers, payload: {} });
    __jait_capture(0, (start.statusCode));
    const url = `/api/plan-runs/${start.json().run.id}`;
    const inspect = await app.inject({ method: "GET", url, headers });
    __jait_capture(1, (inspect.json().run.tasks), ([{ taskId: task.id, state: "running" }]));
    const outsider = await auth("outsider");
    __jait_capture(2, ((await app.inject({ method: "GET", url })).statusCode));
    __jait_capture(3, ((await app.inject({ method: "GET", url, headers: outsider })).statusCode));
    __jait_capture(4, ((await app.inject({ method: "POST", url: `${url}/cancel`, headers: outsider })).statusCode));
    const cancel = await app.inject({ method: "POST", url: `${url}/cancel`, headers });
    __jait_capture(5, (cancel.statusCode));
    __jait_capture(6, (cancel.json().run.status));
  
})();

} finally {
await __jait_hook_2866();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_plan_runs_test_ts_92_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-test-secret" };
const task: PlanTask = {
  id: "analyze",
  title: "Analyze project",
  description: "Inspect the project",
  status: "approved",
  verification: [{ id: "output", label: "Result exists", check: { kind: "artifact", path: "result.txt" } }],
};
async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let database: Awaited<ReturnType<typeof openDatabase>>;
let orchestration: OrchestrationService;
let planService: PlanService;
let planId: string;
let halted: boolean;
const __jait_hook_1873 = async () => {
    database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    app = Fastify();
    halted = false;
    const repoService = new RepositoryService(database.db);
    planService = new PlanService(database.db);
    const repo = repoService.create({ userId: owner, name: "repo", localPath: process.cwd() });
    planId = planService.create({ userId: owner, repoId: repo.id, title: "Plan", tasks: [task] }).id;
    orchestration = new OrchestrationService({
      db: database.db,
      workspaces: inertWorkspaces,
      isHalted: () => halted,
      executor: {
        execute: ({ signal, recordAgentRef, attemptNo }) => {
          recordAgentRef?.(`worker-${attemptNo}`);
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    registerPlanRoutes(app, config, { planService, repoService, orchestration });
  };
const __jait_hook_2866 = async () => {
    orchestration.stopForUser(owner);
    await orchestration.settle();
    await app.close();
    database.sqlite.close();
  };
await __jait_hook_1873();
try {
await (async()=>{

    const url = `/api/plans/${planId}/runs`;
    __jait_capture(0, ((await app.inject({ method: "POST", url, headers: await auth("outsider"), payload: {} })).statusCode));
    const headers = await auth(owner);
    planService.update(planId, { tasks: [{ ...task, status: "proposed" }] });
    const unapproved = await app.inject({ method: "POST", url, headers, payload: {} });
    __jait_capture(1, (unapproved.statusCode));
    __jait_capture(2, (unapproved.json().issues));
    halted = true;
    __jait_capture(3, ((await app.inject({ method: "POST", url, headers, payload: {} })).statusCode));
    __jait_capture(4, (orchestration.listRuns(owner)));
  
})();

} finally {
await __jait_hook_2866();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_plan_runs_test_ts_105_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-test-secret" };
const task: PlanTask = {
  id: "analyze",
  title: "Analyze project",
  description: "Inspect the project",
  status: "approved",
  verification: [{ id: "output", label: "Result exists", check: { kind: "artifact", path: "result.txt" } }],
};
async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let database: Awaited<ReturnType<typeof openDatabase>>;
let orchestration: OrchestrationService;
let planService: PlanService;
let planId: string;
let halted: boolean;
const __jait_hook_1873 = async () => {
    database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    app = Fastify();
    halted = false;
    const repoService = new RepositoryService(database.db);
    planService = new PlanService(database.db);
    const repo = repoService.create({ userId: owner, name: "repo", localPath: process.cwd() });
    planId = planService.create({ userId: owner, repoId: repo.id, title: "Plan", tasks: [task] }).id;
    orchestration = new OrchestrationService({
      db: database.db,
      workspaces: inertWorkspaces,
      isHalted: () => halted,
      executor: {
        execute: ({ signal, recordAgentRef, attemptNo }) => {
          recordAgentRef?.(`worker-${attemptNo}`);
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    registerPlanRoutes(app, config, { planService, repoService, orchestration });
  };
const __jait_hook_2866 = async () => {
    orchestration.stopForUser(owner);
    await orchestration.settle();
    await app.close();
    database.sqlite.close();
  };
await __jait_hook_1873();
try {
await (async()=>{

    const headers = await auth(owner);
    const run = orchestration.createRun(owner, { planId });
    // Wait until the worker has started, so the halt interrupts a running attempt with its worker identity.
    await new Promise((resolve) => setTimeout(resolve, 0));
    orchestration.stopForUser(owner);
    await orchestration.settle();
    const request = { method: "POST" as const, url: `/api/plan-runs/${run.id}/resume`, headers };
    __jait_capture(0, ((await app.inject({ ...request, payload: {} })).statusCode));
    __jait_capture(1, ((await app.inject({ ...request, payload: { decisions: [{}] } })).statusCode));
    const resumed = await app.inject({ ...request, payload: { decisions: [{ taskId: task.id, decision: "retry", note: "Checked workspace" }] } });
    __jait_capture(2, (resumed.statusCode));
    __jait_capture(3, (resumed.json().run.tasks), ([{ taskId: task.id, state: "running", attemptCount: 2 }]));
    const url = `/api/plan-runs/${run.id}/tasks/${task.id}/attempts`;
    // The resumed attempt prepares its workspace before the worker starts, so let that step finish first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const history = await app.inject({ url, headers });
    __jait_capture(4, (history.statusCode));
    __jait_capture(5, (history.json().attempts));
    __jait_capture(6, ((await app.inject({ url, headers: await auth("outsider") })).statusCode));
    __jait_capture(7, ((await app.inject({ url: `/api/plan-runs/${run.id}/tasks/missing/attempts`, headers })).statusCode));
  
})();

} finally {
await __jait_hook_2866();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_plan_runs_test_ts_131_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const owner = "owner";
const config = { ...loadConfig(), jwtSecret: "plan-runs-test-secret" };
const task: PlanTask = {
  id: "analyze",
  title: "Analyze project",
  description: "Inspect the project",
  status: "approved",
  verification: [{ id: "output", label: "Result exists", check: { kind: "artifact", path: "result.txt" } }],
};
async function auth(userId: string) {
  const token = await signAuthToken({ id: userId, username: userId }, config.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let database: Awaited<ReturnType<typeof openDatabase>>;
let orchestration: OrchestrationService;
let planService: PlanService;
let planId: string;
let halted: boolean;
const __jait_hook_1873 = async () => {
    database = await openDatabase(":memory:");
    migrateDatabase(database.sqlite);
    app = Fastify();
    halted = false;
    const repoService = new RepositoryService(database.db);
    planService = new PlanService(database.db);
    const repo = repoService.create({ userId: owner, name: "repo", localPath: process.cwd() });
    planId = planService.create({ userId: owner, repoId: repo.id, title: "Plan", tasks: [task] }).id;
    orchestration = new OrchestrationService({
      db: database.db,
      workspaces: inertWorkspaces,
      isHalted: () => halted,
      executor: {
        execute: ({ signal, recordAgentRef, attemptNo }) => {
          recordAgentRef?.(`worker-${attemptNo}`);
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        },
      },
    });
    registerPlanRoutes(app, config, { planService, repoService, orchestration });
  };
const __jait_hook_2866 = async () => {
    orchestration.stopForUser(owner);
    await orchestration.settle();
    await app.close();
    database.sqlite.close();
  };
await __jait_hook_1873();
try {
await (async()=>{

    const headers = await auth(owner);
    const run = orchestration.createRun(owner, { planId });
    const listed = await app.inject({ url: "/api/plan-runs", headers });
    __jait_capture(0, (listed.statusCode));
    __jait_capture(1, (listed.json().runs.map((item: { id: string }) => item.id)), (run.id));
    const others = await app.inject({ url: "/api/plan-runs", headers: await auth("outsider") });
    __jait_capture(2, (others.json().runs));
  
})();

} finally {
await __jait_hook_2866();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
