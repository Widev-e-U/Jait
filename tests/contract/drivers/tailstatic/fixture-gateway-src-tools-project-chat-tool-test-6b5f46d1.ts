// Translated fixture from packages/gateway/src/tools/project-chat-tool.test.ts; expected literals are in tail_static.rs.

import { fileURLToPath } from "node:url";

import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { messages } from "../../../../packages/gateway/src/db/schema.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { createProjectChatTool } from "../../../../packages/gateway/src/tools/project-chat-tool.js";
import { ASK_MODE_TOOLS, MUTATING_TOOLS } from "../../../../packages/gateway/src/tools/chat-modes.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/project-chat-tool.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_22_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (MUTATING_TOOLS.has("project.chat.create")));
    __jait_capture(1, (ASK_MODE_TOOLS.has("project.chat.create")));
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_26_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const projectService = new ProjectService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("project-chat-test", "password123");
    userService.updateSettings(user.id, { jaitBackend: "openrouter", apiKeys: { OPENROUTER_API_KEY: "fixture" } });
    const origin = sessionService.create({ userId: user.id, name: "Personal" });
    sessionState.set(origin.id, { "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" }, "chat.providerRuntimeMode": "supervised" });
    const root = fileURLToPath(new URL("../../../../", __jait_original_url));
    const project = projectService.create({ userId: user.id, title: "Target", rootPath: root, nodeId: "gateway" });
    let release = () => {};
    const done = new Promise<void>(resolve => { release = resolve; });
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)));
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ async start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"working"},"finish_reason":null}]}\n\n'));
        await done;
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      } }), { headers: { "Content-Type": "text/event-stream" } });
    }));
    const app = await createServer(config, { db, sqlite, userService, projectService, sessionService, sessionStateService: sessionState });
    const tool = createProjectChatTool({ projectService, sessionService, sessionState, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    const message = "  Please fix this.\nPreserve this exact second line.\n";
    try {
      const result = await tool.execute({ projectId: project.id, title: "Follow-up", message }, { userId: user.id, sessionId: origin.id, projectRoot: root, actionId: "test", requestedBy: "test" });
      __jait_capture(0, (result.ok));
      const data = result.data as { session: { id: string }; href: string; accepted: boolean };
      __jait_capture(1, (data.session.id), (origin.id));
      __jait_capture(2, (data.href), (`/chat?sessionId=${data.session.id}`));
      __jait_captureType(3, (sessionService.getById(origin.id, user.id)?.projectId));
      __jait_capture(4, (sessionService.listByProject(project.id).map(chat => chat.id)), ([data.session.id]));
      __jait_capture(5, (sessionState.get(data.session.id)));
      await vi.waitFor(() => {
        const rows = db.select().from(messages).where(eq(messages.sessionId, data.session.id)).all();
        __jait_capture(6, (rows.find(row => row.role === "user")?.content), (message));
        __jait_capture(7, (requests.length));
      });
      __jait_capture(8, (requests[0]));
      __jait_capture(9, (JSON.stringify(requests[0])));
      release();
      await vi.waitFor(() => __jait_capture(10, (db.select().from(messages).where(eq(messages.sessionId, data.session.id)).all().some(row => row.role === "assistant"))));
    } finally {
      release();
      await app.close();
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_80_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db), sessionState = new SessionStateService(db);
    const user = userService.createUser("project-chat-effort", "password123");
    const source = sessionService.create({ userId: user.id, name: "Origin" });
    sessionState.set(source.id, { "chat.provider": "jait", "chat.cliModels": { jait: "old" }, "chat.reasoningEffort": "low" });
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", __jait_original_url)), nodeId: "gateway" });
    const app = Fastify();
    let submitted: any;
    app.post("/api/chat", async (request, reply) => { submitted = request.body; return reply.type("text/event-stream").send('data: {"type":"request"}\n\n'); });
    const tool = createProjectChatTool({ projectService, sessionService, sessionState, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    try {
      const result = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex", model: "gpt-test", reasoningEffort: "ultra" }, { userId: user.id, sessionId: source.id, actionId: "test", requestedBy: "test" });
      __jait_capture(0, (result.ok));
      const session = (result.data as { session: { id: string } }).session;
      __jait_capture(1, (submitted), ({ sessionId: session.id, provider: "codex", model: "gpt-test", reasoningEffort: "ultra" }));
      __jait_capture(2, (sessionState.get(session.id)));
      __jait_captureType(3, (sessionService.getById(source.id, user.id)?.projectId));
      __jait_capture(4, (sessionState.get(source.id)));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_103_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const user = userService.createUser("project-chat-reject", "password123");
    const source = sessionService.create({ userId: user.id, name: "Source" });
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", __jait_original_url)), nodeId: "gateway" });
    const app = Fastify();
    app.post("/api/chat", async (_request, reply) => reply.code(503).send({ error: "unavailable" }));
    const threadService = new ThreadService(db);
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService, providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    try {
      const result = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { userId: user.id, sessionId: source.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test" });
      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      const data = result.data as { session: { id: string }; accepted: boolean };
      __jait_capture(2, (data.accepted));
      __jait_capture(3, (threadService.listBySession(data.session.id)));
      __jait_captureType(4, (sessionService.getById(source.id, user.id)?.projectId));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_125_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const user = userService.createUser("project-chat-cancel", "password123");
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", __jait_original_url)), nodeId: "gateway" });
    const app = Fastify();
    const post = vi.fn(async (_request, reply) => reply.code(503).send());
    app.post("/api/chat", post);
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    const controller = new AbortController();
    const context = { userId: user.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test", signal: controller.signal };
    try {
      controller.abort();
      const cancelled = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, context);
      __jait_capture(0, (cancelled.ok));
      __jait_capture(1, (sessionService.listByProject(project.id)));

      const later = new AbortController();
      const pending = tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { ...context, signal: later.signal });
      later.abort();
      const result = await pending;
      __jait_capture(2, (result.ok));
      __jait_capture(3, (result.message));
      __jait_capture(4, (result.data));
      __jait_capture(5, (sessionService.listByProject(project.id)));
      __jait_capture(6, (post.mock.calls));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_155_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const user = userService.createUser("project-chat-inflight", "password123");
    const project = projectService.create({ userId: user.id, rootPath: fileURLToPath(new URL("../../../../", __jait_original_url)), nodeId: "gateway" });
    const app = Fastify();
    let reportStarted = () => {};
    const started = new Promise<void>(resolve => { reportStarted = resolve; });
    let release = () => {};
    const done = new Promise<void>(resolve => { release = resolve; });
    app.post("/api/chat", async (_request, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, { "Content-Type": "text/event-stream" });
      reply.raw.write(": waiting\n\n");
      reportStarted();
      await done;
      reply.raw.end();
    });
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    const controller = new AbortController();
    try {
      const pending = tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { userId: user.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test", signal: controller.signal });
      await started;
      controller.abort();
      const result = await pending;
      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.data));
      __jait_capture(2, (result.message));
    } finally { release(); await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_chat_tool_test_ts_187_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "project-chat-test-secret" };
const __jait_hook_990 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db), projectService = new ProjectService(db), sessionService = new SessionService(db);
    const owner = userService.createUser("project-chat-owner", "password123");
    const other = userService.createUser("project-chat-other", "password123");
    const project = projectService.create({ userId: owner.id, rootPath: fileURLToPath(new URL("../../../../", __jait_original_url)), nodeId: "gateway" });
    const app = Fastify();
    const tool = createProjectChatTool({ projectService, sessionService, userService, threadService: new ThreadService(db), providerRegistry: new ProviderRegistry(), config, getApp: () => app });
    try {
      const result = await tool.execute({ projectId: project.id, message: "hello", providerId: "codex" }, { userId: other.id, projectRoot: project.rootPath!, actionId: "test", requestedBy: "test" });
      __jait_capture(0, (result.ok));
      __jait_capture(1, (sessionService.listByProject(project.id)));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_990();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
