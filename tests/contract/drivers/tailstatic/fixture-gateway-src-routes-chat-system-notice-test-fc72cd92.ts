// Translated fixture from packages/gateway/src/routes/chat-system-notice.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { formatBackgroundCommandNotification } from "../../../../packages/gateway/src/routes/chat.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-system-notice.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_system_notice_test_ts_68_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
const receivedBodies: Array<Record<string, unknown>> = [];
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || !req.url?.endsWith("/api/chat")) {
        res.writeHead(404);
        res.end();
        return;
      }
      receivedBodies.push(JSON.parse(await collectBody(req)) as Record<string, unknown>);
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(JSON.stringify({ message: { role: "assistant", content: "acknowledged" }, done: false }) + "\n");
      res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_1896 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_2080 = async () => {
    await app?.close();
    app = null;
  };
const __jait_hook_2153 = () => {
    receivedBodies.length = 0;
  };
const __jait_hook_2212 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_1896();
await __jait_hook_2153();
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
    const user = userService.createUser("sys-notice-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Sys Notice" });
    // Autonomous turns run only on the provider+model the user picked for this chat.
    sessionState.set(session.id, { "chat.provider": "jait", "chat.cliModels": { jait: "llama3" } });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const fullNotification = formatBackgroundCommandNotification({
      sessionId: session.id,
      terminalId: "tty1",
      command: "bun run test",
      exitCode: 0,
      output: "tests passed",
      durationMs: 5_000,
    });
    const notice = "Background terminal #tty1 finished in ~5s (exit 0)";

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: session.id,
        _systemNotification: fullNotification,
        _systemNotice: notice,
      },
    });
    __jait_capture(0, (response.statusCode));

    // A continuation turn has no prompt text, so the browser cannot build a user
    // bubble from `content`. It renders the gray notice line instead and reads
    // its text from this event, so live view and reload agree.
    const requestEvent = response.body
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice("data: ".length)) as { type?: string; systemNotice?: boolean; noticeText?: string })
      .find((event) => event.type === "request");
    __jait_capture(1, (requestEvent), ({ systemNotice: true, noticeText: notice }));

    const modelMessages = receivedBodies.at(-1)?.["messages"] as Array<{ role: string; content: string }>;
    __jait_capture(2, (modelMessages.at(-1)), ([fullNotification]));
    __jait_capture(3, (modelMessages.at(-1)?.content));

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });
    __jait_capture(4, (messagesResponse.statusCode));
    const body = messagesResponse.json() as { messages: Array<{ role: string; content: string; systemNotice?: boolean }> };

    // The short notice is persisted as a visible system row; the full (hidden)
    // notification must NOT leak into the UI.
    __jait_capture(5, (body.messages.find((m) => m.role === "system")), ({
      role: "system",
      content: notice,
      systemNotice: true,
    }));
    __jait_capture(6, (body.messages.some((m) => m.content.includes(fullNotification))));
  
})();

} finally {
await __jait_hook_2212();
await __jait_hook_2080();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_system_notice_test_ts_156_3": {


async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
const receivedBodies: Array<Record<string, unknown>> = [];
function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || !req.url?.endsWith("/api/chat")) {
        res.writeHead(404);
        res.end();
        return;
      }
      receivedBodies.push(JSON.parse(await collectBody(req)) as Record<string, unknown>);
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(JSON.stringify({ message: { role: "assistant", content: "acknowledged" }, done: false }) + "\n");
      res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
const __jait_hook_1896 = async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  };
const __jait_hook_2080 = async () => {
    await app?.close();
    app = null;
  };
const __jait_hook_2153 = () => {
    receivedBodies.length = 0;
  };
const __jait_hook_2212 = async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  };
await __jait_hook_1896();
await __jait_hook_2153();
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
    const user = userService.createUser("sys-notice-user-2", "password123");
    const session = sessionService.create({ userId: user.id, name: "Sys Notice 2" });
    sessionState.set(session.id, { "chat.provider": "jait", "chat.cliModels": { jait: "llama3" } });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: session.id,
        _systemNotification: "[system-notification: background command finished]\nno notice line",
      },
    });
    __jait_capture(0, (response.statusCode));

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = messagesResponse.json() as { messages: Array<{ role: string }> };
    __jait_capture(1, (body.messages.filter((m) => m.role === "system")));
  
})();

} finally {
await __jait_hook_2212();
await __jait_hook_2080();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
