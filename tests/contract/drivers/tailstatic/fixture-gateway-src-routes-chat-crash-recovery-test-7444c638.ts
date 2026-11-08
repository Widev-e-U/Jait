// Translated fixture from packages/gateway/src/routes/chat-crash-recovery.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";

import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { messages } from "../../../../packages/gateway/src/db/schema.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-crash-recovery.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_crash_recovery_test_ts_94_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "crash-recovery-test-secret",
};
const originalFetch = globalThis.fetch;
function recoveredResponse(): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"content":"Recovered and finished."},"finish_reason":null}]}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
class RecoveryCliProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Recovery Codex",
    description: "Crash-recovery test provider",
    available: true,
    modes: ["full-access"],
  };
  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "recovery-provider-session",
    providerId: this.id,
    threadId: options.threadId,
    status: "running",
    runtimeMode: options.mode,
    startedAt: new Date().toISOString(),
  }));
  readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitter.emit("event", { type: "token", sessionId, content: "Recovered with tools." } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "turn.completed", sessionId } satisfies ProviderEvent);
    }, 0);
  });
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});
  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly respondToApproval = vi.fn(async (): Promise<void> => {});
  private readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const __jait_hook_2927 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new RecoveryCliProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("crash-recovery-cli-user", "password123");
    const session = sessionService.create({
      userId: user.id,
      name: "Interrupted CLI work",
      projectPath: "/workspace/project",
    });
    sessionState.set(session.id, {
      "chat.provider": "codex",
      "chat.cliModels": { codex: "gpt-5-codex" },
      "chat.activeTurn": {
        turnId: "turn-before-restart",
        startedAt: "2026-09-10T06:35:00.000Z",
        mode: "agent",
        responseStyle: "normal",
        provider: "codex",
        runtimeMode: "full-access",
        recoveryAttempts: 0,
      },
    });

    const app = await createServer({
      ...testConfig,
      host: "0.0.0.0",
      port: 43_123,
    }, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
      providerRegistry,
    });

    try {
      await (app as typeof app & {
        recoverInterruptedChatTurns: () => Promise<number>;
      }).recoverInterruptedChatTurns();

      __jait_capture(0, (provider.startSession.mock.calls));
      const options = provider.startSession.mock.calls[0]?.[0];
      __jait_capture(1, (options?.mcpServers?.map((server) => server.url)), ([
        `http://127.0.0.1:43123/mcp?sessionId=${session.id}&projectRoot=%2Fworkspace%2Fproject&runtimeMode=full-access&toolSet=core`,
        `http://127.0.0.1:43123/mcp?sessionId=${session.id}&projectRoot=%2Fworkspace%2Fproject&runtimeMode=full-access&toolSet=deferred`,
      ]));
    } finally {
      await app.close();
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_2927();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_crash_recovery_test_ts_154_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "crash-recovery-test-secret",
};
const originalFetch = globalThis.fetch;
function recoveredResponse(): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"content":"Recovered and finished."},"finish_reason":null}]}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
class RecoveryCliProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Recovery Codex",
    description: "Crash-recovery test provider",
    available: true,
    modes: ["full-access"],
  };
  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "recovery-provider-session",
    providerId: this.id,
    threadId: options.threadId,
    status: "running",
    runtimeMode: options.mode,
    startedAt: new Date().toISOString(),
  }));
  readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitter.emit("event", { type: "token", sessionId, content: "Recovered with tools." } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "turn.completed", sessionId } satisfies ProviderEvent);
    }, 0);
  });
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});
  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly respondToApproval = vi.fn(async (): Promise<void> => {});
  private readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const __jait_hook_2927 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("crash-recovery-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Interrupted work" });

    // The account default must never stand in for a user decision.
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "test-key" },
    });
    db.insert(messages).values([
      {
        id: "original-user",
        sessionId: session.id,
        role: "user",
        content: "Implement the recovery feature",
        createdAt: "2026-08-31T08:19:00.000Z",
      },
      {
        id: "partial-assistant",
        sessionId: session.id,
        role: "assistant",
        content: "I have started the implementation.",
        createdAt: "2026-08-31T08:19:01.000Z",
      },
    ]).run();
    sessionState.set(session.id, {
      "chat.activeTurn": {
        turnId: "turn-before-oom",
        startedAt: "2026-08-31T08:19:00.000Z",
        mode: "agent",
        responseStyle: "normal",
        recoveryAttempts: 0,
      },
    });

    const fetchSpy = vi.fn(async () => recoveredResponse());
    globalThis.fetch = fetchSpy as typeof fetch;
    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });

    try {
      const recover = (app as typeof app & {
        recoverInterruptedChatTurns: () => Promise<number>;
      }).recoverInterruptedChatTurns;
      await __jait_captureResolved(0, (recover()));

      __jait_captureType(1, (sessionState.get(session.id, ["chat.activeTurn"])["chat.activeTurn"]));
      const persisted = db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, session.id))
        .orderBy(messages.createdAt, messages.id)
        .all();

      const interruption = persisted.find((row) => row.id === "gateway-interruption-turn-before-oom");
      __jait_capture(2, (interruption?.content));
      __jait_capture(3, (interruption?.content));
      __jait_capture(4, (persisted.some((row) =>
        row.role === "assistant" && row.content.includes("Recovered and finished.")
      )));
      // No provider request may be issued on the user's behalf.
      __jait_capture(5, (fetchSpy.mock.calls));
      __jait_capture(6, (persisted.filter((row) => row.id === "gateway-interruption-turn-before-oom")));
    } finally {
      await app.close();
    }
  
})();

} finally {
await __jait_hook_2927();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_crash_recovery_test_ts_233_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "crash-recovery-test-secret",
};
const originalFetch = globalThis.fetch;
function recoveredResponse(): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"content":"Recovered and finished."},"finish_reason":null}]}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
class RecoveryCliProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Recovery Codex",
    description: "Crash-recovery test provider",
    available: true,
    modes: ["full-access"],
  };
  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "recovery-provider-session",
    providerId: this.id,
    threadId: options.threadId,
    status: "running",
    runtimeMode: options.mode,
    startedAt: new Date().toISOString(),
  }));
  readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitter.emit("event", { type: "token", sessionId, content: "Recovered with tools." } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "turn.completed", sessionId } satisfies ProviderEvent);
    }, 0);
  });
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});
  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly respondToApproval = vi.fn(async (): Promise<void> => {});
  private readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const __jait_hook_2927 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("crash-recovery-selected-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Interrupted selected work" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: { OPENROUTER_API_KEY: "test-key" },
    });
    db.insert(messages).values([
      {
        id: "original-user",
        sessionId: session.id,
        role: "user",
        content: "Implement the recovery feature",
        createdAt: "2026-08-31T08:19:00.000Z",
      },
      {
        id: "partial-assistant",
        sessionId: session.id,
        role: "assistant",
        content: "I have started the implementation.",
        createdAt: "2026-08-31T08:19:01.000Z",
      },
    ]).run();
    sessionState.set(session.id, {
      "chat.provider": "openrouter",
      "chat.cliModels": { openrouter: "anthropic/claude-sonnet-4" },
      "chat.activeTurn": {
        turnId: "turn-before-oom",
        startedAt: "2026-08-31T08:19:00.000Z",
        mode: "agent",
        responseStyle: "normal",
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
        recoveryAttempts: 0,
      },
    });

    globalThis.fetch = vi.fn(async () => recoveredResponse()) as typeof fetch;
    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });

    try {
      const recover = (app as typeof app & {
        recoverInterruptedChatTurns: () => Promise<number>;
      }).recoverInterruptedChatTurns;
      await __jait_captureResolved(0, (recover()));

      __jait_captureType(1, (sessionState.get(session.id, ["chat.activeTurn"])["chat.activeTurn"]));
      const persisted = db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, session.id))
        .orderBy(messages.createdAt, messages.id)
        .all();

      const interruption = persisted.find((row) => row.id === "gateway-interruption-turn-before-oom");
      __jait_capture(2, (interruption?.content));
      __jait_capture(3, (JSON.parse(interruption?.segments ?? "[]")));
      __jait_capture(4, (persisted.some((row) =>
        row.role === "assistant" && row.content.includes("Recovered and finished.")
      )));
      __jait_capture(5, (persisted.filter((row) => row.id === "gateway-interruption-turn-before-oom")));
    } finally {
      await app.close();
    }
  
})();

} finally {
await __jait_hook_2927();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_crash_recovery_test_ts_314_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "crash-recovery-test-secret",
};
const originalFetch = globalThis.fetch;
function recoveredResponse(): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{"content":"Recovered and finished."},"finish_reason":null}]}\n\n',
      ));
      controller.enqueue(encoder.encode(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}
class RecoveryCliProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Recovery Codex",
    description: "Crash-recovery test provider",
    available: true,
    modes: ["full-access"],
  };
  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "recovery-provider-session",
    providerId: this.id,
    threadId: options.threadId,
    status: "running",
    runtimeMode: options.mode,
    startedAt: new Date().toISOString(),
  }));
  readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitter.emit("event", { type: "token", sessionId, content: "Recovered with tools." } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "turn.completed", sessionId } satisfies ProviderEvent);
    }, 0);
  });
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});
  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly respondToApproval = vi.fn(async (): Promise<void> => {});
  private readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const __jait_hook_2927 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("crash-loop-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Crash loop" });
    sessionState.set(session.id, {
      "chat.activeTurn": {
        turnId: "turn-crash-loop",
        startedAt: "2026-08-31T08:19:00.000Z",
        mode: "agent",
        responseStyle: "normal",
        recoveryAttempts: 3,
      },
    });

    const fetchMock = vi.fn(async () => recoveredResponse());
    globalThis.fetch = fetchMock as typeof fetch;
    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });

    try {
      await (app as typeof app & {
        recoverInterruptedChatTurns: () => Promise<number>;
      }).recoverInterruptedChatTurns();

      __jait_capture(0, (fetchMock.mock.calls));
      __jait_captureType(1, (sessionState.get(session.id, ["chat.activeTurn"])["chat.activeTurn"]));
      const notice = db.select().from(messages)
        .where(eq(messages.id, "gateway-interruption-turn-crash-loop"))
        .get();
      __jait_capture(2, (notice?.content));
      __jait_capture(3, (notice?.content));
    } finally {
      await app.close();
    }
  
})();

} finally {
await __jait_hook_2927();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
