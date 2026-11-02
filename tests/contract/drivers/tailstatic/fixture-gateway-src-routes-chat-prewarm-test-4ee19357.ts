// Translated fixture from packages/gateway/src/routes/chat-prewarm.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-prewarm.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_135_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    let alive = true;
    const tracked = Object.assign(provider, { hasSession: () => alive });
    const h = await harness(tracked, "idle-expiry-followup");
    try {
      await h.chat({ content: "Remember the fixture uses UTF-8" });
      alive = false;
      const originalStart = provider.startSession.getMockImplementation()!;
      provider.startSession.mockImplementation(async options => {
        const session = await originalStart(options);
        alive = true;
        return session;
      });
      const response = await h.chat({ content: "Continue the fixture" });
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (provider.startSession.mock.calls));
      __jait_capture(2, (provider.sendTurn.mock.calls[1]?.[1]));
      __jait_capture(3, (provider.sendTurn.mock.calls[1]?.[1]));
    } finally { await h.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_157_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    let alive = true;
    const h = await harness(Object.assign(provider, { hasSession: () => alive }), "idle-expiry-prewarm");
    try {
      await h.prewarm();
      alive = false;
      const result = await h.prewarm();
      __jait_capture(0, (result.json()));
      __jait_capture(1, (provider.startSession.mock.calls));
    } finally { await h.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_170_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-first-message");

    const prewarmed = await h.prewarm();
    __jait_capture(0, (prewarmed.json()));
    __jait_capture(1, (provider.startSession.mock.calls));

    // Assert reuse of the completed warm session, independent of host load.
    const warmSession = await provider.startSession.mock.results[0]!.value;
    const response = await h.chat();

    __jait_capture(2, (response.statusCode));
    __jait_capture(3, (response.body));
    __jait_capture(4, (provider.startSession.mock.calls));
    __jait_capture(5, (provider.sendTurn.mock.calls));
    __jait_capture(6, (provider.sendTurn.mock.calls[0]?.[0]), (warmSession.id));

    await h.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_191_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-system-prompt");

    await h.prewarm();
    await h.chat();

    const [, firstTurnContent] = provider.sendTurn.mock.calls[0] as [string, string];
    // formatExternalProviderFirstTurn pastes the external-provider system
    // prompt into the first turn. A pre-warmed session has never been sent a
    // turn, so this message is still the first one.
    __jait_capture(0, (firstTurnContent));
    __jait_capture(1, (firstTurnContent.length));

    // ...and the *second* message must not repeat it.
    await h.chat({ content: "follow up" });
    const [, secondTurnContent] = provider.sendTurn.mock.calls[1] as [string, string];
    __jait_capture(2, (secondTurnContent.length), (firstTurnContent.length));

    await h.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_213_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-race");

    // Fire both without awaiting the pre-warm — the exact race a user creates
    // by typing fast after opening a new chat.
    const [, chatResponse] = await Promise.all([h.prewarm(), h.chat()]);

    __jait_capture(0, (chatResponse.statusCode));
    __jait_capture(1, (provider.startSession.mock.calls));
    __jait_capture(2, (provider.sendTurn.mock.calls));

    await h.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_228_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-model-switch");

    await h.prewarm({ model: "sonnet" });
    __jait_capture(0, (provider.startSession.mock.calls));

    const response = await h.chat({ model: "opus" });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (provider.startSession.mock.calls));
    __jait_capture(3, (provider.stopSession.mock.calls));
    __jait_capture(4, (provider.startSession.mock.calls[1]?.[0]));

    await h.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_245_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-existing");

    await h.chat();
    __jait_capture(0, (provider.startSession.mock.calls));

    const prewarmed = await h.prewarm();

    __jait_capture(1, (prewarmed.json()));
    __jait_capture(2, (provider.startSession.mock.calls));
    __jait_capture(3, (provider.stopSession.mock.calls));

    await h.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_prewarm_test_ts_261_3": {


const testConfig = {
  ...loadConfig(),
  jwtSecret: "prewarm-test-secret",
};
class SlowStartProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  /** Mirrors the ~3s ACP spawn observed in production, scaled down. */
  static readonly START_MS = 300;

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    await new Promise((resolve) => setTimeout(resolve, SlowStartProvider.START_MS));
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emitForTest({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "ok" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});
  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
async function harness(provider: CliProviderAdapter, name: string) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const sessionService = new SessionService(db);
  const sessionState = new SessionStateService(db);
  const userService = new UserService(db);
  const user = userService.createUser(`${name}-user`, "password123");
  const session = sessionService.create({ userId: user.id, name });
  const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
  const app = await createServer(testConfig, {
    db,
    sqlite,
    providerRegistry,
    sessionService,
    sessionState,
    userService,
  });
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  return {
    app,
    session,
    headers,
    prewarm: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat/prewarm",
      headers,
      payload: { sessionId: session.id, provider: "codex", runtimeMode: "full-access", ...payload },
    }),
    chat: (payload: Record<string, unknown> = {}) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
        ...payload,
      },
    }),
    close: async () => {
      await app.close();
      sqlite.close();
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new SlowStartProvider();
    const h = await harness(provider, "prewarm-jait");

    const response = await h.prewarm({ provider: "jait" });

    __jait_capture(0, (response.json()));
    __jait_capture(1, (provider.startSession.mock.calls));

    await h.close();
  
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
