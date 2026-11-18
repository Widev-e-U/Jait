// Translated fixture from packages/gateway/src/sprint7.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SchedulerService } from "../../../../packages/gateway/src/scheduler/service.js";
import { HookBus, registerBuiltInHooks } from "../../../../packages/gateway/src/scheduler/hooks.js";

import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { registerHookRoutes } from "../../../../packages/gateway/src/routes/hooks.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { createToolRegistry } from "../../../../packages/gateway/src/tools/index.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint7.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint7_test_ts_18_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const schedulerA = new SchedulerService({ db, executeTool });

    const created = schedulerA.create({
      name: "daily-health",
      cron: "* * * * *",
      toolName: "gateway.status",
      input: { source: "test" },
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    __jait_capture(0, (schedulerA.list()));
    __jait_capture(1, (created.toolName));

    const updated = schedulerA.update(created.id, { enabled: false, name: "disabled-health" });
    __jait_capture(2, (updated?.enabled));
    __jait_capture(3, (updated?.name));

    const schedulerB = new SchedulerService({ db, executeTool });
    __jait_capture(4, (schedulerB.list()));
    __jait_capture(5, (schedulerB.list()[0]?.name));

    const removed = schedulerB.remove(created.id);
    __jait_capture(6, (removed));
    __jait_capture(7, (schedulerB.list()));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_52_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const systemJob = scheduler.create({
      name: "system-health",
      cron: "0 * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "system",
      projectRoot: "/project/Jait",
    });
    const userJob = scheduler.create({
      userId: "user-a",
      name: "user-a-health",
      cron: "15 * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });
    const otherUserJob = scheduler.create({
      userId: "user-b",
      name: "user-b-health",
      cron: "30 * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "s2",
      projectRoot: "/project/Jait",
    });

    __jait_capture(0, (scheduler.list("user-a").map((job) => job.id).sort()), ([
      systemJob.id,
      userJob.id,
    ].sort()));
    __jait_capture(1, (scheduler.get(systemJob.id, "user-a")?.id), (systemJob.id));
    __jait_captureType(2, (scheduler.get(otherUserJob.id, "user-a")));
    __jait_captureType(3, (scheduler.update(otherUserJob.id, { enabled: false }, "user-a")));
    __jait_capture(4, (scheduler.remove(otherUserJob.id, "user-a")));
    __jait_capture(5, (scheduler.get(otherUserJob.id)?.enabled));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_99_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const onExecuted = vi.fn();
    const scheduler = new SchedulerService({ db, executeTool, onExecuted });

    const job = scheduler.create({
      name: "minutely",
      cron: "* * * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    await scheduler.tick(new Date("2026-03-02T10:15:00.000Z"));

    __jait_capture(0, (executeTool.mock.calls));
    __jait_capture(1, (onExecuted.mock.calls));

    const reloaded = scheduler.get(job.id);
    __jait_captureType(2, (reloaded?.lastRunAt));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_127_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { thread: { id: "thread-1" } } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const job = scheduler.create({
      name: "legacy-agent-task",
      cron: "* * * * *",
      toolName: "agent.spawn",
      input: {
        prompt: "Run the nightly fix",
        description: "nightly fix",
        __jaitJobMeta: {
          jobType: "agent_task",
          provider: "codex",
          model: "gpt-5-codex",
        },
      },
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    await scheduler.trigger(job.id);

    __jait_capture(0, (executeTool.mock.calls));
    const execution = executeTool.mock.calls[0]?.[0] as { input?: Record<string, unknown> };
    __jait_capture(1, (execution.input));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_174_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { thread: { id: "thread-1" } } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const job = scheduler.create({
      name: "saved-agent-task",
      cron: "* * * * *",
      toolName: "thread.control",
      input: {
        action: "create",
        title: "old fixed title",
        kind: "delivery",
        prompt: "Run the scheduled fix",
        start: true,
        detach: true,
        __jaitJobMeta: {
          jobType: "agent_task",
          provider: "codex",
        },
      },
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    await scheduler.trigger(job.id);

    __jait_capture(0, (executeTool.mock.calls));
    const execution = executeTool.mock.calls[0]?.[0] as { input?: Record<string, unknown> };
    __jait_capture(1, (execution.input));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_219_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { thread: { id: "thread-1" } } }));
    const scheduler = new SchedulerService({ db, executeTool });

    const job = scheduler.create({
      name: "legacy-code-quality-rotation",
      cron: "* * * * *",
      toolName: "thread.control",
      input: {
        action: "create",
        title: "Jait code quality rotation",
        kind: "delivery",
        prompt: "Run the scheduled code quality task",
        start: true,
        detach: true,
        __jaitJobMeta: {
          jobType: "agent_thread_job",
          provider: "codex",
        },
      },
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    await scheduler.trigger(job.id);

    __jait_capture(0, (executeTool.mock.calls));
    const execution = executeTool.mock.calls[0]?.[0] as { input?: Record<string, unknown> };
    __jait_capture(1, (execution.input));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_264_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    scheduler.create({
      name: "hourly-with-zero-padding",
      cron: "05 09 * * *",
      toolName: "gateway.status",
      input: {},
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    const runAt = new Date("2026-03-02T09:05:00.000Z");
    await scheduler.tick(runAt);
    await scheduler.tick(runAt);

    __jait_capture(0, (executeTool.mock.calls));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_289_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const executeTool = vi.fn(async () => ({ ok: true, data: { ran: true } }));
    const scheduler = new SchedulerService({ db, executeTool });

    scheduler.create({
      name: "weekday-morning-report",
      cron: "0 9 * * 1-5",
      toolName: "gateway.status",
      input: {},
      sessionId: "s1",
      projectRoot: "/project/Jait",
    });

    await scheduler.tick(new Date("2026-03-02T09:00:00.000Z"));
    await scheduler.tick(new Date("2026-03-08T09:00:00.000Z"));

    __jait_capture(0, (executeTool.mock.calls));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_313_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const hooks = new HookBus();
    const surfaceHandler = vi.fn();

    hooks.on("surface.*", surfaceHandler);
    hooks.emit("surface.connected", { surfaceId: "t1" });
    hooks.emit("surface.exit", { surfaceId: "t1" });

    __jait_capture(0, (surfaceHandler.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_324_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const hooks = new HookBus();
    const projectRoot = join(__jait_fixture_dir, `jait-sprint7-${Date.now()}`);
    mkdirSync(join(projectRoot, ".jait"), { recursive: true });
    writeFileSync(join(projectRoot, ".jait", "bootstrap.md"), "# Bootstrap\nload me");

    const bootstrapSpy = vi.fn();
    hooks.on("session.bootstrap.loaded", bootstrapSpy);
    registerBuiltInHooks(hooks, { defaultProjectRoot: projectRoot });

    hooks.emit("session.start", { sessionId: "s-bootstrap", projectRoot });

    __jait_capture(0, (bootstrapSpy.mock.calls));
    const payload = bootstrapSpy.mock.calls[0]?.[0]?.payload as {
      fileCount: number;
      files: Array<{ path: string; content: string }>;
    };
    __jait_capture(1, (payload.fileCount));
    __jait_capture(2, (payload.files[0]?.path));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_345_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const hooks = new HookBus();
    const wakeSpy = vi.fn(async () => ({ woke: true }));
    const agentSpy = vi.fn(async () => ({ accepted: true }));

    const app = Fastify();
    registerHookRoutes(app, {
      hooks,
      hookSecret: "secret-token",
      onWake: wakeSpy,
      onAgentHook: agentSpy,
    });

    const denied = await app.inject({ method: "POST", url: "/hooks/wake" });
    __jait_capture(0, (denied.statusCode));

    const wake = await app.inject({
      method: "POST",
      url: "/hooks/wake",
      headers: { "x-hook-token": "secret-token" },
    });
    __jait_capture(1, (wake.statusCode));
    __jait_capture(2, (wakeSpy.mock.calls));

    const agent = await app.inject({
      method: "POST",
      url: "/hooks/agent",
      headers: { "x-hook-token": "secret-token" },
      payload: { kind: "external-trigger" },
    });
    __jait_capture(3, (agent.statusCode));
    __jait_capture(4, (agentSpy.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint7_test_ts_385_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    sessionService.create({ name: "Active Session" });

    const ws = new WsControlPlane({
      port: 8000,
      wsPort: 0,
      host: "127.0.0.1",
      logLevel: "silent",
      corsOrigin: "*",
      nodeEnv: "development",
      jwtSecret: "secret",
      llmProvider: "ollama",
      ollamaUrl: "http://localhost:11434",
      ollamaModel: "model",
      openaiApiKey: "",
      openaiModel: "gpt-4o",
      openaiBaseUrl: "https://api.openai.com/v1",
      hookSecret: "secret",
      heartbeatCron: "* * * * *",
    });
    const surfaceRegistry = new SurfaceRegistry();
    const hooks = new HookBus();
    registerBuiltInHooks(hooks);

    const scheduler = new SchedulerService({
      db,
      executeTool: async () => ({ ok: true, data: { noop: true } }),
    });

    const tools = createToolRegistry(surfaceRegistry, {
      scheduler,
      sessionService,
      ws,
      startedAt: Date.now() - 2_000,
      hooks,
    });

    __jait_capture(0, (tools.listNames()));
    __jait_capture(1, (tools.listNames()));
    __jait_capture(2, (tools.listNames()));
    __jait_capture(3, (tools.listNames()));
    __jait_capture(4, (tools.listNames()));

    const status = await tools.execute("gateway.status", {}, {
      actionId: "a1",
      sessionId: "s1",
      projectRoot: "/project/Jait",
      requestedBy: "test",
    });

    __jait_capture(5, (status.ok));
    const statusData = status.data as {
      healthy: boolean;
      scheduler?: { totalJobs: number; enabledJobs: number };
      hooks?: { registeredEventTypes: string[]; listeners: number };
      activeServices: string[];
    };
    __jait_capture(6, (statusData.healthy));
    __jait_capture(7, (statusData.activeServices));
    __jait_capture(8, (statusData.scheduler?.totalJobs));
    __jait_capture(9, (statusData.hooks?.registeredEventTypes));

    sqlite.close();
  
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
