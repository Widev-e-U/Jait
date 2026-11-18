// Translated fixture from packages/gateway/src/routes/chat-trajectory.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { __chatTestUtils } from "../../../../packages/gateway/src/routes/chat.js";
import type { AddressInfo } from "node:net";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-trajectory.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_trajectory_test_ts_111_3": {


const { emitToSubscribers, emitTurnDone } = __chatTestUtils;
type StreamEventLike = Record<string, unknown>;
const emit = (sessionId: string, event: StreamEventLike) =>
  emitToSubscribers(sessionId, event as unknown as Parameters<typeof emitToSubscribers>[1]);
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "trajectory-test-secret",
};
let app: Awaited<ReturnType<typeof createServer>> | null = null;
function seedTurn(sessionId: string): void {
  emit(sessionId, { type: "request", content: "hello", provider: "jait", mode: "agent" });
  emit(sessionId, { type: "thinking", content: "let me think" });
  emit(sessionId, { type: "token", content: "Hi there" });
  emit(sessionId, { type: "tool_start", tool: "bash", args: { cmd: "ls" }, call_id: "c1" });
  emit(sessionId, { type: "tool_output", call_id: "c1", content: "file.ts" });
  emit(sessionId, { type: "tool_result", call_id: "c1", tool: "bash", ok: true, message: "ok" });
  emitTurnDone(sessionId, { type: "done", session_id: sessionId, prompt_count: 1, remaining_prompts: null } as never);
}
type TrajectoryChunk = { type: string; log_id: number; replay: boolean; payload: StreamEventLike };
function waitFor(chunks: TrajectoryChunk[], count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (chunks.length >= count) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${count} events (got ${chunks.length})`));
      setTimeout(poll, 10);
    };
    poll();
  });
}
async function collectEvents(
  url: string,
  token: string,
): Promise<{ chunks: TrajectoryChunk[]; abort: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  __jait_capture(0, (res.status));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: TrajectoryChunk[] = [];
  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as TrajectoryChunk;
          if (data.type !== "trajectory_event") continue;
          chunks.push(data);
        }
      }
    } catch {
      // aborted by the test — expected
    }
  })();
  return { chunks, abort: () => controller.abort() };
}
async function setup(): Promise<{ sessionId: string; token: string; url: string }> {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const sessionService = new SessionService(db);
  const userService = new UserService(db);
  const user = userService.createUser("traj-live-user", "password123");
  const session = sessionService.create({ userId: user.id, name: "Trajectory" });

  app = await createServer(testConfig, { db, sqlite, sessionService, userService });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const url = `http://127.0.0.1:${address.port}/api/sessions/${session.id}/trajectory`;
  return { sessionId: session.id, token, url };
}
const __jait_hook_1228 = async () => {
  await app?.close();
  app = null;
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const standalone = await createServer(testConfig);
    try {
      const res = await standalone.inject({ method: "GET", url: "/api/sessions/traj/trajectory" });
      __jait_capture(1, (res.statusCode));
    } finally {
      await standalone.close();
    }
  
})();

} finally {
await __jait_hook_1228();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_trajectory_test_ts_121_3": {


const { emitToSubscribers, emitTurnDone } = __chatTestUtils;
type StreamEventLike = Record<string, unknown>;
const emit = (sessionId: string, event: StreamEventLike) =>
  emitToSubscribers(sessionId, event as unknown as Parameters<typeof emitToSubscribers>[1]);
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "trajectory-test-secret",
};
let app: Awaited<ReturnType<typeof createServer>> | null = null;
function seedTurn(sessionId: string): void {
  emit(sessionId, { type: "request", content: "hello", provider: "jait", mode: "agent" });
  emit(sessionId, { type: "thinking", content: "let me think" });
  emit(sessionId, { type: "token", content: "Hi there" });
  emit(sessionId, { type: "tool_start", tool: "bash", args: { cmd: "ls" }, call_id: "c1" });
  emit(sessionId, { type: "tool_output", call_id: "c1", content: "file.ts" });
  emit(sessionId, { type: "tool_result", call_id: "c1", tool: "bash", ok: true, message: "ok" });
  emitTurnDone(sessionId, { type: "done", session_id: sessionId, prompt_count: 1, remaining_prompts: null } as never);
}
type TrajectoryChunk = { type: string; log_id: number; replay: boolean; payload: StreamEventLike };
function waitFor(chunks: TrajectoryChunk[], count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (chunks.length >= count) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${count} events (got ${chunks.length})`));
      setTimeout(poll, 10);
    };
    poll();
  });
}
async function collectEvents(
  url: string,
  token: string,
): Promise<{ chunks: TrajectoryChunk[]; abort: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  __jait_capture(0, (res.status));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: TrajectoryChunk[] = [];
  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as TrajectoryChunk;
          if (data.type !== "trajectory_event") continue;
          chunks.push(data);
        }
      }
    } catch {
      // aborted by the test — expected
    }
  })();
  return { chunks, abort: () => controller.abort() };
}
async function setup(): Promise<{ sessionId: string; token: string; url: string }> {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const sessionService = new SessionService(db);
  const userService = new UserService(db);
  const user = userService.createUser("traj-live-user", "password123");
  const session = sessionService.create({ userId: user.id, name: "Trajectory" });

  app = await createServer(testConfig, { db, sqlite, sessionService, userService });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const url = `http://127.0.0.1:${address.port}/api/sessions/${session.id}/trajectory`;
  return { sessionId: session.id, token, url };
}
const __jait_hook_1228 = async () => {
  await app?.close();
  app = null;
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("traj-user", "password123");

    app = await createServer(testConfig, { db, sqlite, sessionService, userService });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/does-not-exist/trajectory",
      headers: { authorization: `Bearer ${token}` },
    });
    __jait_capture(1, (res.statusCode));
  
})();

} finally {
await __jait_hook_1228();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_trajectory_test_ts_139_3": {


const { emitToSubscribers, emitTurnDone } = __chatTestUtils;
type StreamEventLike = Record<string, unknown>;
const emit = (sessionId: string, event: StreamEventLike) =>
  emitToSubscribers(sessionId, event as unknown as Parameters<typeof emitToSubscribers>[1]);
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "trajectory-test-secret",
};
let app: Awaited<ReturnType<typeof createServer>> | null = null;
function seedTurn(sessionId: string): void {
  emit(sessionId, { type: "request", content: "hello", provider: "jait", mode: "agent" });
  emit(sessionId, { type: "thinking", content: "let me think" });
  emit(sessionId, { type: "token", content: "Hi there" });
  emit(sessionId, { type: "tool_start", tool: "bash", args: { cmd: "ls" }, call_id: "c1" });
  emit(sessionId, { type: "tool_output", call_id: "c1", content: "file.ts" });
  emit(sessionId, { type: "tool_result", call_id: "c1", tool: "bash", ok: true, message: "ok" });
  emitTurnDone(sessionId, { type: "done", session_id: sessionId, prompt_count: 1, remaining_prompts: null } as never);
}
type TrajectoryChunk = { type: string; log_id: number; replay: boolean; payload: StreamEventLike };
function waitFor(chunks: TrajectoryChunk[], count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (chunks.length >= count) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${count} events (got ${chunks.length})`));
      setTimeout(poll, 10);
    };
    poll();
  });
}
async function collectEvents(
  url: string,
  token: string,
): Promise<{ chunks: TrajectoryChunk[]; abort: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  __jait_capture(0, (res.status));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: TrajectoryChunk[] = [];
  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as TrajectoryChunk;
          if (data.type !== "trajectory_event") continue;
          chunks.push(data);
        }
      }
    } catch {
      // aborted by the test — expected
    }
  })();
  return { chunks, abort: () => controller.abort() };
}
async function setup(): Promise<{ sessionId: string; token: string; url: string }> {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const sessionService = new SessionService(db);
  const userService = new UserService(db);
  const user = userService.createUser("traj-live-user", "password123");
  const session = sessionService.create({ userId: user.id, name: "Trajectory" });

  app = await createServer(testConfig, { db, sqlite, sessionService, userService });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const url = `http://127.0.0.1:${address.port}/api/sessions/${session.id}/trajectory`;
  return { sessionId: session.id, token, url };
}
const __jait_hook_1228 = async () => {
  await app?.close();
  app = null;
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { sessionId, token, url } = await setup();
    // Seed a completed turn before any client connects, so it must be served
    // from the persisted log (old data).
    seedTurn(sessionId);

    const { chunks, abort } = await collectEvents(url, token);
    // Replay: the 7 pre-seeded events arrive first, in order.
    await waitFor(chunks, 7);
    const replay = chunks.slice(0, 7);
    __jait_capture(1, (replay.map((e) => e.payload.type)));
    __jait_capture(2, (replay.map((e) => e.log_id)));
    __jait_capture(3, (replay.every((e) => e.replay === true)));

    // Live: an event emitted after connect arrives with the next log_id.
    emit(sessionId, { type: "token", content: " live chunk" });
    await waitFor(chunks, 8);
    const live = chunks[7]!;
    __jait_capture(4, (live.log_id));
    __jait_capture(5, (live.replay));
    __jait_capture(6, (live.payload.type));
    __jait_capture(7, (live.payload.content));

    abort();
  
})();

} finally {
await __jait_hook_1228();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_trajectory_test_ts_167_3": {


const { emitToSubscribers, emitTurnDone } = __chatTestUtils;
type StreamEventLike = Record<string, unknown>;
const emit = (sessionId: string, event: StreamEventLike) =>
  emitToSubscribers(sessionId, event as unknown as Parameters<typeof emitToSubscribers>[1]);
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "trajectory-test-secret",
};
let app: Awaited<ReturnType<typeof createServer>> | null = null;
function seedTurn(sessionId: string): void {
  emit(sessionId, { type: "request", content: "hello", provider: "jait", mode: "agent" });
  emit(sessionId, { type: "thinking", content: "let me think" });
  emit(sessionId, { type: "token", content: "Hi there" });
  emit(sessionId, { type: "tool_start", tool: "bash", args: { cmd: "ls" }, call_id: "c1" });
  emit(sessionId, { type: "tool_output", call_id: "c1", content: "file.ts" });
  emit(sessionId, { type: "tool_result", call_id: "c1", tool: "bash", ok: true, message: "ok" });
  emitTurnDone(sessionId, { type: "done", session_id: sessionId, prompt_count: 1, remaining_prompts: null } as never);
}
type TrajectoryChunk = { type: string; log_id: number; replay: boolean; payload: StreamEventLike };
function waitFor(chunks: TrajectoryChunk[], count: number): Promise<void> {
  const deadline = Date.now() + 10_000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (chunks.length >= count) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${count} events (got ${chunks.length})`));
      setTimeout(poll, 10);
    };
    poll();
  });
}
async function collectEvents(
  url: string,
  token: string,
): Promise<{ chunks: TrajectoryChunk[]; abort: () => void }> {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
  __jait_capture(0, (res.status));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: TrajectoryChunk[] = [];
  void (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as TrajectoryChunk;
          if (data.type !== "trajectory_event") continue;
          chunks.push(data);
        }
      }
    } catch {
      // aborted by the test — expected
    }
  })();
  return { chunks, abort: () => controller.abort() };
}
async function setup(): Promise<{ sessionId: string; token: string; url: string }> {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const sessionService = new SessionService(db);
  const userService = new UserService(db);
  const user = userService.createUser("traj-live-user", "password123");
  const session = sessionService.create({ userId: user.id, name: "Trajectory" });

  app = await createServer(testConfig, { db, sqlite, sessionService, userService });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address() as AddressInfo;
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const url = `http://127.0.0.1:${address.port}/api/sessions/${session.id}/trajectory`;
  return { sessionId: session.id, token, url };
}
const __jait_hook_1228 = async () => {
  await app?.close();
  app = null;
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { sessionId, token, url } = await setup();
    // Nothing connected yet — emit a turn as a background turn would.
    seedTurn(sessionId);

    // A later connection still sees the full history.
    const { chunks, abort } = await collectEvents(url, token);
    await waitFor(chunks, 7);
    __jait_capture(1, (chunks.map((e) => e.payload.type)));
    abort();
  
})();

} finally {
await __jait_hook_1228();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
