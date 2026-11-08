// Translated fixture from packages/gateway/src/tools/thread-tools.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderId,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import type { GitStepResult } from "../../../../packages/gateway/src/services/git.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { createToolRegistry } from "../../../../packages/gateway/src/tools/index.js";
import { createThreadControlTool } from "../../../../packages/gateway/src/tools/thread-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/thread-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_133_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      const threadService = new ThreadService(db);
      threadService.savePersonaAgent(context.userId, { id: "researcher", name: "Researcher" });
      const tool = createThreadControlTool({ threadService, providerRegistry, userService, sessionState });

      const created = await tool.execute({
        action: "create", prompt: "Write a report", providerId: "codex",
        personaAgentId: "researcher", skillIds: ["research"], kind: "delivery",
      }, { ...context, requestedBy: "scheduler" });
      __jait_capture(0, (created.ok));
      const thread = (created.data as { thread: { id: string } }).thread;
      __jait_capture(1, (threadService.getById(thread.id)));

      const denied = await tool.execute({
        action: "create", prompt: "Write a report", providerId: "codex", personaAgentId: "researcher",
      }, makeContext("another-user", { providerId: "codex", requestedBy: "scheduler" }));
      __jait_capture(2, (denied.ok));
      __jait_capture(3, (denied.message));
    } finally { sqlite.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_160_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(
        db,
        "codex",
        { reasoningEffort: "high" },
      );
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Run tests",
          start: true,
          message: "bun run test",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      const data = result.data as {
        thread: { providerSessionId: string | null; reasoningEffort: string | null; status: string };
      };
      __jait_capture(2, (data.thread.providerSessionId));
      __jait_capture(3, (data.thread.reasoningEffort));
      __jait_capture(4, (data.thread.status));
      __jait_capture(5, (provider.lastStartOptions?.reasoningEffort));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_206_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "No prompt",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_236_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Prompt alias",
          start: true,
          prompt: "inspect ui",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (provider.sendTurn.mock.calls));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_271_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async (sessionId) => {
        provider.emit({ type: "token", sessionId, content: "I checked the " });
        provider.emit({ type: "token", sessionId, content: "thread state." });
        provider.emit({ type: "tool.start", sessionId, tool: "read_file", args: { path: "apps/web/src/App.tsx" }, callId: "call-1" });
        provider.emit({ type: "tool.result", sessionId, tool: "read_file", ok: true, message: "ok", callId: "call-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Token thread",
          start: true,
          prompt: "inspect ui",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { id: string } };
      const activities = threadService.getActivities(data.thread.id);
      __jait_capture(1, (activities));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_327_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => new Promise<void>(() => {}));
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Cron task",
          kind: "delivery",
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      __jait_capture(2, (provider.sendTurn.mock.calls));
      const data = result.data as { thread: { status: string; providerSessionId: string | null } };
      __jait_capture(3, (data.thread.status));
      __jait_capture(4, (data.thread.providerSessionId));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_368_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.listModels.mockRejectedValueOnce(new Error("usage limit reached"));
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Cron task",
          kind: "delivery",
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      __jait_capture(2, (result.message));
      __jait_capture(3, (threadService.list(context.userId)));
      __jait_capture(4, (provider.sendTurn.mock.calls));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_409_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Cron task",
          kind: "delivery",
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      __jait_capture(1, (data.thread.status));
      __jait_captureType(2, (data.thread.providerSessionId));
      __jait_capture(3, (provider.stopSession.mock.calls));
      __jait_capture(4, (threadService.getById(data.thread.id)?.status));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_453_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async (sessionId, prompt) => {
        if (prompt.includes("Reply with ONLY a short task title")) {
          provider.emit({ type: "message", sessionId, role: "assistant", content: "Nightly Quality Sweep" });
          provider.emit({ type: "turn.completed", sessionId });
        }
      });
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          kind: "delivery",
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (provider.sendTurn.mock.calls));
      __jait_capture(2, (provider.sendTurn.mock.calls));
      const data = result.data as { thread: { title: string } };
      __jait_capture(3, (data.thread.title));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_497_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async (sessionId, prompt) => {
        if (prompt.includes("Reply with ONLY a short task title")) {
          provider.emit({ type: "message", sessionId, role: "assistant", content: "Focused Regression Coverage" });
          provider.emit({ type: "turn.completed", sessionId });
        }
      });
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Jait code quality rotation",
          kind: "delivery",
          start: true,
          prompt: "add targeted regression coverage for thread title generation",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { title: string } };
      __jait_capture(1, (data.thread.title));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_540_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => new Promise<void>(() => {}));
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const createWorktree = vi.fn(async (_cwd: string, _baseBranch: string, newBranch: string) => ({
        path: `/tmp/jait-worktrees/${newBranch.replace(/\//g, "-")}`,
        branch: newBranch,
      }));
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "skipped_no_changes" },
            push: { status: "skipped_not_requested" },
            branch: { status: "skipped_not_requested" },
            pr: { status: "skipped_not_requested" },
          }),
          isRepo: async () => true,
          getPreferredRemote: async () => "origin",
          getRemoteUrl: async () => "git@github.com:Widev-e-U/Jait.git",
          resolveDefaultBranch: async () => "main",
          createWorktree,
        },
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Cron task",
          kind: "delivery",
          workingDirectory: process.cwd(),
          start: true,
          prompt: "run scheduled quality task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { id: string; branch: string | null; workingDirectory: string | null } };
      __jait_capture(1, (data.thread.branch));
      __jait_capture(2, (data.thread.workingDirectory), (`/tmp/jait-worktrees/${data.thread.branch!.replace(/\//g, "-")}`));
      __jait_capture(3, (createWorktree.mock.calls), ([process.cwd(),"main",data.thread.branch,undefined,{ fastPath: true }]));
      __jait_capture(4, (threadService.getById(data.thread.id)?.workingDirectory), (data.thread.workingDirectory));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_600_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "jait");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          model: "gpt-5-codex",
          title: "Cron provider override",
          kind: "delivery",
          providerId: "codex",
          start: true,
          prompt: "run scheduled task",
        },
        { ...context, requestedBy: "scheduler" },
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { providerId: string } };
      __jait_capture(1, (data.thread.providerId));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_637_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => new Promise<void>(() => {}));
      providerRegistry.register(provider);

      const projectRoot = process.cwd();
      const worktreePath = "/tmp/jait-worktrees/jait-abcdef12";
      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "skipped_no_changes" },
            push: { status: "skipped_not_requested" },
            branch: { status: "skipped_not_requested" },
            pr: { status: "skipped_not_requested" },
          }),
          isRepo: async () => true,
          getPreferredRemote: async () => "origin",
          getRemoteUrl: async () => "git@github.com:Widev-e-U/Jait.git",
          resolveDefaultBranch: async () => "main",
          createWorktree: async (_cwd: string, _baseBranch: string, newBranch: string) => ({
            path: worktreePath,
            branch: newBranch,
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Cron task",
          kind: "delivery",
          workingDirectory: projectRoot,
          start: true,
          prompt: `<system>\nProject: ${projectRoot}\n</system>\n\nWork in ${projectRoot}\nRun the code quality rotation.`,
        },
        { ...context, requestedBy: "scheduler", projectRoot },
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (provider.lastStartOptions?.workingDirectory), (worktreePath));
      const sentPrompt = provider.sendTurn.mock.calls[0]?.[1] ?? "";
      __jait_capture(2, (sentPrompt));
      __jait_capture(3, (sentPrompt), (`Use this working directory for all file reads, edits, commands, tests, commits, and relative paths: ${worktreePath}`));
      __jait_capture(4, (sentPrompt), (`Project: ${worktreePath}`));
      __jait_capture(5, (sentPrompt), (`Work in ${worktreePath}`));
      __jait_capture(6, (sentPrompt), (`Project: ${projectRoot}`));
      __jait_capture(7, (sentPrompt), (`Work in ${projectRoot}`));
      __jait_capture(8, (sentPrompt.length));

      const data = result.data as { thread: { id: string } };
      const userActivity = threadService.getActivities(data.thread.id)
        .find((activity) => activity.kind === "message");
      __jait_capture(9, (userActivity?.summary), (sentPrompt.slice(0, 500)));
      __jait_capture(10, (userActivity?.payload), ({ role: "user", content: sentPrompt }));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_710_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "One-shot delivery",
          kind: "delivery",
          start: true,
          prompt: "implement one focused fix",
          autoStopAfterTurn: true,
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      __jait_capture(1, (data.thread.status));
      __jait_captureType(2, (data.thread.providerSessionId));
      __jait_capture(3, (provider.stopSession.mock.calls));
      __jait_capture(4, (threadService.getById(data.thread.id)?.status));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_755_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "One-shot helper",
          kind: "delegation",
          start: true,
          message: "Summarize the current state",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      __jait_capture(1, (data.thread.status));
      __jait_captureType(2, (data.thread.providerSessionId));
      __jait_capture(3, (provider.stopSession.mock.calls));

      const stored = threadService.getById(data.thread.id);
      __jait_capture(4, (stored?.status));
      __jait_captureType(5, (stored?.providerSessionId));
      __jait_captureType(6, (stored?.completedAt));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_803_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      provider.sendTurn.mockImplementation(async () => {
        provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          providerId: "codex",
          model: "gpt-5-codex",
          title: "Delivery thread",
          kind: "delivery",
          start: true,
          message: "Implement the fix",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { id: string; status: string; providerSessionId: string | null } };
      __jait_capture(1, (data.thread.status));
      __jait_capture(2, (data.thread.providerSessionId));
      __jait_capture(3, (provider.stopSession.mock.calls));

      const stored = threadService.getById(data.thread.id);
      __jait_capture(4, (stored?.status));
      __jait_capture(5, (stored?.providerSessionId));
      __jait_captureType(6, (stored?.completedAt));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_851_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: context.userId,
        title: "Delivery thread",
        providerId: "codex",
      });
      threadService.update(thread.id, {
        status: "completed",
        providerSessionId: "mock-session-1",
        completedAt: "2026-04-21T00:00:00.000Z",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "send",
          threadId: thread.id,
          message: "Continue with the fix",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (provider.sendTurn.mock.calls));
      __jait_capture(2, (threadService.getById(thread.id)));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_899_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: context.userId,
        title: "Delivery thread",
        providerId: "codex",
      });
      threadService.addActivity(thread.id, "message", "Investigate the bug", {
        role: "user",
        content: "Investigate the bug",
        fullContent: "Investigate the bug",
      });
      threadService.addActivity(thread.id, "message", "The issue is stale completion state.", {
        role: "assistant",
        content: "The issue is stale completion state.",
      });
      threadService.update(thread.id, {
        status: "completed",
        providerSessionId: null,
        completedAt: "2026-04-21T00:00:00.000Z",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "start",
          model: "gpt-5-codex",
          threadId: thread.id,
          message: "Apply the fix",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const sentMessage = provider.sendTurn.mock.calls[0]?.[1];
      __jait_capture(1, (sentMessage));
      __jait_capture(2, (sentMessage));
      __jait_capture(3, (sentMessage));
      __jait_capture(4, (sentMessage));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_957_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // User settings, session cliModels and the caller context all say codex.
      // None of that may be inherited: the user has to name the provider.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected provider",
          start: true,
          message: "inspect ui",
        },
        { ...context, providerId: "codex", model: "gpt-5-codex" },
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, ((result as { message: string }).message));
      __jait_captureType(2, (result.data));
      __jait_captureType(3, (provider.lastStartOptions));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_999_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      const jaitProvider = new MockThreadProvider("jait");
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(jaitProvider);

      const threadService = new ThreadService(db);
      // The thread was created by a user who explicitly chose jait + this model.
      const thread = threadService.create({
        userId: context.userId,
        title: "Jait worker driven from Codex",
        providerId: "jait",
        model: "deepseek-v4.1-flash:cloud",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          message: "Run the delegated worker",
        },
        { ...context, providerId: "codex", model: "gpt-5-codex" },
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { providerId: string; model: string | null } };
      __jait_capture(1, (data.thread.providerId));
      __jait_capture(2, (data.thread.model));
      __jait_capture(3, (jaitProvider.sendTurn.mock.calls));
      // The caller's codex model must not leak into the jait thread.
      __jait_capture(4, (jaitProvider.lastStartOptions?.model));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1048_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // The jait chat, its user settings and its session state all carry a model.
      // None of it may be used for the codex thread: the loop never picks a model.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "jait", {
        model: "jait-default",
      });
      const providerRegistry = new ProviderRegistry();
      const codexProvider = new MockThreadProvider("codex");
      providerRegistry.register(new MockThreadProvider("jait"));
      providerRegistry.register(codexProvider);

      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: context.userId,
        title: "Codex worker driven from Jait",
        providerId: "codex",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const refused = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          message: "Run the delegated worker",
        },
        { ...context, providerId: "jait", model: "jait-default" },
      );

      __jait_capture(0, (refused.ok));
      __jait_capture(1, ((refused as { message: string }).message));
      __jait_captureType(2, (codexProvider.lastStartOptions));
      __jait_captureType(3, (threadService.getById(thread.id)?.model));

      // The explicit model the caller passes is persisted before the thread starts.
      const started = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          model: "gpt-5-codex",
          message: "Run the delegated worker",
        },
        { ...context, providerId: "jait", model: "jait-default" },
      );

      __jait_capture(4, (started.ok));
      const data = started.data as { thread: { providerId: string; model: string | null } };
      __jait_capture(5, (data.thread.providerId));
      __jait_capture(6, (data.thread.model));
      __jait_capture(7, (threadService.getById(thread.id)?.model));
      __jait_capture(8, (codexProvider.sendTurn.mock.calls));
      // The jait chat's model never reaches the codex thread.
      __jait_capture(9, (codexProvider.lastStartOptions?.model));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1114_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // The calling chat runs codex with gpt-5-codex. The thread stores
      // gpt-5-mini because that is what the user explicitly picked for it.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: context.userId,
        title: "Same-provider thread",
        providerId: "codex",
        model: "gpt-5-mini",
      });

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          message: "Continue here",
        },
        { ...context, providerId: "codex", model: "gpt-5-codex" },
      );

      __jait_capture(0, (result.ok));
      // The caller's "gpt-5-codex" must not leak in: only the model explicitly
      // chosen for the thread may run it.
      __jait_capture(1, (provider.lastStartOptions?.model));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1160_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // User settings and session cliModels both select codex + gpt-5-codex.
      // Neither may be used to create or start a thread.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const noProvider = await tool.execute(
        {
          action: "create",
          title: "Use selected model",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      __jait_capture(0, (noProvider.ok));
      __jait_capture(1, ((noProvider as { message: string }).message));

      const noModel = await tool.execute(
        {
          action: "create",
          title: "Use selected model",
          providerId: "codex",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      __jait_capture(2, (noModel.ok));
      __jait_capture(3, ((noModel as { message: string }).message));
      __jait_captureType(4, (provider.lastStartOptions));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1214_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // User settings and session state both point at codex + gpt-5-codex.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      const jaitProvider = new MockThreadProvider("jait");
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(jaitProvider);

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected jait provider",
          providerId: "jait",
          model: "deepseek-v4.1-flash:cloud",
          start: true,
          message: "inspect ui",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as {
        thread: { providerId: string; model: string | null; providerSessionId: string | null };
      };
      __jait_capture(1, (data.thread.providerId));
      __jait_capture(2, (data.thread.model));
      __jait_capture(3, (data.thread.providerSessionId));
      __jait_capture(4, (jaitProvider.lastStartOptions?.model));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1259_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // gpt-4.1 sits in user settings and session state; it must not be stored.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "jait", {
        model: "gpt-4.1",
      });
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("jait");
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected jait model",
          providerId: "jait",
          start: false,
          message: "inspect ui",
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { thread: { providerId: string; model: string | null } };
      __jait_capture(1, (data.thread.providerId));
      // The model selected in user settings/session state is ignored.
      __jait_captureType(2, (data.thread.model));
      __jait_captureType(3, (provider.lastStartOptions));
      __jait_captureType(4, (threadService.getById((result.data as { thread: { id: string } }).thread.id)?.model));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1304_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Missing provider",
          prompt: "inspect ui",
        },
        makeContext(),
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      __jait_captureType(2, (result.data));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1335_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "create",
          title: "Use live codex context",
          providerId: "jait",
          model: "deepseek-v4.1-flash:cloud",
          prompt: "inspect ui",
        },
        makeContext("user-1", {
          providerId: "codex",
          model: "gpt-5-codex",
          runtimeMode: "supervised",
        }),
      );

      __jait_capture(0, (result.ok));
      const data = result.data as {
        thread: { providerId: string; model: string | null; runtimeMode: string };
      };
      // The live caller context said codex / gpt-5-codex; it is ignored.
      __jait_capture(1, (data.thread.providerId));
      __jait_capture(2, (data.thread.model));
      // Runtime mode is still resolved from context (unchanged behavior).
      __jait_capture(3, (data.thread.runtimeMode));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1377_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("thread-owner", "password");
      userService.updateSettings(user.id, { chatProvider: "codex" });

      const sessionState = new SessionStateService(db);
      sessionState.set("s-thread-tools", {
        "chat.providerRuntimeMode": "supervised",
        "chat.cliModels": { codex: "gpt-5-codex" },
      });

      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      // Nothing explicitly chosen: user settings and session state alone are
      // not a user decision, so the call is refused.
      const refused = await tool.execute(
        {
          action: "create",
          title: "Use selected chat defaults",
          prompt: "inspect ui",
        },
        makeContext(user.id),
      );

      __jait_capture(0, (refused.ok));
      __jait_capture(1, ((refused as { message: string }).message));

      const result = await tool.execute(
        {
          action: "create",
          title: "Use selected chat defaults",
          providerId: "jait",
          model: "deepseek-v4.1-flash:cloud",
          prompt: "inspect ui",
        },
        makeContext(user.id),
      );

      __jait_capture(2, (result.ok));
      const data = result.data as {
        thread: { providerId: string; model: string | null; runtimeMode: string };
      };
      // User settings said codex and the session said codex/gpt-5-codex: ignored.
      __jait_capture(3, (data.thread.providerId));
      __jait_capture(4, (data.thread.model));
      // Runtime mode still comes from session state (unchanged behavior).
      __jait_capture(5, (data.thread.runtimeMode));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1441_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Restart with selected provider",
        providerId: "codex",
      });

      const providerRegistry = new ProviderRegistry();
      const codexProvider = new MockThreadProvider("codex");
      providerRegistry.register(codexProvider);
      providerRegistry.register(new MockThreadProvider("jait"));

      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
      });

      const refused = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          message: "inspect ui",
        },
        makeContext("user-1"),
      );

      __jait_capture(0, (refused.ok));
      __jait_capture(1, ((refused as { message: string }).message));
      __jait_captureType(2, (codexProvider.lastStartOptions));

      const result = await tool.execute(
        {
          action: "start",
          threadId: thread.id,
          model: "gpt-5-codex",
          message: "inspect ui",
        },
        makeContext("user-1"),
      );

      __jait_capture(3, (result.ok));
      const data = result.data as {
        thread: { providerId: string; model: string | null; providerSessionId: string | null };
      };
      // The stored provider is kept; only the model had to be supplied.
      __jait_capture(4, (data.thread.providerId));
      __jait_capture(5, (data.thread.model));
      __jait_capture(6, (data.thread.providerSessionId));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1498_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));
      providerRegistry.register(new MockThreadProvider("claude-code"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "skipped_no_changes" },
            push: { status: "skipped_not_requested" },
            branch: { status: "skipped_not_requested" },
            pr: { status: "skipped_not_requested" },
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create_many",
          providerId: "codex",
          model: "gpt-5-codex",
          prompt: "inspect ui",
          threads: [
            { title: "Thread A" },
            { title: "Thread B" },
          ],
        },
        context,
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { threads: Array<{ title: string; providerId: string }> };
      __jait_capture(1, (data.threads));
      __jait_capture(2, (data.threads.map((t) => t.title)));
      __jait_capture(3, (data.threads.map((t) => t.title)));
      __jait_capture(4, (data.threads.every((thread) => thread.providerId === "codex")));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1547_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex");
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      let sessionCount = 0;
      provider.startSession = async (options: StartSessionOptions): Promise<ProviderSession> => {
        provider.lastStartOptions = options;
        sessionCount += 1;
        const sessionId = `mock-session-${sessionCount}`;
        provider.emit({ type: "session.started", sessionId });
        return {
          id: sessionId,
          providerId: provider.id,
          threadId: options.threadId,
          status: "running",
          runtimeMode: options.mode,
          startedAt: new Date().toISOString(),
        };
      };
      provider.sendTurn.mockImplementation(async (sessionId: string) => {
        setTimeout(() => {
          provider.emit({
            type: "message",
            sessionId,
            role: "assistant",
            content: `Specialist ${sessionId} finished with findings.`,
          });
          provider.emit({ type: "turn.completed", sessionId });
        }, 25);
      });
      providerRegistry.register(provider);

      const threadService = new ThreadService(db);
      const outputChunks: string[] = [];
      const tool = createThreadControlTool({
        threadService,
        providerRegistry,
        userService,
        sessionState,
      });

      const result = await tool.execute(
        {
          action: "create_many",
          providerId: "codex",
          model: "gpt-5-codex",
          prompt: "inspect ui",
          start: true,
          threads: [
            { title: "Thread A" },
            { title: "Thread B" },
          ],
        },
        { ...context, onOutputChunk: (chunk) => outputChunks.push(chunk) },
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      __jait_capture(2, (result.message));
      __jait_capture(3, (result.message));
      __jait_capture(4, (outputChunks.join("")));
      const data = result.data as {
        threads: Array<{ status: string; completedAt: string | null }>;
        threadSummaries: Array<{ finalMessage: string | null; assistantMessages: string[] }>;
      };
      __jait_capture(5, (data.threads));
      __jait_capture(6, (data.threads.every((thread) => thread.status === "completed")));
      __jait_capture(7, (data.threads.every((thread) => Boolean(thread.completedAt))));
      __jait_capture(8, (data.threadSummaries));
      __jait_capture(9, (data.threadSummaries.map((summary) => summary.finalMessage)));
      __jait_capture(10, (data.threadSummaries.every((summary) => summary.assistantMessages.length === 1)));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1629_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      // The selected provider/model live in user settings and session state,
      // but a bulk create still needs an explicit choice from the caller.
      const { userService, sessionState, context } = createSelectedProviderContext(db, "codex", {
        model: "gpt-5-codex",
      });
      const providerRegistry = new ProviderRegistry();
      const codexProvider = new MockThreadProvider("codex");
      providerRegistry.register(codexProvider);
      providerRegistry.register(new MockThreadProvider("claude-code"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
        userService,
        sessionState,
      });

      const noProvider = await tool.execute(
        {
          action: "create_many",
          prompt: "inspect ui",
          threads: [{ title: "Thread A" }, { title: "Thread B" }],
        },
        context,
      );

      __jait_capture(0, (noProvider.ok));
      __jait_capture(1, ((noProvider as { message: string }).message));
      __jait_captureType(2, (noProvider.data));

      const noModel = await tool.execute(
        {
          action: "create_many",
          providerId: "codex",
          prompt: "inspect ui",
          threads: [{ title: "Thread A" }, { title: "Thread B" }],
        },
        context,
      );

      __jait_capture(3, (noModel.ok));
      __jait_capture(4, ((noModel as { message: string }).message));
      __jait_captureType(5, (noModel.data));
      // Nothing was created, so nothing could start a turn.
      __jait_captureType(6, (codexProvider.lastStartOptions));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1683_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const result = await tool.execute(
        {
          action: "create_many",
          providerId: "codex",
          model: "gpt-5-mini",
          prompt: "inspect ui",
          threads: [{ title: "Thread A" }, { title: "Thread B" }],
        },
        makeContext("user-1", {
          providerId: "codex",
          model: "gpt-5-codex",
          runtimeMode: "supervised",
        }),
      );

      __jait_capture(0, (result.ok));
      const data = result.data as {
        threads: Array<{ providerId: string; model: string | null; runtimeMode: string }>;
      };
      __jait_capture(1, (data.threads));
      __jait_capture(2, (data.threads.every((thread) => thread.providerId === "codex")));
      // The caller context said "gpt-5-codex"; the explicit "gpt-5-mini" wins.
      __jait_capture(3, (data.threads.every((thread) => thread.model === "gpt-5-mini")));
      // Runtime mode still follows the caller context (unchanged behavior).
      __jait_capture(4, (data.threads.every((thread) => thread.runtimeMode === "supervised")));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1725_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry,
      });

      const projectRoot = process.cwd();
      const result = await tool.execute(
        {
          action: "create_many",
          providerId: "codex",
          model: "gpt-5-codex",
          prompt: "inspect ui",
          threads: [
            { title: "Thread A" },
            { title: "Thread B" },
          ],
        },
        makeContext("user-1", {
          providerId: "codex",
        }),
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { threads: Array<{ workingDirectory: string | null }> };
      __jait_capture(1, (data.threads));
      __jait_capture(2, (data.threads.every((thread) => thread.workingDirectory === projectRoot)));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1763_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Implement feature",
        providerId: "codex",
        workingDirectory: process.cwd(),
      });
      threadService.markCompleted(thread.id);

      const prUrl = "https://github.com/acme/repo/pull/42";
      const tool = createThreadControlTool({
        threadService,
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "created", commitSha: "abc123", subject: "feat: implement feature" },
            push: { status: "pushed", branch: "feature/awesome" },
            branch: { status: "skipped_not_requested" },
            pr: {
              status: "created",
              url: prUrl,
              number: 42,
              baseBranch: "main",
              headBranch: "feature/awesome",
              title: "feat: implement feature",
            },
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create_pr",
          threadId: thread.id,
          commitMessage: "feat: implement feature",
          baseBranch: "main",
        },
        makeContext(),
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message), (prUrl));
      const data = result.data as { prUrl: string | null };
      __jait_capture(2, (data.prUrl), (prUrl));

      const updated = threadService.getById(thread.id);
      __jait_capture(3, (updated?.prUrl), (prUrl));
      __jait_capture(4, (updated?.prNumber));
      __jait_capture(5, (updated?.prTitle));
      __jait_capture(6, (updated?.prState));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1822_3_each0": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const gitAction = "commit";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({ userId: "user-1", title: "Deliver fix", providerId: "jait", workingDirectory: process.cwd() });
      threadService.markRunning(thread.id, "provider-session");
      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "fix: deliver" },
        push: { status: "pushed", branch: "fix/deliver" },
        branch: { status: "skipped_not_requested" },
        pr: { status: "skipped_not_requested" },
      }));
      const tool = createThreadControlTool({ threadService, providerRegistry: new ProviderRegistry(), gitService: { runStackedAction } });
      const result = await tool.execute({ action: "create_pr", threadId: thread.id, gitAction }, { ...makeContext(), threadId: thread.id, sessionId: thread.id });
      __jait_capture(0, (result.ok));
      __jait_capture(1, (runStackedAction.mock.calls));
      __jait_capture(2, (threadService.getById(thread.id)?.status));
      __jait_captureType(3, (threadService.getById(thread.id)?.completedAt));
    } finally { sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1822_3_each1": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const gitAction = "commit_push";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({ userId: "user-1", title: "Deliver fix", providerId: "jait", workingDirectory: process.cwd() });
      threadService.markRunning(thread.id, "provider-session");
      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "fix: deliver" },
        push: { status: "pushed", branch: "fix/deliver" },
        branch: { status: "skipped_not_requested" },
        pr: { status: "skipped_not_requested" },
      }));
      const tool = createThreadControlTool({ threadService, providerRegistry: new ProviderRegistry(), gitService: { runStackedAction } });
      const result = await tool.execute({ action: "create_pr", threadId: thread.id, gitAction }, { ...makeContext(), threadId: thread.id, sessionId: thread.id });
      __jait_capture(0, (result.ok));
      __jait_capture(1, (runStackedAction.mock.calls));
      __jait_capture(2, (threadService.getById(thread.id)?.status));
      __jait_captureType(3, (threadService.getById(thread.id)?.completedAt));
    } finally { sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1822_3_each2": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const gitAction = "commit_push_pr";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({ userId: "user-1", title: "Deliver fix", providerId: "jait", workingDirectory: process.cwd() });
      threadService.markRunning(thread.id, "provider-session");
      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "fix: deliver" },
        push: { status: "pushed", branch: "fix/deliver" },
        branch: { status: "skipped_not_requested" },
        pr: { status: "skipped_not_requested" },
      }));
      const tool = createThreadControlTool({ threadService, providerRegistry: new ProviderRegistry(), gitService: { runStackedAction } });
      const result = await tool.execute({ action: "create_pr", threadId: thread.id, gitAction }, { ...makeContext(), threadId: thread.id, sessionId: thread.id });
      __jait_capture(0, (result.ok));
      __jait_capture(1, (runStackedAction.mock.calls));
      __jait_capture(2, (threadService.getById(thread.id)?.status));
      __jait_captureType(3, (threadService.getById(thread.id)?.completedAt));
    } finally { sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1844_3_each0": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const connected = true;

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({ userId: "user-1", personaAgentId: "agent-1", title: "Deliver fix", providerId: "jait", workingDirectory: process.cwd() });
      threadService.markRunning(thread.id, "provider-session");
      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "fix: deliver" },
        push: { status: "pushed", branch: "fix/deliver" },
        branch: { status: "skipped_not_requested" }, pr: { status: "skipped_not_requested" },
      }));
      const mintInstallationToken = vi.fn(async () => ({ token: "fixture-app-token", expiresAt: "", permissions: null, repositorySelection: null }));
      const tool = createThreadControlTool({
        threadService, providerRegistry: new ProviderRegistry(), gitService: { runStackedAction },
        ...(connected ? { agentGithubAppService: { mintInstallationToken } } : {}),
      });
      const result = await tool.execute({ action: "create_pr", threadId: thread.id, gitAction: "commit_push" }, { ...makeContext(), threadId: thread.id, sessionId: thread.id });
      __jait_capture(0, (result.ok));
      if (connected) {
        __jait_capture(1, (mintInstallationToken.mock.calls));
        __jait_capture(2, (runStackedAction.mock.calls), ([process.cwd(),"commit_push",undefined,false,undefined,"fixture-app-token"]));
        __jait_capture(3, (JSON.stringify(result)));
      } else __jait_capture(4, (runStackedAction.mock.calls));
    } finally { sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1844_3_each1": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const connected = false;

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({ userId: "user-1", personaAgentId: "agent-1", title: "Deliver fix", providerId: "jait", workingDirectory: process.cwd() });
      threadService.markRunning(thread.id, "provider-session");
      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "fix: deliver" },
        push: { status: "pushed", branch: "fix/deliver" },
        branch: { status: "skipped_not_requested" }, pr: { status: "skipped_not_requested" },
      }));
      const mintInstallationToken = vi.fn(async () => ({ token: "fixture-app-token", expiresAt: "", permissions: null, repositorySelection: null }));
      const tool = createThreadControlTool({
        threadService, providerRegistry: new ProviderRegistry(), gitService: { runStackedAction },
        ...(connected ? { agentGithubAppService: { mintInstallationToken } } : {}),
      });
      const result = await tool.execute({ action: "create_pr", threadId: thread.id, gitAction: "commit_push" }, { ...makeContext(), threadId: thread.id, sessionId: thread.id });
      __jait_capture(0, (result.ok));
      if (connected) {
        __jait_capture(1, (mintInstallationToken.mock.calls));
        __jait_capture(2, (runStackedAction.mock.calls), ([process.cwd(),"commit_push",undefined,false,undefined,"fixture-app-token"]));
        __jait_capture(3, (JSON.stringify(result)));
      } else __jait_capture(4, (runStackedAction.mock.calls));
    } finally { sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1871_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Implement feature",
        providerId: "codex",
        workingDirectory: process.cwd(),
      });

      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "feat: implement feature" },
        push: { status: "pushed", branch: "feature/awesome" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "created",
          url: "https://github.com/acme/repo/pull/42",
          number: 42,
          baseBranch: "main",
          headBranch: "feature/awesome",
          title: "feat: implement feature",
        },
      }));

      const tool = createThreadControlTool({
        threadService,
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction,
        },
      });

      const result = await tool.execute(
        {
          action: "create_pr",
          threadId: thread.id,
          commitMessage: "feat: implement feature",
          baseBranch: "main",
        },
        makeContext(),
      );

      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message));
      __jait_capture(2, (runStackedAction.mock.calls));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_thread_tools_test_ts_1923_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  lastStartOptions: StartSessionOptions | null = null;
  readonly stopSession = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });
  readonly listModels = vi.fn(async () => []);

  constructor(readonly id: "jait" | "codex" | "claude-code" = "jait") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    const sessionId = "mock-session-1";
    this.emitter.emit("event", { type: "session.started", sessionId } satisfies ProviderEvent);
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(
  userId = "user-1",
  overrides: Partial<{
    providerId: ProviderId;
    model: string;
    runtimeMode: "full-access" | "supervised";
    requestedBy: string;
  }> = {},
) {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    projectRoot: process.cwd(),
    requestedBy: overrides.requestedBy ?? "test",
    userId,
    providerId: overrides.providerId,
    model: overrides.model,
    runtimeMode: overrides.runtimeMode,
  };
}
function createSelectedProviderContext(
  db: Awaited<ReturnType<typeof openDatabase>>["db"],
  providerId: "jait" | "codex" | "claude-code",
  options: { model?: string; reasoningEffort?: string; runtimeMode?: "full-access" | "supervised" } = {},
) {
  const userService = new UserService(db);
  const user = userService.createUser(`user-${providerId}-${Math.random()}`, "password");
  userService.updateSettings(user.id, { chatProvider: providerId });

  const sessionState = new SessionStateService(db);
  const state: Record<string, unknown> = {};
  if (options.runtimeMode) {
    state["chat.providerRuntimeMode"] = options.runtimeMode;
  }
  if (options.model) {
    state["chat.cliModels"] = { [providerId]: options.model };
  }
  if (options.reasoningEffort) {
    state["chat.reasoningEffort"] = options.reasoningEffort;
  }
  if (Object.keys(state).length > 0) {
    sessionState.set("s-thread-tools", state);
  }

  return {
    userService,
    sessionState,
    context: makeContext(user.id),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const tools = createToolRegistry(new SurfaceRegistry(), {
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
      });
      __jait_capture(0, (tools.listNames()));
    } finally {
      sqlite.close();
    }
  
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
