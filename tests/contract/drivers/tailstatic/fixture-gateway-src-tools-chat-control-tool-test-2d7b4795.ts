// Translated fixture from packages/gateway/src/tools/chat-control-tool.test.ts; expected literals are in tail_static.rs.

import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { messages } from "../../../../packages/gateway/src/db/schema.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { createChatControlTool } from "../../../../packages/gateway/src/tools/chat-control-tool.js";
import { ASK_MODE_TOOLS, MUTATING_TOOLS } from "../../../../packages/gateway/src/tools/chat-modes.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/chat-control-tool.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_chat_control_tool_test_ts_46_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "chat-control-test-secret" };
async function setup() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db), sessionService = new SessionService(db), sessionState = new SessionStateService(db);
  const user = userService.createUser("chat-control-test", "password123");
  userService.updateSettings(user.id, { jaitBackend: "openrouter", apiKeys: { OPENROUTER_API_KEY: "fixture" } });
  const origin = sessionService.create({ userId: user.id, name: "Origin" });
  const target = sessionService.create({ userId: user.id, name: "Target" });
  sessionState.set(target.id, { "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" } });
  let release = () => {};
  const done = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init: RequestInit) => {
    requests.push(String(init.body));
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"working"},"finish_reason":null}]}\n\n'));
      await done;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
  }));
  const app = await createServer(config, { db, sqlite, userService, sessionService, sessionStateService: sessionState });
  const tool = createChatControlTool({ sessionService, sessionState, userService, config, getApp: () => app });
  const context = { userId: user.id, sessionId: origin.id, actionId: "test", requestedBy: "test" };
  const run = (input: Record<string, unknown>) => tool.execute({ sessionId: target.id, ...input }, context);
  return { db, sqlite, app, user, origin, target, sessionState, requests, release, run, tool, context, userService, sessionService };
}
const __jait_hook_742 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (MUTATING_TOOLS.has("chat.control")));
    __jait_capture(1, (ASK_MODE_TOOLS.has("chat.control")));
  
})();

} finally {
await __jait_hook_742();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_chat_control_tool_test_ts_51_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "chat-control-test-secret" };
async function setup() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db), sessionService = new SessionService(db), sessionState = new SessionStateService(db);
  const user = userService.createUser("chat-control-test", "password123");
  userService.updateSettings(user.id, { jaitBackend: "openrouter", apiKeys: { OPENROUTER_API_KEY: "fixture" } });
  const origin = sessionService.create({ userId: user.id, name: "Origin" });
  const target = sessionService.create({ userId: user.id, name: "Target" });
  sessionState.set(target.id, { "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" } });
  let release = () => {};
  const done = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init: RequestInit) => {
    requests.push(String(init.body));
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"working"},"finish_reason":null}]}\n\n'));
      await done;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
  }));
  const app = await createServer(config, { db, sqlite, userService, sessionService, sessionStateService: sessionState });
  const tool = createChatControlTool({ sessionService, sessionState, userService, config, getApp: () => app });
  const context = { userId: user.id, sessionId: origin.id, actionId: "test", requestedBy: "test" };
  const run = (input: Record<string, unknown>) => tool.execute({ sessionId: target.id, ...input }, context);
  return { db, sqlite, app, user, origin, target, sessionState, requests, release, run, tool, context, userService, sessionService };
}
const __jait_hook_742 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const env = await setup();
    try {
      __jait_capture(0, ((await env.run({ action: "status" })).data));
      const sent = await env.run({ action: "send", message: "First task" });
      __jait_capture(1, (sent.ok));
      __jait_capture(2, (sent.data), ({ accepted: true, queued: false, href: `/chat?sessionId=${env.target.id}` }));
      await vi.waitFor(() => __jait_capture(3, (env.requests.length)));
      __jait_capture(4, (env.requests[0]));

      const busySend = await env.run({ action: "send", message: "Second task" });
      __jait_capture(5, (busySend.ok));
      __jait_capture(6, (busySend.message));

      const queued = await env.run({ action: "queue", message: "Second task" });
      __jait_capture(7, (queued.ok));
      __jait_capture(8, (queued.data));
      const status = await env.run({ action: "status" });
      __jait_capture(9, (status.data));

      const steered = await env.run({ action: "steer", message: "Focus on tests" });
      __jait_capture(10, (steered.ok));

      const stopped = await env.run({ action: "stop" });
      __jait_capture(11, (stopped.ok));
      __jait_capture(12, (stopped.data));
      env.release();
      // Stopping the turn drains the queued message into a new turn.
      await vi.waitFor(async () => {
        const rows = env.db.select().from(messages).where(eq(messages.sessionId, env.target.id)).all();
        __jait_capture(13, (rows.filter(row => row.role === "user").map(row => row.content)));
        __jait_capture(14, ((await env.run({ action: "status" })).data));
      }, { timeout: 5000 });
      __jait_capture(15, (env.db.select().from(messages).where(eq(messages.sessionId, env.origin.id)).all()));
    } finally {
      env.release();
      await env.app.close();
      env.sqlite.close();
    }
  
})();

} finally {
await __jait_hook_742();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_chat_control_tool_test_ts_92_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "chat-control-test-secret" };
async function setup() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db), sessionService = new SessionService(db), sessionState = new SessionStateService(db);
  const user = userService.createUser("chat-control-test", "password123");
  userService.updateSettings(user.id, { jaitBackend: "openrouter", apiKeys: { OPENROUTER_API_KEY: "fixture" } });
  const origin = sessionService.create({ userId: user.id, name: "Origin" });
  const target = sessionService.create({ userId: user.id, name: "Target" });
  sessionState.set(target.id, { "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" } });
  let release = () => {};
  const done = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init: RequestInit) => {
    requests.push(String(init.body));
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"working"},"finish_reason":null}]}\n\n'));
      await done;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
  }));
  const app = await createServer(config, { db, sqlite, userService, sessionService, sessionStateService: sessionState });
  const tool = createChatControlTool({ sessionService, sessionState, userService, config, getApp: () => app });
  const context = { userId: user.id, sessionId: origin.id, actionId: "test", requestedBy: "test" };
  const run = (input: Record<string, unknown>) => tool.execute({ sessionId: target.id, ...input }, context);
  return { db, sqlite, app, user, origin, target, sessionState, requests, release, run, tool, context, userService, sessionService };
}
const __jait_hook_742 = () => vi.unstubAllGlobals();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const env = await setup();
    try {
      __jait_capture(0, ((await env.tool.execute({ action: "stop", sessionId: env.origin.id }, env.context)).message));
      const other = env.userService.createUser("chat-control-other", "password123");
      const foreign = env.sessionService.create({ userId: other.id, name: "Foreign" });
      __jait_capture(1, ((await env.tool.execute({ action: "send", sessionId: foreign.id, message: "hi" }, env.context)).message));
      const steer = await env.run({ action: "steer", message: "hi" });
      __jait_capture(2, (steer.ok));
      __jait_capture(3, (steer.message));
      const bare = env.sessionService.create({ userId: env.user.id, name: "Bare" });
      const unselected = await env.tool.execute({ action: "queue", sessionId: bare.id, message: "hi" }, env.context);
      __jait_capture(4, (unselected.ok));
      __jait_capture(5, (unselected.message));
      __jait_capture(6, (env.requests));
    } finally {
      env.release();
      await env.app.close();
      env.sqlite.close();
    }
  
})();

} finally {
await __jait_hook_742();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
