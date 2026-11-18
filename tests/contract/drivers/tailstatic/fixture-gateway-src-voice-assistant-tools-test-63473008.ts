// Translated fixture from packages/gateway/src/voice-assistant/tools.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
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
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { BackgroundTaskManager, executeVoiceTool, getVoiceToolSchemas } from "../../../../packages/gateway/src/voice-assistant/tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/voice-assistant/tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_105_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_2953 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    __jait_capture(0, (getVoiceToolSchemas().some((tool) => tool.name === "ask_agent_about_request")));
  
})();

} finally {
await __jait_hook_2953();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_109_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_2953 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    const schemas = getVoiceToolSchemas();
    __jait_capture(0, (schemas.some((tool) => tool.name === "get_location")));
    __jait_capture(1, (schemas.some((tool) => tool.name === "get_weather")));
  
})();

} finally {
await __jait_hook_2953();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_115_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_2953 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    process.env["JAIT_LOCATION"] = "Berlin, Germany";

    const result = await executeVoiceTool("get_location", {}, { config: loadConfig() });

    __jait_capture(0, (JSON.parse(result)));
  
})();

} finally {
await __jait_hook_2953();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_127_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_2953 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    process.env["JAIT_LOCATION"] = "Berlin";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      __jait_capture(0, (String(input)));
      return new Response("Berlin: 8 C, light rain", { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await executeVoiceTool("get_weather", {}, { config: loadConfig() });

    __jait_capture(1, (result));
    __jait_capture(2, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_2953();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_141_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_2953 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const sessionState = new SessionStateService(db);
      sessionState.set("voice-assistant", {
        "chat.providerRuntimeMode": "full-access",
        "chat.cliModels": { codex: "gpt-5.4" },
      });

      const threadService = new ThreadService(db);
      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?" },
        {
          config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
          userId: user.id,
          userService,
          sessionState,
          threadService,
          providerRegistry,
        },
      );

      __jait_capture(0, (result));
      __jait_capture(1, (threadService.list(user.id)));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_2953();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_231_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
function makeCompletingProvider() {
    return new MockVoiceThreadProvider();
  }
class HangingVoiceThreadProvider extends MockVoiceThreadProvider {
    override async sendTurn(_sessionId: string, _message: string): Promise<void> {
      // Intentionally do NOT emit assistant message or turn.completed.
    }
    override async stopSession(sessionId: string): Promise<void> {
      // Emit nothing that would resolve the waiting promise in a way that
      // re-invokes onBackgroundTaskComplete after cancellation. The cancel
      // path checks `task.cancelled` before firing the callback.
      this.emit({ type: "session.completed", sessionId });
    }
  }
function makeBaseDeps(db: any, providerRegistry: ProviderRegistry, user: any) {
    const sessionState = new SessionStateService(db);
    sessionState.set("voice-assistant", {
      "chat.providerRuntimeMode": "full-access",
      "chat.cliModels": { codex: "gpt-5.4" },
    });
    return {
      config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
      userId: user.id,
      userService: new UserService(db),
      sessionState,
      threadService: new ThreadService(db),
      providerRegistry,
    };
  }
const __jait_hook_5784 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      // Use a provider that never auto-completes so the task reliably stays
      // "running" while we assert on the immediate (non-blocking) ack.
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new HangingVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?", background: true, timeoutMs: 60_000 },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );

      // Non-blocking: returns an ack starting with the expected phrase.
      __jait_capture(0, (result.startsWith("Started a background task")));

      // The manager has exactly one running task registered.
      __jait_capture(1, (backgroundTasks.list()));
      __jait_capture(2, (backgroundTasks.list()[0].status));

      // The ack string embeds the task id.
      const taskId = backgroundTasks.list()[0].id;
      __jait_capture(3, (result), (taskId));

      // The completion callback has NOT fired yet (task still running).
      __jait_capture(4, (onBackgroundTaskComplete.mock.calls));

      // Cancel so the dangling background IIFE cleans up instead of hanging
      // until the 60s timeout.
      await backgroundTasks.cancel(taskId);
      // Give the fire-and-forget IIFE a moment to finish its finally cleanup
      // (stopSession + threadService.delete) before we close the sqlite db.
      await poll(
        () => {
          __jait_capture(5, (base.threadService.list(user.id)));
        },
        { timeout: 2000, interval: 10 },
      );
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5784();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_285_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
function makeCompletingProvider() {
    return new MockVoiceThreadProvider();
  }
class HangingVoiceThreadProvider extends MockVoiceThreadProvider {
    override async sendTurn(_sessionId: string, _message: string): Promise<void> {
      // Intentionally do NOT emit assistant message or turn.completed.
    }
    override async stopSession(sessionId: string): Promise<void> {
      // Emit nothing that would resolve the waiting promise in a way that
      // re-invokes onBackgroundTaskComplete after cancellation. The cancel
      // path checks `task.cancelled` before firing the callback.
      this.emit({ type: "session.completed", sessionId });
    }
  }
function makeBaseDeps(db: any, providerRegistry: ProviderRegistry, user: any) {
    const sessionState = new SessionStateService(db);
    sessionState.set("voice-assistant", {
      "chat.providerRuntimeMode": "full-access",
      "chat.cliModels": { codex: "gpt-5.4" },
    });
    return {
      config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
      userId: user.id,
      userService: new UserService(db),
      sessionState,
      threadService: new ThreadService(db),
      providerRegistry,
    };
  }
const __jait_hook_5784 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(makeCompletingProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?", background: true },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      __jait_capture(0, (result.startsWith("Started a background task")));

      // Wait (polling up to ~2s) for the completion callback.
      await poll(
        () => {
          __jait_capture(1, (onBackgroundTaskComplete.mock.calls));
        },
        { timeout: 2000, interval: 10 },
      );

      const completedTask = onBackgroundTaskComplete.mock.calls[0][0];
      __jait_capture(2, (completedTask.status));
      __jait_capture(3, (completedTask.result));
      __jait_captureType(4, (completedTask.cancelled));

      // The manager task is updated to completed.
      __jait_capture(5, (backgroundTasks.get(completedTask.id)?.status));
      __jait_capture(6, (backgroundTasks.get(completedTask.id)?.result));

      // Temp thread is cleaned up. Allow a short poll for the finally block
      // (stopSession + threadService.delete) to settle.
      await poll(
        () => {
          __jait_capture(7, (base.threadService.list(user.id)));
        },
        { timeout: 2000, interval: 10 },
      );
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5784();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_340_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
function makeCompletingProvider() {
    return new MockVoiceThreadProvider();
  }
class HangingVoiceThreadProvider extends MockVoiceThreadProvider {
    override async sendTurn(_sessionId: string, _message: string): Promise<void> {
      // Intentionally do NOT emit assistant message or turn.completed.
    }
    override async stopSession(sessionId: string): Promise<void> {
      // Emit nothing that would resolve the waiting promise in a way that
      // re-invokes onBackgroundTaskComplete after cancellation. The cancel
      // path checks `task.cancelled` before firing the callback.
      this.emit({ type: "session.completed", sessionId });
    }
  }
function makeBaseDeps(db: any, providerRegistry: ProviderRegistry, user: any) {
    const sessionState = new SessionStateService(db);
    sessionState.set("voice-assistant", {
      "chat.providerRuntimeMode": "full-access",
      "chat.cliModels": { codex: "gpt-5.4" },
    });
    return {
      config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
      userId: user.id,
      userService: new UserService(db),
      sessionState,
      threadService: new ThreadService(db),
      providerRegistry,
    };
  }
const __jait_hook_5784 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(makeCompletingProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      // Explicit background:false.
      const result = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?", background: false },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      __jait_capture(0, (result));
      // No background task should have been registered.
      __jait_capture(1, (backgroundTasks.list()));
      __jait_capture(2, (onBackgroundTaskComplete.mock.calls));
      // Sync path cleans up the thread immediately.
      __jait_capture(3, (base.threadService.list(user.id)));

      // Also verify the omitted case behaves the same.
      const result2 = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "What is the gateway node?" },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      __jait_capture(4, (result2));
      __jait_capture(5, (backgroundTasks.list()));
      __jait_capture(6, (onBackgroundTaskComplete.mock.calls));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5784();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_383_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
function makeCompletingProvider() {
    return new MockVoiceThreadProvider();
  }
class HangingVoiceThreadProvider extends MockVoiceThreadProvider {
    override async sendTurn(_sessionId: string, _message: string): Promise<void> {
      // Intentionally do NOT emit assistant message or turn.completed.
    }
    override async stopSession(sessionId: string): Promise<void> {
      // Emit nothing that would resolve the waiting promise in a way that
      // re-invokes onBackgroundTaskComplete after cancellation. The cancel
      // path checks `task.cancelled` before firing the callback.
      this.emit({ type: "session.completed", sessionId });
    }
  }
function makeBaseDeps(db: any, providerRegistry: ProviderRegistry, user: any) {
    const sessionState = new SessionStateService(db);
    sessionState.set("voice-assistant", {
      "chat.providerRuntimeMode": "full-access",
      "chat.cliModels": { codex: "gpt-5.4" },
    });
    return {
      config: { ...loadConfig(), host: "127.0.0.1", port: 8000 },
      userId: user.id,
      userService: new UserService(db),
      sessionState,
      threadService: new ThreadService(db),
      providerRegistry,
    };
  }
const __jait_hook_5784 = () => {
    delete process.env["JAIT_LOCATION"];
    globalThis.fetch = originalFetch;
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new HangingVoiceThreadProvider());

      const userService = new UserService(db);
      const user = userService.createUser("voice-user", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const base = makeBaseDeps(db, providerRegistry, user);
      const backgroundTasks = new BackgroundTaskManager();
      const onBackgroundTaskComplete = vi.fn();

      const ack = await executeVoiceTool(
        "ask_agent_about_request",
        { question: "Long-running research task", background: true, timeoutMs: 60_000 },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      __jait_capture(0, (ack.startsWith("Started a background task")));

      const taskId = backgroundTasks.list()[0].id;
      __jait_capture(1, (backgroundTasks.get(taskId)?.status));

      const cancelResult = await executeVoiceTool(
        "cancel_background_task",
        { taskId },
        { ...base, backgroundTasks, onBackgroundTaskComplete },
      );
      __jait_capture(2, (cancelResult));
      __jait_capture(3, (cancelResult), (taskId));
      __jait_capture(4, (backgroundTasks.get(taskId)?.status));
      __jait_capture(5, (backgroundTasks.get(taskId)?.cancelled));

      // Give the fire-and-forget background IIFE a chance to run its
      // stopSession/finally cleanup. The completion callback must NOT fire
      // because the task was cancelled before the answer arrived.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await poll(
        () => {
          __jait_capture(6, (base.threadService.list(user.id)));
        },
        { timeout: 2000, interval: 10 },
      );
      __jait_capture(7, (onBackgroundTaskComplete.mock.calls));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_5784();
}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_437_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backgroundTasks = new BackgroundTaskManager();
    const result = await executeVoiceTool(
      "list_background_tasks",
      {},
      { config: loadConfig(), backgroundTasks },
    );
    __jait_capture(0, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_447_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backgroundTasks = new BackgroundTaskManager();
    backgroundTasks.register({
      id: "voice-task-xyz",
      title: "Voice: summarize the logs",
      threadId: "t-1",
      providerId: "codex",
      status: "running",
      startedAt: Date.now(),
    });
    const result = await executeVoiceTool(
      "list_background_tasks",
      {},
      { config: loadConfig(), backgroundTasks },
    );
    __jait_capture(0, (result));
    __jait_capture(1, (result));
    __jait_capture(2, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_467_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await executeVoiceTool(
      "list_background_tasks",
      {},
      { config: loadConfig() },
    );
    __jait_capture(0, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_478_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backgroundTasks = new BackgroundTaskManager();
    const result = await executeVoiceTool(
      "cancel_background_task",
      { taskId: "does-not-exist" },
      { config: loadConfig(), backgroundTasks },
    );
    __jait_capture(0, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_488_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backgroundTasks = new BackgroundTaskManager();
    backgroundTasks.register(
      {
        id: "task-running",
        title: "Voice: do a thing",
        threadId: "t-1",
        providerId: "codex",
        status: "running",
        startedAt: Date.now(),
      },
      async () => {},
    );
    const result = await executeVoiceTool(
      "cancel_background_task",
      { taskId: "task-running" },
      { config: loadConfig(), backgroundTasks },
    );
    __jait_capture(0, (result));
    __jait_capture(1, (result));
    __jait_capture(2, (backgroundTasks.get("task-running")?.status));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_voice_assistant_tools_test_ts_511_3": {


async function poll(
  predicate: () => void,
  { timeout = 2000, interval = 10 }: { timeout?: number; interval?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      predicate();
      // No throw = predicate satisfied.
      return;
    } catch (e) {
      lastError = e;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`poll timed out after ${timeout}ms`);
}
const originalFetch = globalThis.fetch;
class MockVoiceThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private sessionCounter = 1;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `voice-session-${this.sessionCounter++}`;
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, _message: string): Promise<void> {
    this.emit({ type: "message", sessionId, role: "assistant", content: "That is the deployed gateway node." });
    this.emit({ type: "turn.completed", sessionId });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  private emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const backgroundTasks = new BackgroundTaskManager();
    backgroundTasks.register({
      id: "task-done",
      title: "Voice: done",
      threadId: "t-1",
      providerId: "codex",
      status: "completed",
      result: "done",
      startedAt: Date.now(),
    });
    const result = await executeVoiceTool(
      "cancel_background_task",
      { taskId: "task-done" },
      { config: loadConfig(), backgroundTasks },
    );
    __jait_capture(0, (result));
    __jait_capture(1, (backgroundTasks.get("task-done")?.status));
  
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
