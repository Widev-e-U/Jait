// Translated fixture from packages/gateway/src/tools/project-message-tool.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { createProjectMessageTool } from "../../../../packages/gateway/src/tools/project-message-tool.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/project-message-tool.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_project_message_tool_test_ts_89_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  private emitter = new EventEmitter();
  lastStartOptions: StartSessionOptions | null = null;
  sendTurnCalls: Array<{ sessionId: string; message: string }> = [];

  constructor(readonly id: "jait" | "codex" | "claude-code" = "codex") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

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

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sendTurnCalls.push({ sessionId, message });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "originating-session",
    actionId: "action-1",
    projectRoot: "/tmp/originating-project",
    requestedBy: "test",
    userId,
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user", "password");
      const projectService = new ProjectService(db);
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const providerRegistry = new ProviderRegistry();
      const provider = new MockThreadProvider("codex");
      providerRegistry.register(provider);
      const broadcastToUser = vi.fn();
      const ws = { broadcastAll: vi.fn(), broadcastToUser } as unknown as WsControlPlane;

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
        ws,
      });

      const result = await tool.execute(
        {
          projectRoot: "/tmp/other-project",
          message: "The nightly build failed — please investigate.",
          providerId: "codex",
          model: "gpt-5-codex",
        },
        makeContext(user.id),
      );

      __jait_capture(0, (result.ok));
      const data = result.data as {
        project: { id: string; rootPath: string | null };
        session: { id: string; projectId: string | null };
      };
      __jait_capture(1, (data.project.rootPath));
      __jait_capture(2, (data.session.projectId), (data.project.id));
      __jait_capture(3, (broadcastToUser.mock.calls.map(([, event]) => event.type)));
      __jait_capture(4, (broadcastToUser.mock.calls), ([user.id,data.project.id]));
      __jait_capture(5, (broadcastToUser.mock.calls), ([user.id,data.project.id,data.session.id]));

      // The message actually reached the provider as a turn.
      __jait_capture(6, (provider.sendTurnCalls));
      __jait_capture(7, (provider.sendTurnCalls[0]?.message));

      // A real thread was created in the target project's working directory.
      const threads = threadService.listBySession(data.session.id);
      __jait_capture(8, (threads));
      __jait_capture(9, (threads[0]?.workingDirectory));
      __jait_capture(10, (threads[0]?.status));

      // Re-using the same project root resolves the same project (no duplicate).
      const projects = projectService.list(undefined, user.id);
      __jait_capture(11, (projects.filter((p) => p.rootPath === "/tmp/other-project")));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_message_tool_test_ts_159_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  private emitter = new EventEmitter();
  lastStartOptions: StartSessionOptions | null = null;
  sendTurnCalls: Array<{ sessionId: string; message: string }> = [];

  constructor(readonly id: "jait" | "codex" | "claude-code" = "codex") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

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

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sendTurnCalls.push({ sessionId, message });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "originating-session",
    actionId: "action-1",
    projectRoot: "/tmp/originating-project",
    requestedBy: "test",
    userId,
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-2", "password");
      const projectService = new ProjectService(db);
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const providerRegistry = new ProviderRegistry();
      providerRegistry.register(new MockThreadProvider("codex"));

      const existingProject = projectService.create({
        userId: user.id,
        title: "Existing Project",
        rootPath: "/tmp/existing-project",
        nodeId: "gateway",
      });

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
      });

      const result = await tool.execute(
        {
          projectId: existingProject.id,
          message: "Please check the flaky test.",
          providerId: "codex",
          model: "gpt-5-codex",
        },
        makeContext(user.id),
      );

      __jait_capture(0, (result.ok));
      const data = result.data as { project: { id: string } };
      __jait_capture(1, (data.project.id), (existingProject.id));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_message_tool_test_ts_204_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  private emitter = new EventEmitter();
  lastStartOptions: StartSessionOptions | null = null;
  sendTurnCalls: Array<{ sessionId: string; message: string }> = [];

  constructor(readonly id: "jait" | "codex" | "claude-code" = "codex") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

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

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sendTurnCalls.push({ sessionId, message });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "originating-session",
    actionId: "action-1",
    projectRoot: "/tmp/originating-project",
    requestedBy: "test",
    userId,
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-live", "password");
      const projectService = new ProjectService(db);
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const providerRegistry = new ProviderRegistry();
      // thread.control resumes on the provider+model recorded on this chat,
      // which the user picked; nothing here is chosen automatically.
      const provider = new MockThreadProvider("jait");
      providerRegistry.register(provider);
      const broadcastToUser = vi.fn();
      const ws = { broadcastAll: vi.fn(), broadcastToUser } as unknown as WsControlPlane;

      // The chat the caller is currently in — NOT part of any project yet.
      const currentChat = sessionService.create({ userId: user.id, name: "My Chat" });
      new SessionStateService(db).set(currentChat.id, {
        "chat.provider": "jait",
        "chat.cliModels": { jait: "llama3" },
      });

      const existingProject = projectService.create({
        userId: user.id,
        title: "Target Project",
        rootPath: "/tmp/target-project",
        nodeId: "gateway",
      });

      const tool = createProjectMessageTool({
        projectService,
        sessionService,
        threadService,
        providerRegistry,
        userService,
        sessionState: new SessionStateService(db),
        ws,
      });

      const result = await tool.execute(
        { projectId: existingProject.id, message: "Look into the failing deploy." },
        makeContext(user.id, { sessionId: currentChat.id }),
      );

      __jait_capture(0, (result.ok));
      const data = result.data as {
        project: { id: string };
        session: { id: string; projectId: string | null };
        assigned: boolean;
      };

      // The SAME chat is used — no new chat was created.
      __jait_capture(1, (data.session.id), (currentChat.id));
      const projectChats = sessionService.listByProject(data.project.id);
      __jait_capture(2, (projectChats));
      __jait_capture(3, (projectChats[0]?.id), (currentChat.id));

      // ...and it was actually assigned to the project.
      __jait_capture(4, (data.assigned));
      __jait_capture(5, (data.session.projectId), (data.project.id));
      const refetched = sessionService.getById(currentChat.id, user.id);
      __jait_capture(6, (refetched?.projectId), (data.project.id));
      __jait_capture(7, (refetched?.projectPath));

      // The turn runs inside the reused chat, in the project's directory.
      const threads = threadService.listBySession(currentChat.id);
      __jait_capture(8, (threads));
      __jait_capture(9, (threads[0]?.workingDirectory));
      __jait_capture(10, (threads[0]?.status));
      __jait_capture(11, (provider.sendTurnCalls));

      // Clients are told the chat moved into the project.
      __jait_capture(12, (broadcastToUser.mock.calls.map(([, event]) => event.type)));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_message_tool_test_ts_284_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  private emitter = new EventEmitter();
  lastStartOptions: StartSessionOptions | null = null;
  sendTurnCalls: Array<{ sessionId: string; message: string }> = [];

  constructor(readonly id: "jait" | "codex" | "claude-code" = "codex") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

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

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sendTurnCalls.push({ sessionId, message });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "originating-session",
    actionId: "action-1",
    projectRoot: "/tmp/originating-project",
    requestedBy: "test",
    userId,
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-3", "password");
      const tool = createProjectMessageTool({
        projectService: new ProjectService(db),
        sessionService: new SessionService(db),
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
        userService,
      });

      const result = await tool.execute({ projectRoot: "/tmp/whatever" }, makeContext(user.id));
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
case "tailstatic_packages_gateway_src_tools_project_message_tool_test_ts_306_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly info: ProviderInfo;
  private emitter = new EventEmitter();
  lastStartOptions: StartSessionOptions | null = null;
  sendTurnCalls: Array<{ sessionId: string; message: string }> = [];

  constructor(readonly id: "jait" | "codex" | "claude-code" = "codex") {
    this.info = {
      id,
      name: `Mock ${id}`,
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

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

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sendTurnCalls.push({ sessionId, message });
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function makeContext(userId: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "originating-session",
    actionId: "action-1",
    projectRoot: "/tmp/originating-project",
    requestedBy: "test",
    userId,
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const userService = new UserService(db);
      const user = userService.createUser("cross-project-user-4", "password");
      const tool = createProjectMessageTool({
        projectService: new ProjectService(db),
        sessionService: new SessionService(db),
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
        userService,
      });

      const result = await tool.execute({ message: "hello" }, makeContext(user.id));
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
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
