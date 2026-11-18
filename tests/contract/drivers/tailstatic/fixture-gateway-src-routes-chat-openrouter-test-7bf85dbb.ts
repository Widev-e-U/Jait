// Translated fixture from packages/gateway/src/routes/chat-openrouter.test.ts; expected literals are in tail_static.rs.
import type { AddressInfo } from "node:net";







import type { MemoryEntry, MemoryScope, MemoryService, SaveMemoryInput } from "../../../../packages/gateway/src/memory/contracts.js";


import type { MobilePushService } from "../../../../packages/gateway/src/services/mobile-push.js";


import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-openrouter.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_149_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      __jait_capture(0, (String(input)));
      __jait_capture(1, ((init?.headers as Record<string, string> | undefined)?.["Authorization"]));

      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
      __jait_capture(2, (body.model));
      __jait_capture(3, (body.messages.at(-1)));

      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "hello",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    __jait_capture(4, (response.statusCode));
    __jait_capture(5, (fetchMock.mock.calls));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_202_3_each0": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const failSummary = false;

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("notification-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Notification Session" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.stream === false) {
        __jait_capture(0, (body.messages[1].content));
        __jait_capture(1, (body.messages[1].content));
        if (failSummary) throw new Error("Summary backend unavailable");
        return Response.json({ choices: [{ message: { content: "Confirmed the connection works" } }] });
      }
      return createOpenAIStreamResponse();
    }) as typeof fetch;
    // This test is about the summarizer itself, so use the real implementation.
    const actualNotifications =
      await vi.importActual<typeof import("../services/chat-notification.js")>(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)));
    vi.mocked(generateChatNotificationDetail).mockImplementation(actualNotifications.generateChatNotificationDetail);
    const sendChatCompleted = vi.fn().mockResolvedValue(undefined);
    const app = await createServer(testConfig, {
      db, sqlite, userService, sessionService,
      mobilePush: { sendChatCompleted } as unknown as MobilePushService,
    });
    try {
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const response = await app.inject({
        method: "POST", url: "/api/chat",
        headers: { authorization: `Bearer ${token}` },
        payload: { content: "Check connection", sessionId: session.id, model: "gpt-4o" },
      });
      __jait_capture(2, (response.statusCode));
      await vi.waitFor(() => __jait_capture(3, (sendChatCompleted.mock.calls)));
      __jait_capture(4, (sendChatCompleted.mock.calls), ([user.id,failSummary ? "ok" : "Confirmed the connection works"]));
    } finally {
      await app.close();
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_202_3_each1": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const failSummary = true;

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("notification-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Notification Session" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });
    globalThis.fetch = vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.stream === false) {
        __jait_capture(0, (body.messages[1].content));
        __jait_capture(1, (body.messages[1].content));
        if (failSummary) throw new Error("Summary backend unavailable");
        return Response.json({ choices: [{ message: { content: "Confirmed the connection works" } }] });
      }
      return createOpenAIStreamResponse();
    }) as typeof fetch;
    // This test is about the summarizer itself, so use the real implementation.
    const actualNotifications =
      await vi.importActual<typeof import("../services/chat-notification.js")>(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)));
    vi.mocked(generateChatNotificationDetail).mockImplementation(actualNotifications.generateChatNotificationDetail);
    const sendChatCompleted = vi.fn().mockResolvedValue(undefined);
    const app = await createServer(testConfig, {
      db, sqlite, userService, sessionService,
      mobilePush: { sendChatCompleted } as unknown as MobilePushService,
    });
    try {
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const response = await app.inject({
        method: "POST", url: "/api/chat",
        headers: { authorization: `Bearer ${token}` },
        payload: { content: "Check connection", sessionId: session.id, model: "gpt-4o" },
      });
      __jait_capture(2, (response.statusCode));
      await vi.waitFor(() => __jait_capture(3, (sendChatCompleted.mock.calls)));
      __jait_capture(4, (sendChatCompleted.mock.calls), ([user.id,failSummary ? "ok" : "Confirmed the connection works"]));
    } finally {
      await app.close();
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_251_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-effort-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Effort Session" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      reasoningEffort: "low",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });

    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return createOpenAIStreamResponse();
    }) as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const send = (content: string, reasoningEffort: string | null | undefined) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content,
        sessionId: session.id,
        model: "gpt-4o",
        ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      },
    });

    __jait_capture(0, ((await send("explicit high", "high")).statusCode));
    __jait_capture(1, ((await send("explicit default", null)).statusCode));
    __jait_capture(2, ((await send("fallback", undefined)).statusCode));

    __jait_capture(3, (bodies[0]?.["reasoning_effort"]));
    __jait_capture(4, (Object.hasOwn(bodies[1] ?? {}, "reasoning_effort")));
    __jait_capture(5, (bodies[2]?.["reasoning_effort"]));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_301_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("openrouter-queued-effort-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued Effort Session" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      reasoningEffort: "low",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });

    const controlledStream = createControlledOpenAIStreamResponse();
    const bodies: Array<Record<string, unknown>> = [];
    let resolveFirstFetch = () => {};
    const firstFetchStarted = new Promise<void>((resolve) => {
      resolveFirstFetch = resolve;
    });
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      resolveFirstFetch();
      return bodies.length === 1 ? controlledStream.response : createOpenAIStreamResponse();
    }) as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "slow queued effort turn",
        sessionId: session.id,
        provider: "jait",
        model: "gpt-4o",
        reasoningEffort: "high",
      },
    });
    await firstFetchStarted;

    const queuedResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "queued explicit default",
        sessionId: session.id,
        provider: "jait",
        model: "gpt-4o",
        reasoningEffort: null,
      },
    });
    __jait_capture(0, (queuedResponse.statusCode));

    const queued = sessionState.get(session.id, ["queued_messages"])["queued_messages"] as Array<Record<string, unknown>>;
    __jait_capture(1, (queued));
    __jait_capture(2, (Object.hasOwn(queued[0] ?? {}, "reasoningEffort")));
    __jait_captureType(3, (queued[0]?.["reasoningEffort"]));

    controlledStream.releaseSecondChunk();
    await firstResponse;
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    for (let attempt = 0; attempt < 20 && bodies.length < 2; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    __jait_capture(4, (bodies));
    __jait_capture(5, (bodies[0]?.["reasoning_effort"]));
    __jait_capture(6, (Object.hasOwn(bodies[1] ?? {}, "reasoning_effort")));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_386_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-cadence-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Cadence Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const controlledStream = createControlledOpenAIStreamResponse();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      __jait_capture(0, (url));
      return controlledStream.response;
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "reply in two chunks",
          sessionId: session.id,
          model: "glm-5.2:cloud",
        }),
      });

      __jait_capture(1, (response.status));
      __jait_capture(2, (response.headers.get("content-type")));

      const reader = response.body?.getReader();
      __jait_captureType(3, (reader));
      const decoder = new TextDecoder();
      let body = "";

      while (reader && !body.includes('"type":"token","content":"A"')) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }

      __jait_capture(4, (body));
      __jait_capture(5, (body));
      __jait_capture(6, (body));

      controlledStream.releaseSecondChunk();
      while (reader && !body.includes('"type":"token","content":"B"')) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
      await reader?.cancel().catch(() => {});

      __jait_capture(7, (body));
    } finally {
      await app.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_469_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("memory-cancel-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Memory Cancellation" });
    const memoryService = createMockMemoryService([]);
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let releaseMemory = () => {};
    const pending = new Promise<MemoryEntry[]>((resolve) => { releaseMemory = () => resolve([]); });
    memoryService.search = vi.fn(() => { markStarted(); return pending; });
    const app = await createServer(testConfig, { db, sqlite, userService, sessionService, memoryService });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const turn = app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { content: "stalled memory", sessionId: session.id } });
    try {
      await started;
      const cancel = await app.inject({ method: "POST", url: `/api/sessions/${session.id}/cancel`, headers });
      __jait_capture(0, (cancel.json()));
      const response = await Promise.race([
        turn,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Cancelled preparation stayed active")), 500)),
      ]);
      __jait_capture(1, (response.body));
      const streaming = await app.inject({ method: "GET", url: "/api/sessions/streaming", headers });
      __jait_capture(2, (streaming.json().sessionIds), (session.id));
    } finally {
      releaseMemory();
      await turn;
      await app.close();
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_506_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("zombie-cancel-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Zombie Cancellation" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });

    let markStarted = () => {};
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let releaseProvider = () => {};
    const providerPending = new Promise<Response>((resolve) => {
      releaseProvider = () => resolve(createOpenAIStreamResponse());
    });
    globalThis.fetch = vi.fn(async () => {
      markStarted();
      return providerPending;
    }) as typeof fetch;

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const turn = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: { content: "silent request", sessionId: session.id, model: "gpt-4o" },
    });
    try {
      await started;
      const cancel = await app.inject({ method: "POST", url: `/api/sessions/${session.id}/cancel`, headers });
      __jait_capture(0, (cancel.json()));
      await Promise.race([
        turn,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Cancelled turn stayed active")), 500)),
      ]);
      const streaming = await app.inject({ method: "GET", url: "/api/sessions/streaming", headers });
      __jait_capture(1, (streaming.json().sessionIds), (session.id));
    } finally {
      releaseProvider();
      await turn;
      await app.close();
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_556_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("cancel-persist-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Cancel Persistence Session" });
    const toolRegistry = new ToolRegistry();

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    toolRegistry.register({
      name: "proof.cancel",
      description: "Proof tool that runs until the chat turn is cancelled.",
      tier: "core",
      category: "meta",
      parameters: { type: "object", properties: {} },
      execute: async (_input, context) => new Promise((resolve) => {
        const finish = () => resolve({ ok: false, message: "Cancelled by test" });
        if (context.signal?.aborted) {
          finish();
          return;
        }
        context.signal?.addEventListener("abort", finish, { once: true });
      }),
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      __jait_capture(0, (url));
      return createToolCallStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const sendChatCompleted = vi.fn().mockResolvedValue(undefined);
    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      toolRegistry,
      mobilePush: { sendChatCompleted } as unknown as MobilePushService,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: "start a cancellable tool",
          sessionId: session.id,
          model: "gpt-4o",
        }),
      });

      __jait_capture(1, (response.status));
      const reader = response.body?.getReader();
      __jait_captureType(2, (reader));
      const decoder = new TextDecoder();
      let streamBody = "";
      const startedAt = Date.now();
      while (!streamBody.includes('"type":"tool_start"')) {
        const { done, value } = await reader!.read();
        __jait_capture(3, (done));
        const chunk = decoder.decode(value, { stream: true });
        streamBody += chunk;
        if (Date.now() - startedAt > 5000) throw new Error("Timed out waiting for tool_start");
      }

      const cancelResponse = await originalFetch(`http://127.0.0.1:${address.port}/api/sessions/${session.id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      __jait_capture(4, (cancelResponse.status));

      while (!streamBody.includes('"type":"done"')) {
        const { done, value } = await reader!.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamBody += chunk;
        if (Date.now() - startedAt > 10000) throw new Error("Timed out waiting for done");
      }
      await reader?.cancel().catch(() => {});

      __jait_capture(5, (sendChatCompleted.mock.calls));

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      __jait_capture(6, (messagesResponse.statusCode));
      const messagesBody = messagesResponse.json() as {
        messages: Array<{
          role: string;
          content: string;
          toolCalls?: Array<{ callId: string; tool: string; ok?: boolean; message?: string }>;
          segments?: Array<{ type: string; callIds?: string[] }>;
        }>;
      };
      const assistantMessage = messagesBody.messages.find((message) => message.role === "assistant");
      __jait_capture(7, (assistantMessage?.toolCalls));
      __jait_capture(8, (assistantMessage?.segments));
    } finally {
      await app.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_689_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("quota-persist-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Quota Persistence Session" });
    const toolRegistry = new ToolRegistry();

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });

    toolRegistry.register({
      name: "proof.ok",
      description: "Proof tool that succeeds immediately.",
      tier: "core",
      category: "meta",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "did the thing" }),
    });

    // Round 1 streams prose + a tool call; round 2 is refused for lack of quota.
    let llmCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) return originalFetch(input, init);
      llmCalls += 1;
      return llmCalls === 1 ? createTextThenToolCallStreamResponse() : createQuotaExhaustedResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService, toolRegistry });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ content: "do the thing", sessionId: session.id, model: "gpt-4o" }),
      });
      __jait_capture(0, (response.status));

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let streamBody = "";
      const startedAt = Date.now();
      while (!streamBody.includes('"type":"done"')) {
        const { done, value } = await reader.read();
        if (done) break;
        streamBody += decoder.decode(value, { stream: true });
        if (Date.now() - startedAt > 10_000) throw new Error("Timed out waiting for done");
      }
      await reader.cancel().catch(() => {});

      // The failure reached the live stream...
      __jait_capture(1, (streamBody));

      // ...and, crucially, survives a reload: the loop reports this class of
      // failure as an event and then returns normally, so nothing throws and
      // nothing aborts — the turn used to be persisted nowhere at all.
      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      __jait_capture(2, (messagesResponse.statusCode));
      const messagesBody = messagesResponse.json() as {
        messages: Array<{
          role: string;
          content: string;
          toolCalls?: Array<{ callId: string; tool: string; ok?: boolean }>;
          segments?: Array<{ type: string; content?: string; callIds?: string[] }>;
        }>;
      };
      const assistantMessage = messagesBody.messages.find((message) => message.role === "assistant");
      __jait_captureType(3, (assistantMessage));
      __jait_capture(4, (assistantMessage!.content));
      __jait_capture(5, (assistantMessage!.toolCalls));
      // Text, the tool call, then the error — in the order they happened.
      __jait_capture(6, (assistantMessage!.segments));
    } finally {
      await app.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_785_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("slow-tool-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Slow Tool Session" });
    const toolRegistry = new ToolRegistry();

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    let resolveTool: (() => void) | undefined;
    toolRegistry.register({
      name: "proof.cancel",
      description: "Proof tool that stays running until the test resolves it.",
      tier: "core",
      category: "meta",
      parameters: { type: "object", properties: {} },
      execute: () => new Promise((resolve) => {
        resolveTool = () => resolve({ ok: true, message: "Done" });
      }),
    });

    let openrouterCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      __jait_capture(0, (url));
      openrouterCallCount++;
      // First round: request the slow tool call. Once its result comes back,
      // the agent loop makes a second round — return a plain final answer so
      // the turn actually ends instead of looping on the same tool forever.
      return openrouterCallCount === 1 ? createToolCallStreamResponse() : createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      toolRegistry,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: "start a slow tool",
          sessionId: session.id,
          model: "gpt-4o",
        }),
      });

      __jait_capture(1, (response.status));
      const reader = response.body?.getReader();
      __jait_captureType(2, (reader));
      const decoder = new TextDecoder();
      let streamBody = "";
      const waitStartedAt = Date.now();
      while (!streamBody.includes('"type":"tool_start"')) {
        const { done, value } = await reader!.read();
        __jait_capture(3, (done));
        streamBody += decoder.decode(value, { stream: true });
        if (Date.now() - waitStartedAt > 5000) throw new Error("Timed out waiting for tool_start");
      }

      type ToolCallSnapshot = { callId: string; status?: string; startedAt?: number };
      const pollRunningToolCall = async (): Promise<ToolCallSnapshot> => {
        const messagesResponse = await app.inject({
          method: "GET",
          url: `/api/sessions/${session.id}/messages`,
          headers: { authorization: `Bearer ${token}` },
        });
        __jait_capture(4, (messagesResponse.statusCode));
        const body = messagesResponse.json() as {
          messages: Array<{ role: string; toolCalls?: ToolCallSnapshot[] }>;
        };
        const assistantMessage = body.messages.find((m) => m.role === "assistant");
        const toolCall = assistantMessage?.toolCalls?.find((tc) => tc.callId === "call_cancel_proof");
        __jait_capture(5, (toolCall?.status));
        return toolCall!;
      };

      // Reconnecting mid-execution must report a real, in-the-past start time —
      // not "now" — so the client can show meaningful elapsed time immediately.
      const firstPoll = await pollRunningToolCall();
      __jait_captureType(6, (firstPoll.startedAt));
      __jait_capture(7, (Date.now() - firstPoll.startedAt!));

      await new Promise((resolve) => setTimeout(resolve, 120));

      // A second reconnect while the tool is STILL running must report the
      // SAME startedAt as the first poll — this is the regression this test
      // guards: before the fix, every snapshot re-stamped startedAt to the
      // poll's own Date.now(), so two polls 120ms apart each showed ~0ms
      // elapsed and disagreed with each other.
      const secondPoll = await pollRunningToolCall();
      __jait_capture(8, (secondPoll.startedAt), (firstPoll.startedAt));
      __jait_capture(9, (Date.now() - secondPoll.startedAt!));

      resolveTool?.();
      const drainStartedAt = Date.now();
      while (!streamBody.includes('"type":"done"')) {
        const { done, value } = await reader!.read();
        if (done) break;
        streamBody += decoder.decode(value, { stream: true });
        if (Date.now() - drainStartedAt > 10000) throw new Error("Timed out waiting for done");
      }
      await reader?.cancel().catch(() => {});
    } finally {
      resolveTool?.();
      await app.close();
    }
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_917_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-mimo-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Mimo Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      __jait_capture(0, (String(input)));
      __jait_capture(1, ((init?.headers as Record<string, string> | undefined)?.["Authorization"]));

      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
      __jait_capture(2, (body.model));
      __jait_capture(3, (body.messages.at(-1)));

      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "reply ok",
        sessionId: session.id,
        model: "xiaomi/mimo-v2-pro",
      },
    });

    __jait_capture(4, (response.statusCode));
    __jait_capture(5, (response.headers["content-type"]));
    __jait_capture(6, (response.body));
    __jait_capture(7, (fetchMock.mock.calls));

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });
    __jait_capture(8, (messagesResponse.statusCode));
    const messagesBody = messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        hasContextFlow?: boolean;
        hasMemoryProvenance?: boolean;
      }>;
    };
    const assistantMessage = messagesBody.messages.find((msg) => msg.role === "assistant");
    __jait_capture(9, (assistantMessage?.hasContextFlow));
    // contextFlow is lazy-loaded via the context-flow endpoint
    const assistantIndex = messagesBody.messages.findIndex((msg) => msg.role === "assistant");
    const cfResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages/${assistantIndex}/context-flow`,
      headers: { authorization: `Bearer ${token}` },
    });
    __jait_capture(10, (cfResponse.statusCode));
    const cfBody = cfResponse.json() as {
      contextFlow?: {
        provider: string;
        model: string;
        rounds: Array<{ model: string; messages: Array<{ role: string; content: string }> }> };
    };
    const contextFlow = cfBody.contextFlow;
    __jait_capture(11, (contextFlow));
    __jait_capture(12, (contextFlow?.rounds[0]?.messages[0]));
    __jait_capture(13, (String(contextFlow?.rounds[0]?.messages[0]?.content ?? "")));
    __jait_capture(14, (contextFlow?.rounds[0]?.messages.at(-1)));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_1016_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("memory-context-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Memory Context Session" });
    const memoryService = createMockMemoryService([
      memoryEntry(),
    ]);

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    let sentMessages: Array<{ role: string; content: string }> = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      sentMessages = JSON.parse(String(init?.body)).messages;
      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      memoryService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "use our todo controls preference",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    __jait_capture(0, (response.statusCode));
    const memoryMessage = sentMessages.find((message) => String(message.content).includes("<relevant_memory>"));
    __jait_capture(1, (memoryMessage));
    __jait_capture(2, (String(memoryMessage?.content)));
    __jait_capture(3, (sentMessages.at(-1)));
    __jait_capture(4, (response.body));
    __jait_capture(5, (response.body));
    __jait_capture(6, (response.body));
    __jait_capture(7, (fetchMock.mock.calls));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_1075_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("memory-eval-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Memory Evaluation Session" });
    const memoryService = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });

    await memoryService.save({
      scope: "project",
      content: "Shared API request and response contracts should live in packages/shared before gateway or web imports them.",
      source: { type: "chat", id: "prior-session-contracts", surface: "chat" },
    });
    await memoryService.save({
      scope: "contact",
      content: "Alice prefers concise progress updates that mention test evidence.",
      source: { type: "chat", id: "prior-session-progress", surface: "chat" },
    });
    await memoryService.save({
      scope: "project",
      content: "Android release artifacts are built by the release workflow.",
      source: { type: "chat", id: "prior-session-release", surface: "chat" },
    });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    let sentMessages: Array<{ role: string; content: string }> = [];
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      sentMessages = JSON.parse(String(init?.body)).messages;
      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      memoryService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "Based on what you know, where should shared API contracts live and how should progress updates be written?",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    __jait_capture(0, (response.statusCode));
    // Check outside the mock: the agent loop catches provider errors.
    const body = { messages: sentMessages };
    const memoryMessage = body.messages.find((message) => String(message.content).includes("<relevant_memory>"));
    const memoryContent = String(memoryMessage?.content ?? "");

    __jait_capture(1, (memoryMessage));
    __jait_capture(2, (memoryContent));
    __jait_capture(3, (memoryContent));
    __jait_capture(4, (memoryContent));
    __jait_capture(5, (memoryContent));
    __jait_capture(6, (memoryContent));
    __jait_capture(7, (body.messages.at(-1)));
    __jait_capture(8, (response.body));
    __jait_capture(9, (response.body));
    __jait_capture(10, (fetchMock.mock.calls));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_1158_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("swarm-openrouter-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Swarm Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      __jait_capture(0, (body.model));
      __jait_capture(1, (body.model));
      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "evaluate rust rewrite",
        sessionId: session.id,
        mode: "swarm",
        provider: "codex",
        model: "gpt-5-codex",
      },
    });

    __jait_capture(2, (response.statusCode));
    __jait_capture(3, (fetchMock.mock.calls));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_openrouter_test_ts_1209_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/chat-notification.ts",import.meta.url)), async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chat-notification.js")>();
  return { ...actual, generateChatNotificationDetail: vi.fn(async () => null) };
});
const { createServer } = await import("../../../../packages/gateway/src/server.js");
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { openDatabase, migrateDatabase } = await import("../../../../packages/gateway/src/db/index.js");
const { SessionService } = await import("../../../../packages/gateway/src/services/sessions.js");
const { SessionStateService } = await import("../../../../packages/gateway/src/services/session-state.js");
const { UserService } = await import("../../../../packages/gateway/src/services/users.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { MemoryEngine } = await import("../../../../packages/gateway/src/memory/service.js");
const { SqliteMemoryBackend } = await import("../../../../packages/gateway/src/memory/sqlite-backend.js");
const { generateChatNotificationDetail } = await import("../../../../packages/gateway/src/services/chat-notification.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
const originalFetch = globalThis.fetch;
function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}
function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createTextThenToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Working on it"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_before_quota","type":"function","function":{"name":"proof_ok","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
function createQuotaExhaustedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { message: "You exceeded your current quota", code: "insufficient_quota" } }),
    { status: 429, headers: { "Content-Type": "application/json" } },
  );
}
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}
const __jait_hook_5928 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.mocked(generateChatNotificationDetail).mockImplementation(async () => null);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-misconfigured", "password123");
    const session = sessionService.create({ userId: user.id, name: "Missing Key Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {},
    });

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "hello",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_5928();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
