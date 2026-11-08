// Translated fixture from packages/gateway/src/routes/chat-queue.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-queue.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_111_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const,
      nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl, jwtSecret: "test-jwt-secret" };
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("browser-handoff-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Browser handoff" });
    recordSelection(sessionState, session.id);
    const previewService = { setSharedWithAgent: vi.fn(), list: () => [] };
    app = await createServer(config, { db, sqlite, sessionService, sessionState, userService, previewService: previewService as any });
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const started = new Promise<void>(resolve => { slowOllamaStarted = resolve; });
    const active = app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "slow first" } });
    await started;
    __jait_capture(0, (previewService.setSharedWithAgent.mock.calls), ([session.id,true]));
    previewService.setSharedWithAgent.mockClear();
    const invalid = await app.inject({ method: "POST", url: `/api/sessions/${session.id}/steer`, headers, payload: { message: " " } });
    __jait_capture(1, (invalid.statusCode));
    __jait_capture(2, (previewService.setSharedWithAgent.mock.calls));
    const steer = await app.inject({ method: "POST", url: `/api/sessions/${session.id}/steer`, headers, payload: { message: "continue" } });
    __jait_capture(3, (steer.statusCode));
    __jait_capture(4, (previewService.setSharedWithAgent.mock.calls), ([session.id,true]));
    previewService.setSharedWithAgent.mockClear();
    const queued = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "queued" } });
    __jait_capture(5, (queued.statusCode));
    __jait_capture(6, (previewService.setSharedWithAgent.mock.calls), ([session.id,true]));
    releaseSlowOllama?.();
    await active;
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_145_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = {
      ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const,
      nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("stop-steer-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Stop and steer" });
    recordSelection(sessionState, session.id);
    app = await createServer(config, { db, sqlite, sessionService, sessionState, userService });
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const started = new Promise<void>(resolve => { slowOllamaStarted = resolve; });
    const active = app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: "slow first" } });
    await started;
    const selected = {
      id: "q-selected", content: "selected next", held: true,
      attachments: [{ name: "note.txt", mimeType: "text/plain", data: "bm90ZQ==" }],
    };
    const remaining = { id: "q-first", content: "keep waiting", held: true, model: null };
    sessionState.set(session.id, { queued_messages: [remaining, selected] });
    const cancel = (payload: unknown, requestHeaders = headers) => app!.inject({
      method: "POST", url: `/api/sessions/${session.id}/cancel`, headers: requestHeaders, payload,
    });
    __jait_capture(0, ((await cancel({ queuedMessageId: 12 })).statusCode));
    __jait_capture(1, ((await cancel({ queuedMessageId: "missing" })).statusCode));
    const otherUser = userService.createUser("stop-steer-other", "password123");
    const otherToken = await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret);
    __jait_capture(2, ((await cancel({ queuedMessageId: selected.id }, { authorization: `Bearer ${otherToken}` })).statusCode));
    __jait_capture(3, (sessionState.get(session.id, ["queued_messages"]).queued_messages), ([remaining, selected]));

    const result = await cancel({ queuedMessageId: selected.id });
    __jait_capture(4, (result.statusCode));
    __jait_capture(5, (result.json()));
    await active;
    await vi.waitFor(async () => {
      const response = await app!.inject({ method: "GET",
        url: `/api/sessions/${session.id}/messages?limit=100`, headers });
      const users = response.json().messages.filter((entry: { role: string }) => entry.role === "user");
      __jait_capture(6, (users.map((entry: { content: string }) => entry.content)));
      __jait_capture(7, (JSON.stringify(users[1].segments)));
      __jait_capture(8, (JSON.stringify(users[1].segments)));
    });
    await vi.waitFor(() => __jait_capture(9, (sessionState.get(session.id, ["queued_messages"]).queued_messages), ([remaining])));
    __jait_capture(10, ((await cancel({ queuedMessageId: remaining.id })).statusCode));
    __jait_capture(11, (sessionState.get(session.id, ["queued_messages"]).queued_messages), ([remaining]));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_199_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-resend-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Re-send" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };

    const readUserMessages = async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = response.json() as { messages: Array<{ role: string; content: string }> };
      return body.messages.filter((message) => message.role === "user").map((message) => message.content);
    };

    // Queue one message and drain it — it should be sent exactly once.
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-stale", content: "already drained message" }],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
    __jait_capture(0, (await readUserMessages()));
    __jait_captureType(1, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));

    // Simulate a stale client full-snapshot push re-introducing the SAME entry
    // (same id) after the drain already handed it to the agent. The drain must
    // drop it rather than send it a second time and leave a ghost queue entry.
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-stale", content: "already drained message" }],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    __jait_capture(2, (await readUserMessages()));
    __jait_captureType(3, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_264_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const,
      nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl, jwtSecret: "test-jwt-secret" };
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("message-identity", "password123");
    const session = sessionService.create({ userId: user.id, name: "Identity" });
    recordSelection(sessionState, session.id);
    app = await createServer(config, { db, sqlite, sessionService, sessionState, userService });
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const payload = { sessionId: session.id, content: "continue", clientMessageId: "user-12345678-1234" };
    const sent = await app.inject({ method: "POST", url: "/api/chat", headers, payload });
    __jait_capture(0, (sent.statusCode));
    const response = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/messages?limit=100`, headers });
    const messages = (response.json() as { messages: Array<{ id: string; role: string; clientMessageId?: string }> }).messages;
    __jait_capture(1, (messages.find(message => message.role === "user")?.clientMessageId), (payload.clientMessageId));
    const duplicate = await app.inject({ method: "POST", url: "/api/chat", headers, payload });
    __jait_capture(2, (duplicate.statusCode));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_288_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = {
      ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const,
      nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-fallback-retry", "password123");
    const session = sessionService.create({ userId: user.id, name: "Fallback retry" });
    recordSelection(sessionState, session.id);
    const services = { db, sqlite, sessionService, sessionState, userService };
    app = await createServer(config, services);
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const message = { id: "q-delivered-fallback", content: "send exactly once" };
    const drain = async () => {
      await (app as NonNullable<typeof app> & {
        drainQueuedChatMessages: (id: string) => Promise<void>;
      }).drainQueuedChatMessages(session.id);
    };
    const users = async () => {
      const response = await app!.inject({ method: "GET",
        url: `/api/sessions/${session.id}/messages?limit=100`, headers });
      return (response.json() as { messages: Array<{ role: string; content: string }> })
        .messages.filter((entry) => entry.role === "user").map((entry) => entry.content);
    };
    sessionState.set(session.id, { queued_messages: [message] });
    await drain();
    __jait_capture(0, (await users()), ([message.content]));
    // A stale browser queue survives a lost WS removal packet.
    const retry = () => app!.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: message.content, queuedMessageId: message.id } });
    await retry();
    __jait_capture(1, (await users()), ([message.content]));

    await app.close();
    app = await createServer(config, services);
    // Persisted receipts must reject both stale snapshots and HTTP retries.
    sessionState.set(session.id, { queued_messages: [message] });
    await drain();
    await retry();
    __jait_capture(2, (await users()), ([message.content]));
    __jait_captureType(3, (sessionState.get(session.id, ["queued_messages"]).queued_messages));

    // A new user request may deliberately contain the same text.
    await app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: message.content } });
    __jait_capture(4, (await users()), ([message.content, message.content]));

    // Two clients explicitly sending the same new queue id must claim it once.
    const explicit = () => app!.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: message.content, queuedMessageId: "q-explicit" } });
    await Promise.all([explicit(), explicit()]);
    await vi.waitFor(async () => __jait_capture(5, (await users()), ([message.content, message.content, message.content])));

    // A retry while another turn is active must not acquire a fresh queue id.
    const started = new Promise<void>((resolve) => { slowOllamaStarted = resolve; });
    const active = app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: "slow first" } });
    await started;
    const busyRetry = await retry();
    __jait_capture(6, (busyRetry.statusCode));
    __jait_capture(7, (busyRetry.json()));
    __jait_captureType(8, (sessionState.get(session.id, ["queued_messages"]).queued_messages));
    releaseSlowOllama?.();
    await active;
    __jait_capture(9, (await users()), ([message.content, message.content, message.content, "slow first"]));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_361_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-wsdrop-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue WS Drop" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };

    const readUserMessages = async () => {
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = response.json() as { messages: Array<{ role: string; content: string }> };
      return body.messages.filter((message) => message.role === "user").map((message) => message.content);
    };

    // Simulate the WS-drop race in its real order: the message was queued
    // server-side (while WS was up), then the client delivered it directly via
    // POST because the WS dropped before the server could drain it. The stale
    // queue entry is still persisted, so the direct send MUST remove it at send
    // time and track its id — otherwise the end-of-turn drain (and any later
    // stale re-push) would re-send it ("already sent but still queued").
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-ws-drop", content: "sent directly while ws down" }],
    });

    const sentDirectly = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "sent directly while ws down" },
    });
    __jait_capture(0, (sentDirectly.statusCode));

    // The direct send removed the matching entry, so the queue is already empty
    // and the end-of-turn drain had nothing to re-send.
    __jait_captureType(1, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));
    __jait_capture(2, (await readUserMessages()));

    // A stale client re-push of the SAME id (e.g. after a WS reconnect, before
    // the client learns the entry was consumed) must not resurrect it: the drain
    // filters the already-consumed id and clears the ghost entry.
    sessionState.set(session.id, {
      queued_messages: [{ id: "q-ws-drop", content: "sent directly while ws down" }],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
    __jait_capture(3, (await readUserMessages()));
    __jait_captureType(4, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_440_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = {
      ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const,
      nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("http-queue-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "HTTP queue" });
    recordSelection(sessionState, session.id);
    app = await createServer(config, { db, sqlite, sessionService, sessionState, userService, audit: new AuditWriter(db) });
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };

    // No turn is running and no WS copy arrives: the PATCH is the only signal.
    const patch = await app.inject({
      method: "PATCH", url: `/api/sessions/${session.id}/state`, headers,
      payload: { queued_messages: [{ id: "q-http", content: "queued from the phone" }] },
    });
    __jait_capture(0, (patch.statusCode));

    await vi.waitFor(async () => {
      const response = await app!.inject({ method: "GET", url: `/api/sessions/${session.id}/messages?limit=100`, headers });
      const messages = response.json().messages as Array<{ role: string; content: string }>;
      __jait_capture(1, (messages.map((message) => message.content)));
    });
    __jait_captureType(2, (sessionState.get(session.id, ["queued_messages"]).queued_messages));

    // A late HTTP copy of the same snapshot must neither resend the message nor
    // leave it behind as a ghost entry.
    await app.inject({
      method: "PATCH", url: `/api/sessions/${session.id}/state`, headers,
      payload: { queued_messages: [{ id: "q-http", content: "queued from the phone" }] },
    });
    await vi.waitFor(() => __jait_captureType(3, (sessionState.get(session.id, ["queued_messages"]).queued_messages)));
    const after = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/messages?limit=100`, headers });
    __jait_capture(4, (after.json().messages.filter((message: { role: string }) => message.role === "user")));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_483_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued Session" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    sessionState.set(session.id, {
      queued_messages: [
        { id: "q1", content: "first queued message" },
        { id: "q2", content: "second queued message" },
      ],
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    __jait_captureType(0, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    __jait_capture(1, (response.statusCode));
    const body = response.json() as { messages: Array<{ role: string; content: string }> };
    __jait_capture(2, (body.messages.filter((message) => message.role === "user").map((message) => message.content)));
    __jait_capture(3, (body.messages.filter((message) => message.role === "assistant").map((message) => message.content)));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_546_3_each0": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
/*__jait_scope_open__*/{
const source = "attachments";
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued Session" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    sessionState.set(session.id, {
      queued_messages: [
        { id: "attachment-only", content: "", ...(source === "attachments" ? { attachments: [{ name: "invoice.txt", mimeType: "text/plain", data: Buffer.from("invoice total 42").toString("base64") }] } : {}), displaySegments: [{ type: "attachment", name: "invoice.txt", mimeType: "text/plain", data: Buffer.from("invoice total 42").toString("base64") }] },
      ],
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    __jait_captureType(0, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    __jait_capture(1, (response.statusCode));
    const body = response.json() as { messages: Array<{ role: string; content: string; segments?: string }> };
    const users = body.messages.filter((message) => message.role === "user");
    __jait_capture(2, (users));
    __jait_capture(3, (users[0].content));
    __jait_capture(4, (body.messages.find((message) => message.role === "assistant")?.content));
    __jait_capture(5, (JSON.stringify(users[0].segments)));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_546_3_each1": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
/*__jait_scope_open__*/{
const source = "segments";
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued Session" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    sessionState.set(session.id, {
      queued_messages: [
        { id: "attachment-only", content: "", ...(source === "attachments" ? { attachments: [{ name: "invoice.txt", mimeType: "text/plain", data: Buffer.from("invoice total 42").toString("base64") }] } : {}), displaySegments: [{ type: "attachment", name: "invoice.txt", mimeType: "text/plain", data: Buffer.from("invoice total 42").toString("base64") }] },
      ],
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    __jait_captureType(0, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    __jait_capture(1, (response.statusCode));
    const body = response.json() as { messages: Array<{ role: string; content: string; segments?: string }> };
    const users = body.messages.filter((message) => message.role === "user");
    __jait_capture(2, (users));
    __jait_capture(3, (users[0].content));
    __jait_capture(4, (body.messages.find((message) => message.role === "assistant")?.content));
    __jait_capture(5, (JSON.stringify(users[0].segments)));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_605_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-hold-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Hold" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };

    const readUserMessages = async () => {
      const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = response.json() as { messages: Array<{ role: string; content: string }> };
      return body.messages.filter((message) => message.role === "user").map((message) => message.content);
    };

    // A held message at the front of the queue blocks the drain entirely.
    sessionState.set(session.id, {
      queued_messages: [
        { id: "q-held", content: "held message", held: true },
        { id: "q-after", content: "message after held" },
      ],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    __jait_capture(0, (await readUserMessages()));
    // The held message (and the one after it) must remain queued.
    const remaining = sessionState.get(session.id, ["queued_messages"])["queued_messages"] as Array<{ id: string; content: string }>;
    __jait_capture(1, (remaining.map((m) => m.id)));

    // Unlock the held message and drain again — both should now be sent.
    sessionState.set(session.id, {
      queued_messages: [
        { id: "q-held", content: "held message", held: false },
        { id: "q-after", content: "message after held" },
      ],
    });
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    __jait_capture(2, (await readUserMessages()));
    __jait_captureType(3, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_677_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-dedupe-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Dedupe" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    sessionState.set(session.id, {
      queued_messages: [
        { id: "q-dup", content: "duplicated queued message" },
        { id: "q-dup", content: "duplicated queued message" },
      ],
    });

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });

    __jait_capture(0, (response.statusCode));
    const body = response.json() as { messages: Array<{ role: string; content: string }> };
    __jait_capture(1, (body.messages.filter((message) => message.role === "user").map((message) => message.content)));
    __jait_captureType(2, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_734_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-race-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Race" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const slowStarted = new Promise<void>((resolve) => { slowOllamaStarted = resolve; });
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "slow first" },
    });

    await slowStarted;

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "second while streaming" },
    });

    __jait_capture(0, (secondResponse.statusCode));
    __jait_capture(1, (secondResponse.body));
    __jait_capture(2, (sessionState.get(session.id, ["queued_messages"])["queued_messages"]));

    releaseSlowOllama?.();
    await firstResponse;
    slowOllamaStarted = null;
    releaseSlowOllama = null;

    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    let userMessages: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = messagesResponse.json() as { messages: Array<{ role: string; content: string }> };
      userMessages = body.messages.filter((message) => message.role === "user").map((message) => message.content);
      if (userMessages.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    __jait_capture(3, (userMessages));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_815_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-multiply-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Multiply" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const slowStarted = new Promise<void>((resolve) => { slowOllamaStarted = resolve; });
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "slow first" },
    });

    await slowStarted;

    // The client/server drain race submits the same content twice while the
    // session is still streaming. Both should be accepted as 202 "queued" but
    // the persisted queue must contain only ONE entry (deduped by content).
    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "duplicate queued message" },
    });
    const thirdResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "duplicate queued message" },
    });

    __jait_capture(0, (secondResponse.statusCode));
    __jait_capture(1, (thirdResponse.statusCode));
    const persisted = sessionState.get(session.id, ["queued_messages"])[
      "queued_messages"
    ] as Array<{ content: string }>;
    __jait_capture(2, (persisted));
    __jait_capture(3, (persisted.map((m) => m.content)));

    releaseSlowOllama?.();
    await firstResponse;
    slowOllamaStarted = null;
    releaseSlowOllama = null;

    // Drain the queue and confirm the message is sent exactly once.
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    let userMessages: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = messagesResponse.json() as { messages: Array<{ role: string; content: string }> };
      userMessages = body.messages.filter((message) => message.role === "user").map((message) => message.content);
      if (userMessages.length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    __jait_capture(4, (userMessages));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_queue_test_ts_908_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
let slowOllamaStarted: (() => void) | null = null;
let releaseSlowOllama: (() => void) | null = null;
function recordSelection(
  sessionState: SessionStateService,
  sessionId: string,
  providerId = "jait",
  model = "llama3",
): void {
  sessionState.set(sessionId, {
    "chat.provider": providerId,
    "chat.cliModels": { [providerId]: model },
  });
}
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      const isNative = req.url?.endsWith("/api/chat");
      const isOpenAI = req.url?.endsWith("/chat/completions");
      if (req.method !== "POST" || (!isNative && !isOpenAI)) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };
      const lastUserMessage = messages.filter((message) => message.role === "user").pop()?.content ?? "";

      if (lastUserMessage === "slow first") {
        slowOllamaStarted?.();
        await new Promise<void>((resolve) => { releaseSlowOllama = resolve; });
      }

      if (isNative) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: `Echo: ${lastUserMessage}` }, done: false }) + "\n");
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = {
        choices: [{ delta: { content: `Echo: ${lastUserMessage}` }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_3288 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_3472 = async () => {
    releaseSlowOllama?.();
    slowOllamaStarted = null;
    releaseSlowOllama = null;
    await app?.close();
    app = null;
  };
const __jait_hook_3632 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_3288();
try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queue-multiply-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queue Multiply" });
    recordSelection(sessionState, session.id);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const slowStarted = new Promise<void>((resolve) => { slowOllamaStarted = resolve; });
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "slow first" },
    });

    await slowStarted;

    // Identical text with different files represents two distinct messages.
    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "review queued files", attachments: [{ name: "a.txt", mimeType: "text/plain", data: Buffer.from("file A").toString("base64") }] },
    });
    const thirdResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "review queued files", attachments: [{ name: "b.txt", mimeType: "text/plain", data: Buffer.from("file B").toString("base64") }] },
    });

    __jait_capture(0, (secondResponse.statusCode));
    __jait_capture(1, (thirdResponse.statusCode));
    const persisted = sessionState.get(session.id, ["queued_messages"])[
      "queued_messages"
    ] as Array<{ content: string }>;
    __jait_capture(2, (persisted));
    __jait_capture(3, (persisted.map((m) => m.content)));

    releaseSlowOllama?.();
    await firstResponse;
    slowOllamaStarted = null;
    releaseSlowOllama = null;

    // Drain both messages and retain each uploaded file.
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    let userMessages: string[] = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      const body = messagesResponse.json() as { messages: Array<{ role: string; content: string }> };
      userMessages = body.messages.filter((message) => message.role === "user").map((message) => message.content);
      if (userMessages.filter((message) => message.includes(" [attached:")).length >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    __jait_capture(4, (userMessages.filter((message) => message.includes(" [attached:"))));
  
})();

} finally {
await __jait_hook_3632();
await __jait_hook_3472();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
