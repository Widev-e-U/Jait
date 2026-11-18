// Translated fixture from packages/gateway/src/routes/agent-control.test.ts; expected literals are in tail_static.rs.

import { createThreadControlTool } from "../../../../packages/gateway/src/tools/thread-tools.js";
import type { CliProviderAdapter, ProviderInfo, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/agent-control.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_87_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    __jait_capture(0, ((await app!.inject({ method: "GET", url: "/api/agent-control" })).statusCode));
    __jait_capture(1, ((await app!.inject({ method: "POST", url: "/api/agent-control/halt" })).statusCode));
    __jait_capture(2, ((await app!.inject({ method: "POST", url: "/api/agent-control/resume" })).statusCode));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_93_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    const halted = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers, payload: { reason: "runaway cost" } });
    __jait_capture(0, (halted.statusCode));
    __jait_capture(1, (halted.json()));
    __jait_capture(2, (typeof halted.json().stopped));

    // The emergency stop must remain observable while frozen.
    const read = await app!.inject({ method: "GET", url: "/api/agent-control", headers });
    __jait_capture(3, (read.statusCode));
    __jait_capture(4, (read.json()));

    // Dispatch routes refuse, and the refusal says why.
    const blocked = await app!.inject({ method: "POST", url: "/api/threads", headers, payload: { title: "Should not start" } });
    __jait_capture(5, (blocked.statusCode));
    __jait_capture(6, (blocked.json()));

    const resumed = await app!.inject({ method: "POST", url: "/api/agent-control/resume", headers });
    __jait_capture(7, (resumed.statusCode));
    __jait_capture(8, (resumed.json()));

    // Resume is the only path that clears the halt; work is no longer refused.
    const afterResume = await app!.inject({ method: "POST", url: "/api/threads", headers, payload: { title: "Now allowed", providerId: "codex" } });
    __jait_capture(9, (afterResume.statusCode));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_118_3_each0": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
/*__jait_scope_open__*/{
const phase = "availability";
await __jait_hook_2365();
try {
await (async()=>{

    const thread = threadService.create({ userId, title: "Delayed startup", providerId: "codex", workingDirectory: process.cwd() });
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    if (phase === "availability") {
      provider.checkAvailability.mockImplementationOnce(async () => { entered(); await gate; return true; });
    } else {
      provider.startSession.mockImplementationOnce(async options => {
        entered(); await gate;
        return { id: "delayed-session", providerId: provider.id, threadId: options.threadId, status: "ready" } as ProviderSession;
      });
    }
    const starting = app!.inject({ method: "POST", url: "/api/threads/" + thread.id + "/start", headers, payload: { message: "Must stay stopped" } });
    await enteredPromise;
    const halt = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    __jait_capture(0, (halt.json().state.halted));
    release();
    const response = await starting;
    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json().code));
    __jait_capture(3, (provider.sendTurn.mock.calls));
    if (phase === "startup") __jait_capture(4, (provider.stopSession.mock.calls));
    else __jait_capture(5, (provider.startSession.mock.calls));
    __jait_capture(6, (threadService.getById(thread.id)?.status));
  
})();

} finally {
await __jait_hook_3518();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_118_3_each1": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
/*__jait_scope_open__*/{
const phase = "startup";
await __jait_hook_2365();
try {
await (async()=>{

    const thread = threadService.create({ userId, title: "Delayed startup", providerId: "codex", workingDirectory: process.cwd() });
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    if (phase === "availability") {
      provider.checkAvailability.mockImplementationOnce(async () => { entered(); await gate; return true; });
    } else {
      provider.startSession.mockImplementationOnce(async options => {
        entered(); await gate;
        return { id: "delayed-session", providerId: provider.id, threadId: options.threadId, status: "ready" } as ProviderSession;
      });
    }
    const starting = app!.inject({ method: "POST", url: "/api/threads/" + thread.id + "/start", headers, payload: { message: "Must stay stopped" } });
    await enteredPromise;
    const halt = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    __jait_capture(0, (halt.json().state.halted));
    release();
    const response = await starting;
    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json().code));
    __jait_capture(3, (provider.sendTurn.mock.calls));
    if (phase === "startup") __jait_capture(4, (provider.stopSession.mock.calls));
    else __jait_capture(5, (provider.startSession.mock.calls));
    __jait_capture(6, (threadService.getById(thread.id)?.status));
  
})();

} finally {
await __jait_hook_3518();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_146_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    const first = threadService.create({ userId, title: "Refuses stop", providerId: "codex" });
    const second = threadService.create({ userId, title: "Stops normally", providerId: "codex" });
    threadService.markRunning(first.id, "refuses-stop");
    threadService.markRunning(second.id, "stops-normally");
    provider.stopSession.mockImplementation(async sessionId => {
      if (sessionId === "refuses-stop") throw new Error("Node disconnected");
    });
    const halt = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    __jait_capture(0, (halt.json()));
    __jait_capture(1, (halt.json().stopError), (first.id));
    __jait_capture(2, (halt.json().stopError));
    __jait_capture(3, (threadService.getById(second.id)?.status));
    __jait_capture(4, (threadService.getById(first.id)?.status));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_162_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    const tool = createThreadControlTool({ threadService, providerRegistry });
    const result = await tool.execute({ action: "create", prompt: "Scheduled task", providerId: "codex", detach: true }, {
      userId, sessionId: "schedule-context", requestedBy: "scheduler", actionId: "halted-schedule", projectRoot: process.cwd(),
    });
    __jait_capture(0, (result));
    __jait_capture(1, (threadService.list(userId)));
    __jait_capture(2, (provider.startSession.mock.calls));
    __jait_capture(3, ((await tool.execute({ action: "list" }, { userId, sessionId: "schedule-context", requestedBy: "mcp-client", actionId: "halted-read", projectRoot: process.cwd() })).ok));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_174_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    const session = sessionService.create({ userId });
    const profile = personaAgentProfileSchema.parse({ id: "halted-chat-agent", name: "Helper", avatar: "Nova", providerId: "codex", persona: "Help the owner", chatSessionId: session.id,
      repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
      schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [] });
    threadService.savePersonaAgent(userId, profile);
    await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    const response = await app!.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "Continue", personaAgentId: profile.id } });
    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json().code));
    __jait_capture(2, (provider.sendTurn.mock.calls));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_187_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    const session = sessionService.create({ userId });
    const profile = personaAgentProfileSchema.parse({ id: "running-chat-agent", name: "Helper", avatar: "Nova", providerId: "codex", persona: "Help the owner", chatSessionId: session.id,
      repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
      schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [] });
    threadService.savePersonaAgent(userId, profile);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    provider.sendTurn.mockImplementationOnce(async () => { entered(); await gate; });
    const turn = app!.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "Work", personaAgentId: profile.id } });
    await started;
    const response = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    release();
    await turn;
    __jait_capture(0, (response.json()));
    __jait_capture(1, (provider.stopSession.mock.calls));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_agent_control_test_ts_207_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let headers: { authorization: string };
let sessionService: SessionService;
let threadService: ThreadService;
let providerRegistry: ProviderRegistry;
let provider: MockProvider;
let userId: string;
const __jait_hook_2365 = async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  };
const __jait_hook_3518 = async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  };
await __jait_hook_2365();
try {
await (async()=>{

    const bad = await app!.inject({
      method: "POST",
      url: "/api/agent-control/halt",
      headers,
      payload: { reason: "x".repeat(501) },
    });
    __jait_capture(0, (bad.statusCode));
    const read = await app!.inject({ method: "GET", url: "/api/agent-control", headers });
    __jait_capture(1, (read.json()));
  
})();

} finally {
await __jait_hook_3518();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
