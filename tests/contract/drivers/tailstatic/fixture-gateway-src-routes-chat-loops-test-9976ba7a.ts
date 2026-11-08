// Translated fixture from packages/gateway/src/routes/chat-loops.test.ts; expected literals are in tail_static.rs.
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { ChatLoopService } from "../../../../packages/gateway/src/services/chat-loops.js";
import { sessionWaits } from "../../../../packages/gateway/src/services/session-waits.js";
import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { messages } from "../../../../packages/gateway/src/db/schema.js";

import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-loops.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_94_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    onTurn = () => {
      const loop = loops.get(sessionId)!;
      loops.check(sessionId, calls.length === 1
        ? { revision: loop.revision, outcome: "continue", summary: "Fix prepared", nextMessage: "Run the regression test" }
        : { revision: loop.revision, outcome: "complete", summary: "Verified", evidence: ["Regression command exited 0"] });
    };
    loops.goal(sessionId, "Fix the bug", ["Regression passes"]);
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId))), { timeout: 10000 });
    __jait_capture(1, (calls));
    __jait_capture(2, (JSON.stringify(calls[1])));
    __jait_capture(3, (readMessages().filter(message => message.role === "user")));
    __jait_capture(4, (readMessages().filter(message => message.role === "assistant")));
    __jait_capture(5, (publish.mock.calls));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_110_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    loops.goal(sessionId, "Finish saved work", ["Check passes"]);
    await app.close();
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passed"] });
    app = await reopen();
    await app.ready();
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId)?.status)), { timeout: 10000 });
    __jait_capture(1, (calls));
    __jait_capture(2, (publish.mock.calls));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_121_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    state.set(sessionId, { "loop.turn-options": {
      turnId: "previous", startedAt: new Date().toISOString(), mode: "agent", responseStyle: "normal", model: "stale-marker-model",
      provider: "stale-marker-provider",
      sessionId: "another-chat", _systemNotification: "Wrong hidden task",
    } });
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passed"] });
    loops.goal(sessionId, "Fix the authorized target", ["Pass"]);
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId)?.status)), { timeout: 10000 });
    __jait_capture(1, (calls[0]?.model));
    __jait_capture(2, (JSON.stringify(calls[0])));
    __jait_capture(3, (JSON.stringify(calls[0])));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_135_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    onTurn = () => {
      const loop = loops.get(sessionId)!;
      if (loop.status === "running") loops.check(sessionId, { revision: loop.revision, outcome: "complete", summary: "Verified", evidence: ["Passed"] });
    };
    loops.goal(sessionId, "Fix", ["Pass"]);
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId)?.iteration)), { timeout: 10000 });
    __jait_capture(1, (publish.mock.calls));
    await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId, content: "Explain the result" } });
    await vi.waitFor(() => __jait_capture(2, (publish.mock.calls)));
    __jait_capture(3, (publish.mock.calls[0]?.[1]));
    __jait_capture(4, (loops.get(sessionId)?.iteration));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_149_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    __jait_capture(0, ((await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/loop`, payload: { action: "pause" } })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: `/api/sessions/missing/loop`, headers, payload: { action: "resume" } })).statusCode));
    // Keep the queued continuation from starting while the cancel request is
    // processed, even if the event loop is delayed beyond its 250ms timer.
    sessionWaits.raise({ key: "cancel-gap", sessionId, kind: "question" });
    loops.goal(sessionId, "Fix", ["Pass"]);
    await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/cancel`, headers });
    __jait_capture(2, (loops.get(sessionId)?.status));
    sessionWaits.clear("cancel-gap");
    await new Promise(resolve => setTimeout(resolve, 350));
    __jait_capture(3, (calls));
    __jait_capture(4, ((await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/loop`, headers })).json().loop.status));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_160_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    sessionWaits.raise({ key: "loop-question", sessionId, kind: "question" });
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passed"] });
    loops.goal(sessionId, "Fix", ["Pass"]);
    await new Promise(resolve => setTimeout(resolve, 350));
    __jait_capture(0, (calls));
    sessionWaits.clear("loop-question");
    await vi.waitFor(() => __jait_capture(1, (loops.get(sessionId)?.status)), { timeout: 10000 });
    __jait_capture(2, (calls));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_171_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    responseStatus = 400;
    loops.goal(sessionId, "Fix", ["Pass"]);
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId)?.status)), { timeout: 10000 });
    __jait_capture(1, (publish.mock.calls[0]?.[1]));
    await new Promise(resolve => setTimeout(resolve, 350));
    __jait_capture(2, (calls));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_180_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    responseStatus = 400;
    loops.goal(sessionId, "Finish the saved migration", ["Regression passes"]);
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId)?.status)), { timeout: 10000 });
    responseStatus = 200;
    onTurn = () => {
      if (calls.length === 2) {
        const context = JSON.stringify(calls.at(-1));
        __jait_capture(1, (context));
        __jait_capture(2, (context));
        __jait_capture(3, (context));
        // Model follows the explicit user request through the same service as
        // loop.resume. Its checkpoint must restart automatic continuation.
        const resumed = loops.control(sessionId, "resume");
        loops.check(sessionId, { revision: resumed.revision, outcome: "continue", summary: "Recovered", nextMessage: "Run the remaining regression" });
      } else {
        __jait_capture(4, (JSON.stringify(calls.at(-1))));
        loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Regression passes"] });
      }
    };
    await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId, content: "Continue the saved migration goal" } });
    await vi.waitFor(() => __jait_capture(5, (loops.get(sessionId))), { timeout: 10000 });
    __jait_capture(6, (calls));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_205_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    onTurn = () => {
      if (calls.length === 1) loops.goal(sessionId, "Finish work", ["Check passes"]);
      if (calls.length === 3) loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passes"] });
    };
    await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId, content: "Work until the check passes" } });
    await vi.waitFor(() => __jait_capture(0, (loops.get(sessionId))), { timeout: 10000 });
    __jait_capture(1, (calls));
    __jait_capture(2, (JSON.stringify(calls[1])));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_216_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    loops.check(sessionId, { revision: goal.revision, outcome: "waiting", summary: "Which target?" });
    __jait_capture(0, ((await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/loop`, headers: otherHeaders })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/loop`, headers: otherHeaders, payload: { action: "resume" } })).statusCode));
    onTurn = () => {
      __jait_capture(2, (loops.get(sessionId)?.status));
      loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Regression passed"] });
    };
    const response = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId, content: "Use the authorized lab target" } });
    __jait_capture(3, (response.statusCode));
    await vi.waitFor(() => __jait_capture(4, (loops.get(sessionId)?.iteration)));
    __jait_capture(5, (loops.get(sessionId)?.status));
    __jait_capture(6, (calls));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_232_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "waiting", summary: "Which network is authorized?" });
    loops.goal(sessionId, "Check the authorized network", ["Authorized checks pass"]);
    await vi.waitFor(() => __jait_capture(0, (publish.mock.calls)), { timeout: 10000 });
    __jait_capture(1, (calls));
    __jait_capture(2, (publish.mock.calls[0]?.[1]));
    __jait_capture(3, (loops.get(sessionId)?.status));
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_loops_test_ts_241_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let mock: Server;
let loops: ChatLoopService;
let sessionId: string;
let headers: { authorization: string };
let otherHeaders: { authorization: string };
let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
let onTurn: () => void;
let responseStatus: number;
let closeDb: () => void;
let state: SessionStateService;
let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
let publish: ReturnType<typeof vi.spyOn>;
let readMessages: () => Array<{ role: string; content: string }>;
let sessions: SessionService;
let userId: string;
const __jait_hook_1545 = async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    userId = user.id;
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    // The user's explicit choice for this chat. Loop turns must run on exactly
    // this provider and model; nothing is inferred when either is missing.
    state.set(sessionId, {
      "chat.provider": "jait",
      "chat.cliModels": { jait: "fixture-model" },
    });
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  };
const __jait_hook_4438 = async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  };
await __jait_hook_1545();
try {
await (async()=>{

    const unselected = sessions.create({ userId, name: "No chosen model" }).id;
    loops.goal(unselected, "Do the autonomous work", ["Check passes"]);
    await vi.waitFor(() => __jait_capture(0, (publish.mock.calls)), { timeout: 10000 });
    __jait_capture(1, (publish.mock.calls[0]?.[1]));
    __jait_capture(2, (loops.get(unselected)?.status));
    // No provider was ever contacted: the loop did not pick one on its own.
    __jait_capture(3, (calls));
    sessionWaits.clearSession(unselected);
  
})();

} finally {
await __jait_hook_4438();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
