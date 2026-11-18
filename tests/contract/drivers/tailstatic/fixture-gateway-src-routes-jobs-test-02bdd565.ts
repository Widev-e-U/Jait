// Translated fixture from packages/gateway/src/routes/jobs.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { matchesCronMinute, SchedulerService } from "../../../../packages/gateway/src/scheduler/service.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { registerJobRoutes } from "../../../../packages/gateway/src/routes/jobs.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/jobs.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_15_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { content: "done" } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        name: "daily codex automation",
        cron_expression: "0 9 * * *",
        job_type: "agent_task",
        description: "create daily summary",
        prompt: "Lies den Repo-Status und schreibe ein Daily.",
        provider: "codex",
        model: "gpt-5-codex",
        payload: { allowedTools: "file.list,file.read", title: "fixed cron title", personaAgentId: "agent-1", skillIds: ["research"], runtimeMode: "supervised" },
      },
    });

    __jait_capture(0, (createResponse.statusCode));
    const created = createResponse.json() as { id: string; tool_name: string; prompt: string | null; payload: Record<string, unknown> | null };
    __jait_capture(1, (created.tool_name));
    __jait_capture(2, (created.prompt));
    __jait_capture(3, (created.payload));

    const triggerResponse = await app.inject({
      method: "POST",
      url: `/api/jobs/${created.id}/trigger`,
      headers,
    });

    __jait_capture(4, (triggerResponse.statusCode));
    __jait_capture(5, (executeTool.mock.calls));
    __jait_capture(6, (executeTool.mock.calls[0]?.[0]));
    __jait_capture(7, ((executeTool.mock.calls[0]?.[0] as { input?: Record<string, unknown> }).input));

    const clearedModel = await app.inject({
      method: "PATCH", url: `/api/jobs/${created.id}`, headers,
      payload: { model: null },
    });
    __jait_capture(8, (clearedModel.statusCode));
    __jait_capture(9, (clearedModel.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_85_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        name: "broken agent task",
        cron_expression: "* * * * *",
        job_type: "agent_task",
      },
    });

    __jait_capture(0, (createResponse.statusCode));
    __jait_capture(1, (createResponse.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_116_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "user-1");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers,
      payload: {
        name: "status automation",
        cron_expression: "* * * * *",
        job_type: "system_job",
        payload: {
          command: "gateway_status",
          args: { source: "tests" },
        },
      },
    });

    __jait_capture(0, (createResponse.statusCode));
    const created = createResponse.json() as { id: string; tool_name: string };
    __jait_capture(1, (created.tool_name));

    const triggerResponse = await app.inject({
      method: "POST",
      url: `/api/jobs/${created.id}/trigger`,
      headers,
    });
    __jait_capture(2, (triggerResponse.statusCode));
    __jait_capture(3, (executeTool.mock.calls));

    const runsResponse = await app.inject({
      method: "GET",
      url: `/api/jobs/${created.id}/runs`,
      headers,
    });
    __jait_capture(4, (runsResponse.statusCode));
    const runsPayload = runsResponse.json() as { total: number; items: Array<{ status: string }> };
    __jait_capture(5, (runsPayload.total));
    __jait_capture(6, (runsPayload.items[0]?.status));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_170_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, message: "scheduled", data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "user-1");
    const job = scheduler.create({
      userId: "user-1",
      name: "scheduled status automation",
      cron: "* * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "default",
      projectRoot: process.cwd(),
    });

    await scheduler.tick(new Date("2026-05-12T12:34:00.000Z"));

    const runsResponse = await app.inject({
      method: "GET",
      url: `/api/jobs/${job.id}/runs`,
      headers,
    });

    __jait_capture(0, (runsResponse.statusCode));
    const runsPayload = runsResponse.json() as {
      total: number;
      items: Array<{ status: string; triggered_by: string; result: string | null }>;
    };
    __jait_capture(1, (runsPayload.total));
    __jait_capture(2, (runsPayload.items[0]), ({
      status: "completed",
      triggered_by: "schedule",
      result: JSON.stringify({ handled: true }),
    }));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_216_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    const created = scheduler.create({
      userId: "agent-user",
      name: "legacy agent automation",
      cron: "0 9 * * *",
      toolName: "thread.control",
      input: {
        __jaitJobMeta: { jobType: "agent_task" },
      },
      sessionId: "default",
      projectRoot: process.cwd(),
    });

    const disableResponse = await app.inject({
      method: "PATCH",
      url: `/api/jobs/${created.id}`,
      headers,
      payload: { enabled: false },
    });

    __jait_capture(0, (disableResponse.statusCode));
    __jait_capture(1, (disableResponse.json()));

    const enableResponse = await app.inject({
      method: "PATCH",
      url: `/api/jobs/${created.id}`,
      headers,
      payload: { enabled: true },
    });

    __jait_capture(2, (enableResponse.statusCode));
    __jait_capture(3, (enableResponse.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_265_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const userOneHeaders = await authHeader(config.jwtSecret, "user-1");
    const userTwoHeaders = await authHeader(config.jwtSecret, "user-2");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/jobs",
      headers: userOneHeaders,
      payload: {
        name: "private automation",
        cron_expression: "* * * * *",
        payload: { command: "gateway.status", args: {} },
      },
    });

    __jait_capture(0, (createResponse.statusCode));
    const created = createResponse.json() as { id: string };

    const triggerAsOtherUser = await app.inject({
      method: "POST",
      url: `/api/jobs/${created.id}/trigger`,
      headers: userTwoHeaders,
    });

    __jait_capture(1, (triggerAsOtherUser.statusCode));
    __jait_capture(2, (executeTool.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_306_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    // Simulate a job created by the agent via cron.add: tool_name + input only,
    // with no explicit prompt/provider/model columns.
    scheduler.create({
      userId: "agent-user",
      name: "Duplication check",
      cron: "0 6 * * *",
      toolName: "thread.control",
      input: {
        action: "create",
        kind: "delivery",
        detach: true,
        start: true,
        title: "Duplication check",
        prompt: "Check for duplicated memories and clean them up.",
        providerId: "claude-code",
        model: "claude-opus-4-6",
      },
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/jobs", headers });
    __jait_capture(0, (listResponse.statusCode));
    const listed = (listResponse.json() as { items: Array<Record<string, unknown>> }).items
      .find((job) => job.name === "Duplication check");
    __jait_capture(1, (listed));

    const detailResponse = await app.inject({ method: "GET", url: `/api/jobs/${listed?.id}`, headers });
    __jait_capture(2, (detailResponse.statusCode));
    __jait_capture(3, (detailResponse.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_362_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { handled: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret" };
    registerJobRoutes(app, config, scheduler);

    const headers = await authHeader(config.jwtSecret, "agent-user");

    // Regression: cron.add (agent.spawn path) persists a __jaitJobMeta blob
    // that carries jobType/model/timeZone but NOT the prompt, which lives at
    // the top level of the input. The blob must not shadow the inferred
    // prompt/provider fields, otherwise the edit modal shows no prompt.
    scheduler.create({
      userId: "agent-user",
      name: "jade-code-duplication-audit",
      cron: "0 */2 * * *",
      toolName: "agent.spawn",
      input: {
        __jaitJobMeta: {
          jobType: "agent_task",
          model: "deepseek-v4-flash:0731-cloud",
          timeZone: "UTC",
        },
        prompt: "Audit the entire project for code duplication. Work in /home/jakob/jait.",
      },
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/jobs", headers });
    __jait_capture(0, (listResponse.statusCode));
    const listed = (listResponse.json() as { items: Array<Record<string, unknown>> }).items
      .find((job) => job.name === "jade-code-duplication-audit");
    __jait_capture(1, (listed));

    const detailResponse = await app.inject({ method: "GET", url: `/api/jobs/${listed?.id}`, headers });
    __jait_capture(2, (detailResponse.statusCode));
    __jait_capture(3, (detailResponse.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_416_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const instant = new Date("2026-07-31T05:00:00.000Z");
    __jait_capture(0, (matchesCronMinute("0 7 * * *", instant, "Europe/Berlin")));
    __jait_capture(1, (matchesCronMinute("0 7 * * *", instant, "UTC")));
    __jait_capture(2, (matchesCronMinute("0 7 * * *", instant, "Invalid/Timezone")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_jobs_test_ts_426_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const scheduler = new SchedulerService({ db, executeTool: async () => ({ ok: true }) });
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "schedule-validation-secret" };
    registerJobRoutes(app, config, scheduler);
    const headers = await authHeader(config.jwtSecret, "schedule-owner");
    try {
      for (const cron of ["not-a-cron", "60 * * * *", "*/0 * * * *", "0junk 9 * * *"]) {
        const result = await app.inject({ method: "POST", url: "/api/jobs", headers, payload: { name: "Invalid review", cron_expression: cron, enabled: false } });
        __jait_capture(0, (result.statusCode));
        __jait_capture(1, (result.json().detail));
      }
      __jait_capture(2, (scheduler.list("schedule-owner")));
      const created = await app.inject({ method: "POST", url: "/api/jobs", headers, payload: { name: "Weekly review", cron_expression: "0 9 * * 1", enabled: false } });
      __jait_capture(3, (created.statusCode));
      const id = created.json().id;
      for (const cron of ["not-a-cron", "", 123, null]) {
        const result = await app.inject({ method: "PATCH", url: `/api/jobs/${id}`, headers, payload: { name: "Changed", cron_expression: cron, enabled: true } });
        __jait_capture(4, (result.statusCode));
        __jait_capture(5, (scheduler.get(id)));
      }
    } finally {
      await app.close();
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
