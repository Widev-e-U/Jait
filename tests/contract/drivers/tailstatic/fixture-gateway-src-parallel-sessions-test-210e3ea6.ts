// Translated fixture from packages/gateway/src/parallel-sessions.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import {
  createServer as createHttpServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/parallel-sessions.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_166_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    const [res1, res2] = await Promise.all([
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "hello from session A", sessionId: "par-a" },
      }),
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "hello from session B", sessionId: "par-b" },
      }),
    ]);

    // Both return 200
    __jait_capture(0, (res1.statusCode));
    __jait_capture(1, (res2.statusCode));

    // Both produce token + done events
    const events1 = parseSSE(res1.body);
    const events2 = parseSSE(res2.body);

    __jait_capture(2, (events1.some((e) => e.type === "token")));
    __jait_capture(3, (events1.some((e) => e.type === "done")));
    __jait_capture(4, (events2.some((e) => e.type === "token")));
    __jait_capture(5, (events2.some((e) => e.type === "done")));

    // Verify streamed content matches
    __jait_capture(6, (tokensToString(events1)));
    __jait_capture(7, (tokensToString(events2)));

    // Verify session histories are independent
    const histA = await inject({ method: "GET", url: "/api/sessions/par-a/messages" });
    const histB = await inject({ method: "GET", url: "/api/sessions/par-b/messages" });

    const msgsA = (JSON.parse(histA.body) as { messages: { role: string; content: string }[] }).messages;
    const msgsB = (JSON.parse(histB.body) as { messages: { role: string; content: string }[] }).messages;

    __jait_capture(8, (msgsA));
    __jait_capture(9, (msgsB));

    // Session A
    __jait_capture(10, (msgsA[0].role));
    __jait_capture(11, (msgsA[0].content));
    __jait_capture(12, (msgsA[1].role));
    __jait_capture(13, (msgsA[1].content));

    // Session B
    __jait_capture(14, (msgsB[0].role));
    __jait_capture(15, (msgsB[0].content));
    __jait_capture(16, (msgsB[1].role));
    __jait_capture(17, (msgsB[1].content));

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_226_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    const ids = ["stress-1", "stress-2", "stress-3"];
    const results = await Promise.all(
      ids.map((id) =>
        inject({
          method: "POST",
          url: "/api/chat",
          payload: { content: `msg for ${id}`, sessionId: id },
        }),
      ),
    );

    for (let i = 0; i < ids.length; i++) {
      __jait_capture(0, (results[i].statusCode));
      const events = parseSSE(results[i].body);
      __jait_capture(1, (tokensToString(events)), (`Echo: msg for ${ids[i]}`));
    }

    // Verify all histories
    for (const id of ids) {
      const hist = await inject({ method: "GET", url: `/api/sessions/${id}/messages` });
      const msgs = (JSON.parse(hist.body) as { messages: { role: string; content: string }[] }).messages;
      __jait_capture(2, (msgs));
      __jait_capture(3, (msgs[0].content), (`msg for ${id}`));
      __jait_capture(4, (msgs[1].content), (`Echo: msg for ${id}`));
    }

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_260_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    // First turn for session X
    const r1 = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "first message", sessionId: "multi-x" },
    });
    __jait_capture(0, (r1.statusCode));

    // Second turn for X in parallel with first turn for Y
    const [r2, rY] = await Promise.all([
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "second message", sessionId: "multi-x" },
      }),
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "only message", sessionId: "multi-y" },
      }),
    ]);

    __jait_capture(1, (r2.statusCode));
    __jait_capture(2, (rY.statusCode));

    // Session X should have 2 turns (4 messages: 2 user + 2 assistant)
    const histX = await inject({ method: "GET", url: "/api/sessions/multi-x/messages" });
    const msgsX = (JSON.parse(histX.body) as { messages: { role: string; content: string }[] }).messages;
    __jait_capture(3, (msgsX));
    __jait_capture(4, (msgsX[0].content));
    __jait_capture(5, (msgsX[1].content));
    __jait_capture(6, (msgsX[2].content));
    __jait_capture(7, (msgsX[3].content));

    // Session Y should have 1 turn (2 messages)
    const histY = await inject({ method: "GET", url: "/api/sessions/multi-y/messages" });
    const msgsY = (JSON.parse(histY.body) as { messages: { role: string; content: string }[] }).messages;
    __jait_capture(8, (msgsY));
    __jait_capture(9, (msgsY[0].content));
    __jait_capture(10, (msgsY[1].content));

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_309_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    // Need a real listening server for the disconnect test
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const controller = new AbortController();

    // Start a real fetch to the chat endpoint
    const response = await authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "disconnect me",
        sessionId: "disco-session",
      }),
      signal: controller.signal,
    });

    const reader = response.body!.getReader();

    // Read at least one chunk to make sure streaming has started
    const firstChunk = await reader.read();
    __jait_capture(0, (firstChunk.done));

    // Abort the client connection
    controller.abort();

    // Give the gateway time to finish reading the Ollama stream and save history
    // (mock Ollama streams ~5 tokens × 80ms = ~400ms, add generous margin)
    await sleep(1500);

    // Verify the history was saved despite the client disconnect
    const hist = await inject({
      method: "GET",
      url: "/api/sessions/disco-session/messages",
    });
    const msgs = (JSON.parse(hist.body) as { messages: { role: string; content: string }[] }).messages;

    __jait_capture(1, (msgs.length));
    __jait_capture(2, (msgs[0].role));
    __jait_capture(3, (msgs[0].content));
    __jait_capture(4, (msgs[1].role));
    __jait_capture(5, (msgs[1].content));

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_361_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    const res = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "count test", sessionId: "count-session" },
    });

    const events = parseSSE(res.body);
    const doneEvent = events.find((e) => e.type === "done");

    __jait_captureType(0, (doneEvent));
    __jait_capture(1, (doneEvent!.session_id));
    __jait_capture(2, (doneEvent!.prompt_count));

    // Send a second message
    const res2 = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "second count test", sessionId: "count-session" },
    });

    const events2 = parseSSE(res2.body);
    const doneEvent2 = events2.find((e) => e.type === "done");
    __jait_capture(3, (doneEvent2!.prompt_count));

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_393_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    // Slow mock Ollama: "Echo: slow streaming test here" = 5 words × 400ms = 2s
    const slowOllama = await startMockOllama(400);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start streaming (don't await — let it proceed in background)
    const streamPromise = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "slow streaming test here",
        sessionId: "midstream-sess",
      }),
    });

    // Wait long enough for ~2 tokens to arrive, but stream is still going
    await sleep(900);

    // Query messages while stream is in progress
    const hist = await inject({
      method: "GET",
      url: "/api/sessions/midstream-sess/messages",
    });
    const msgs = (JSON.parse(hist.body) as {
      messages: { role: string; content: string }[];
    }).messages;

    // BUG 1: assistant message must exist mid-stream (even with partial content)
    __jait_capture(0, (msgs));
    __jait_capture(1, (msgs[0].role));
    __jait_capture(2, (msgs[0].content));
    __jait_capture(3, (msgs[1].role));
    __jait_capture(4, (msgs[1].content.length));

    // Let the stream finish, then verify the final state
    const response = await streamPromise;
    await response.text();

    const histFinal = await inject({
      method: "GET",
      url: "/api/sessions/midstream-sess/messages",
    });
    const msgsFinal = (JSON.parse(histFinal.body) as {
      messages: { role: string; content: string }[];
    }).messages;
    __jait_capture(5, (msgsFinal[1].content));

    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_471_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const slowOllama = await startMockOllama(300);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start streaming to session A
    const controllerA = new AbortController();
    const fetchA = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "message for A",
        sessionId: "switch-a",
      }),
      signal: controllerA.signal,
    });

    // Wait for first token, then "switch away" (abort the client)
    const resA = await fetchA.then((r) => r);
    const readerA = resA.body!.getReader();
    await readerA.read(); // first chunk
    controllerA.abort();

    // Meanwhile, complete a message on session B
    const resB = await authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "message for B",
        sessionId: "switch-b",
      }),
    });
    await resB.text();

    // Wait for session A's stream to finish in the background
    await sleep(2500);

    // "Switch back" to session A — simulate reload/refetch
    const histA = await inject({
      method: "GET",
      url: "/api/sessions/switch-a/messages",
    });
    const msgsA = (JSON.parse(histA.body) as {
      messages: { role: string; content: string }[];
    }).messages;

    __jait_capture(0, (msgsA));
    __jait_capture(1, (msgsA[0].content));
    __jait_capture(2, (msgsA[1].role));
    __jait_capture(3, (msgsA[1].content));

    // Session B also correct
    const histB = await inject({
      method: "GET",
      url: "/api/sessions/switch-b/messages",
    });
    const msgsB = (JSON.parse(histB.body) as {
      messages: { role: string; content: string }[];
    }).messages;
    __jait_capture(4, (msgsB));
    __jait_capture(5, (msgsB[0].content));

    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_563_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    // Send message without sessionId (mimics client stale-closure bug)
    const res = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "orphan me" },
    });
    __jait_capture(0, (res.statusCode));

    // The done event reveals the generated session_id
    const events = parseSSE(res.body);
    const doneEvent = events.find((e) => e.type === "done");
    const assignedId = doneEvent!.session_id as string;

    // Messages are under the random id
    const hist1 = await inject({
      method: "GET",
      url: `/api/sessions/${assignedId}/messages`,
    });
    __jait_capture(1, ((JSON.parse(hist1.body) as { messages: unknown[] }).messages));

    // But NOT under any "intended" session id
    const hist2 = await inject({
      method: "GET",
      url: "/api/sessions/my-intended-session/messages",
    });
    __jait_capture(2, ((JSON.parse(hist2.body) as { messages: unknown[] }).messages));

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_602_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    // Slow mock: "Echo: streaming resume test here" = 6 words × 300ms = 1.8s
    const slowOllama = await startMockOllama(300);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start the original chat stream (don't await)
    const chatPromise = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "streaming resume test here",
        sessionId: "sse-resume",
      }),
    });

    // Wait for a couple of tokens to arrive (~700ms → ~2 tokens)
    await sleep(700);

    // Connect to the stream-resume SSE endpoint
    const streamRes = await authFetch(`${baseUrl}/api/sessions/sse-resume/stream`);
    __jait_capture(0, (streamRes.status));
    __jait_capture(1, (streamRes.headers.get("content-type")));

    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    const events: Record<string, unknown>[] = [];

    // Read all SSE events until the stream closes
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
        }
      }
    }

    // First event must be a snapshot with existing messages
    const snapshot = events[0];
    __jait_capture(2, (snapshot.type));
    __jait_capture(3, (snapshot.streaming));
    const snapMsgs = snapshot.messages as { role: string; content: string }[];
    __jait_capture(4, (snapMsgs.length)); // user + partial assistant
    __jait_capture(5, (snapMsgs[0].role));
    __jait_capture(6, (snapMsgs[0].content));
    __jait_capture(7, (snapMsgs[1].role));
    __jait_capture(8, (snapMsgs[1].content.length)); // has partial content

    // Should have received live token events after the snapshot
    const tokenEvents = events.filter((e) => e.type === "token");
    __jait_capture(9, (tokenEvents.length));

    // Must end with a done event
    const lastEvent = events[events.length - 1];
    __jait_capture(10, (lastEvent.type));
    __jait_capture(11, (lastEvent.session_id));

    // Concatenate snapshot's partial content + live tokens = full response
    const snapshotContent = snapMsgs[1].content;
    const liveTokens = tokenEvents.map((e) => e.content as string).join("");
    __jait_capture(12, (snapshotContent + liveTokens));

    // Clean up
    const chatRes = await chatPromise;
    await chatRes.text();
    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_705_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject, authFetch } = await setupAuthedApp();

    // Complete a chat first
    const chatRes = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "finished message", sessionId: "finished-sess" },
    });
    __jait_capture(0, (chatRes.statusCode));

    // Now connect to the stream endpoint — should get snapshot + done immediately
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const streamRes = await authFetch(`${baseUrl}/api/sessions/finished-sess/stream`);
    const body = await streamRes.text();
    const events = body
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);

    __jait_capture(1, (events));
    __jait_capture(2, (events[0].type));
    __jait_capture(3, (events[0].streaming));
    const msgs = events[0].messages as { role: string; content: string }[];
    __jait_capture(4, (msgs));
    __jait_capture(5, (msgs[1].content));

    __jait_capture(6, (events[1].type));

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_742_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    // Slow mock: "Echo: cancel me during streaming" = 6 words × 400ms = 2.4s
    const slowOllama = await startMockOllama(400);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start a slow chat stream (don't await)
    const chatPromise = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "cancel me during streaming",
        sessionId: "cancel-sess",
      }),
    });

    // Wait for ~2 tokens to arrive
    await sleep(900);

    // Call the cancel endpoint
    const cancelRes = await authFetch(`${baseUrl}/api/sessions/cancel-sess/cancel`, {
      method: "POST",
    });
    __jait_capture(0, (cancelRes.status));
    const cancelBody = await cancelRes.json() as { ok: boolean; cancelled: boolean };
    __jait_capture(1, (cancelBody.ok));
    __jait_capture(2, (cancelBody.cancelled));

    // Wait a bit for cleanup
    await sleep(300);

    // Check that the history has partial content saved (not empty, not full)
    const hist = await inject({
      method: "GET",
      url: "/api/sessions/cancel-sess/messages",
    });
    const data = JSON.parse(hist.body) as {
      sessionId: string;
      streaming: boolean;
      messages: { role: string; content: string }[];
    };

    __jait_capture(3, (data.streaming)); // no longer streaming
    __jait_capture(4, (data.messages));
    __jait_capture(5, (data.messages[0].role));
    __jait_capture(6, (data.messages[1].role));
    // Partial content: more than empty but less than full response
    __jait_capture(7, (data.messages[1].content.length));
    __jait_capture(8, (data.messages[1].content.length));

    // Cancelling again should return cancelled: false (no active stream)
    const cancel2 = await authFetch(`${baseUrl}/api/sessions/cancel-sess/cancel`, {
      method: "POST",
    });
    const cancel2Body = await cancel2.json() as { ok: boolean; cancelled: boolean };
    __jait_capture(9, (cancel2Body.cancelled));

    // Clean up the original fetch
    try { await chatPromise.then((r) => r.text()); } catch { /* aborted */ }
    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
case "tailstatic_packages_gateway_src_parallel_sessions_test_ts_833_3": {


const TOKEN_DELAY_MS = 80;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}
function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
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

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      if (isNative) {
        // Ollama native /api/chat: newline-delimited JSON.
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        for (let i = 0; i < words.length; i++) {
          const token = words[i] + (i < words.length - 1 ? " " : "");
          res.write(JSON.stringify({ message: { role: "assistant", content: token }, done: false }) + "\n");
          await sleep(delayMs);
        }
        res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: words.length }) + "\n");
        res.end();
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}
/*__jait_scope_open__*/{
let mockOllama: Server;
let ollamaUrl: string;
function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }
async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }
const __jait_hook_4044 = async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  };
const __jait_hook_4222 = async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  };
await __jait_hook_4044();
try {
await (async()=>{

    const { app, inject } = await setupAuthedApp();

    const sessionIds = Array.from({ length: 12 }, (_, i) => `burst-${i + 1}`);

    const responses = await Promise.all(
      sessionIds.map((sessionId) =>
        inject({
          method: "POST",
          url: "/api/chat",
          payload: { content: `payload for ${sessionId}`, sessionId },
        })
      ),
    );

    for (const res of responses) {
      __jait_capture(0, (res.statusCode));
      const events = parseSSE(res.body);
      __jait_capture(1, (events.some((e) => e.type === "done")));
    }

    const histories = await Promise.all(
      sessionIds.map((sessionId) =>
        inject({ method: "GET", url: `/api/sessions/${sessionId}/messages` })
      ),
    );

    histories.forEach((hist, idx) => {
      const sessionId = sessionIds[idx]!;
      const msgs = (JSON.parse(hist.body) as { messages: { role: string; content: string }[] }).messages;
      __jait_capture(2, (msgs));
      __jait_capture(3, (msgs[0]?.content), (`payload for ${sessionId}`));
      __jait_capture(4, (msgs[1]?.content), (`Echo: payload for ${sessionId}`));
    });

    await app.close();
  
})();

} finally {
await __jait_hook_4222();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
