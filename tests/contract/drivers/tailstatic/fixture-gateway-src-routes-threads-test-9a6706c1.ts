// Translated fixture from packages/gateway/src/routes/threads.test.ts; expected literals are in tail_static.rs.

import { EventEmitter } from "node:events";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import type { GitStepResult } from "../../../../packages/gateway/src/services/git.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { SkillRegistry } from "../../../../packages/gateway/src/skills/index.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { registerThreadRoutes } from "../../../../packages/gateway/src/routes/threads.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { interventionRunResumeRegistry } from "../../../../packages/gateway/src/services/intervention-run-resume.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/threads.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_threads_test_ts_106_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const thread = threadService.create({ userId: "user-1", title: "Approval", providerId: "codex" });
    threadService.update(thread.id, { providerSessionId: "mock-session-1" });
    const provider = new MockThreadProvider();
    const respond = vi.spyOn(provider, "respondToApproval");
    const registry = new ProviderRegistry();
    registry.register(provider);
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const, jwtSecret: "approval-secret" };
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    const headers = await authHeader(config.jwtSecret, "user-1");
    for (const payload of [{}, { requestId: "req" }, { requestId: "req", approved: "yes" }, { requestId: "  ", approved: true }]) {
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/approve`, headers, payload });
      __jait_capture(1, (response.statusCode));
    }
    __jait_capture(2, (respond.mock.calls));
    const denied = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/approve`, headers, payload: { requestId: "req", approved: false } });
    __jait_capture(3, (denied.statusCode));
    __jait_capture(4, (respond.mock.calls));
    respond.mockRejectedValueOnce(new Error("stale"));
    const stale = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/approve`, headers, payload: { requestId: "stale", approved: true } });
    __jait_capture(5, (stale.statusCode));
    __jait_capture(6, (threadService.getActivities(thread.id).filter((activity) => activity.kind === "tool.approval-response")));
    threadService.update(thread.id, { executionNodeId: "remote-node" });
    const remote = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/approve`, headers, payload: { requestId: "remote", approved: true } });
    __jait_capture(7, (remote.statusCode));
    __jait_capture(8, (respond.mock.calls));
    __jait_capture(9, (threadService.getActivities(thread.id).filter((activity) => activity.kind === "tool.approval-response")));
    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_140_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const thread = service.create({ userId: "user-1", title: "Idle fixture", providerId: "codex", workingDirectory: process.cwd() });
    const provider = new MockThreadProvider();
    const registry = new ProviderRegistry(); registry.register(provider);
    const app = Fastify(); const config = loadConfig();
    registerThreadRoutes(app, config, { threadService: service, providerRegistry: registry });
    try {
      const headers = await authHeader(config.jwtSecret, "user-1");
      const first = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`, headers,
        payload: { message: "Remember the parser accepts UTF-8", titleTask: "" } });
      __jait_capture(1, (first.statusCode));
      await waitFor(() => provider.sendTurn.mock.calls.length === 1);
      const sessionId = service.getById(thread.id)!.providerSessionId!;
      provider.emit({ type: "turn.completed", sessionId });
      provider.emit({ type: "session.completed", sessionId });
      __jait_captureType(2, (service.getById(thread.id)?.providerSessionId));
      const followup = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/send`, headers,
        payload: { message: "Continue with the parser", titleTask: "" } });
      __jait_capture(3, (followup.statusCode));
      await waitFor(() => provider.sendTurn.mock.calls.length === 2);
      __jait_capture(4, (provider.startSessionCalls));
      __jait_capture(5, (provider.sendTurn.mock.calls[1]?.[1]));
      __jait_capture(6, (provider.sendTurn.mock.calls[1]?.[1]));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_168_3_each0": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const failure = "quota";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const thread = threadService.create({ userId: "user-1", title: "Fixture", providerId: "codex", workingDirectory: process.cwd() });
    const provider = new MockThreadProvider(); const registry = new ProviderRegistry(); registry.register(provider);
    const interrupt = vi.spyOn(provider, "interruptTurn");
    const app = Fastify(); const config = loadConfig();
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    try {
      await app.ready();
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`,
        headers: await authHeader(config.jwtSecret, "user-1"), payload: { message: "Implement parser", titleTask: "" } });
      __jait_capture(1, (response.statusCode));
      await waitFor(() => provider.sendTurn.mock.calls.length === 1);
      const sessionId = threadService.getById(thread.id)!.providerSessionId!;
      if (failure === "quota") provider.emit({ type: "session.error", sessionId, error: "Fixture quota exceeded" });
      else for (let i = 0; i < 3; i++) {
        const tool = ["execute", "terminal.run", "jait.terminal"][i]!;
        provider.emit({ type: "tool.start", sessionId, tool, args: { command: `attempt ${i}` }, callId: `call-${i}` });
        provider.emit({ type: "tool.result", sessionId, tool, ok: true, message: "Command exited",
          data: { exitCode: 128, output: "fatal: not a git repository" }, callId: `call-${i}` });
      }
      provider.emit({ type: "turn.completed", sessionId });
      provider.emit({ type: "session.completed", sessionId });
      __jait_capture(2, (threadService.getById(thread.id)?.status), (failure === "environment" ? "blocked" : "error"));
      if (failure === "environment") {
        __jait_capture(3, (interrupt.mock.calls));
        __jait_capture(4, (threadService.getExecutionCheckpoint(thread.id)?.calls));
      }
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_168_3_each1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const failure = "environment";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const thread = threadService.create({ userId: "user-1", title: "Fixture", providerId: "codex", workingDirectory: process.cwd() });
    const provider = new MockThreadProvider(); const registry = new ProviderRegistry(); registry.register(provider);
    const interrupt = vi.spyOn(provider, "interruptTurn");
    const app = Fastify(); const config = loadConfig();
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    try {
      await app.ready();
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`,
        headers: await authHeader(config.jwtSecret, "user-1"), payload: { message: "Implement parser", titleTask: "" } });
      __jait_capture(1, (response.statusCode));
      await waitFor(() => provider.sendTurn.mock.calls.length === 1);
      const sessionId = threadService.getById(thread.id)!.providerSessionId!;
      if (failure === "quota") provider.emit({ type: "session.error", sessionId, error: "Fixture quota exceeded" });
      else for (let i = 0; i < 3; i++) {
        const tool = ["execute", "terminal.run", "jait.terminal"][i]!;
        provider.emit({ type: "tool.start", sessionId, tool, args: { command: `attempt ${i}` }, callId: `call-${i}` });
        provider.emit({ type: "tool.result", sessionId, tool, ok: true, message: "Command exited",
          data: { exitCode: 128, output: "fatal: not a git repository" }, callId: `call-${i}` });
      }
      provider.emit({ type: "turn.completed", sessionId });
      provider.emit({ type: "session.completed", sessionId });
      __jait_capture(2, (threadService.getById(thread.id)?.status), (failure === "environment" ? "blocked" : "error"));
      if (failure === "environment") {
        __jait_capture(3, (interrupt.mock.calls));
        __jait_capture(4, (threadService.getExecutionCheckpoint(thread.id)?.calls));
      }
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_207_3_each0": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };
/*__jait_scope_open__*/{
const immediate = false;

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const thread = threadService.create({ userId: "user-1", title: "Interrupted task", providerId: "codex", workingDirectory: process.cwd() });
    const provider = new MockThreadProvider(); const registry = new ProviderRegistry(); registry.register(provider);
    const app = Fastify(); const config = { ...loadConfig(), nodeEnv: "test" as const };
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    try {
      const headers = await authHeader(config.jwtSecret, "user-1");
      await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`, headers, payload: { message: "Work", titleTask: "" } });
      await waitFor(() => provider.sendTurn.mock.calls.length === 1);
      const sessionId = threadService.getById(thread.id)!.providerSessionId!;
      if (immediate) vi.spyOn(provider, "interruptTurn").mockImplementation(async () => {
        provider.emit({ type: "session.error", sessionId, error: "Aborted" });
      });
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/interrupt`, headers });
      __jait_capture(1, (response.statusCode));
      __jait_capture(2, (threadService.getById(thread.id)?.status));
      provider.emit({ type: "turn.completed", sessionId });
      provider.emit({ type: "session.error", sessionId, error: "Aborted" });
      await new Promise(resolve => setTimeout(resolve, 10));
      __jait_capture(3, (threadService.getById(thread.id)?.status));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_9697();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_207_3_each1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };
/*__jait_scope_open__*/{
const immediate = true;

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const thread = threadService.create({ userId: "user-1", title: "Interrupted task", providerId: "codex", workingDirectory: process.cwd() });
    const provider = new MockThreadProvider(); const registry = new ProviderRegistry(); registry.register(provider);
    const app = Fastify(); const config = { ...loadConfig(), nodeEnv: "test" as const };
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    try {
      const headers = await authHeader(config.jwtSecret, "user-1");
      await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`, headers, payload: { message: "Work", titleTask: "" } });
      await waitFor(() => provider.sendTurn.mock.calls.length === 1);
      const sessionId = threadService.getById(thread.id)!.providerSessionId!;
      if (immediate) vi.spyOn(provider, "interruptTurn").mockImplementation(async () => {
        provider.emit({ type: "session.error", sessionId, error: "Aborted" });
      });
      const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/interrupt`, headers });
      __jait_capture(1, (response.statusCode));
      __jait_capture(2, (threadService.getById(thread.id)?.status));
      provider.emit({ type: "turn.completed", sessionId });
      provider.emit({ type: "session.error", sessionId, error: "Aborted" });
      await new Promise(resolve => setTimeout(resolve, 10));
      __jait_capture(3, (threadService.getById(thread.id)?.status));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {
await __jait_hook_9697();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_232_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    threadService.savePersonaAgent("user-1", { id: "agent-1", name: "Builder", providerId: "claude-code", model: null, requiresApproval: true });
    const thread = threadService.create({ userId: "user-1", personaAgentId: "agent-1", title: "Fix parser", providerId: "codex", model: "old-model", workingDirectory: process.cwd(), branch: "fix/parser" });
    threadService.addActivity(thread.id, "message", "Fix parser", { role: "user", content: "Fix parser without changing the public API." });
    threadService.addActivity(thread.id, "message", "Progress", { role: "assistant", content: "Parser patched. Remaining: test the fix." });
    threadService.markError(thread.id, "Usage limit reached");
    const provider = new MockThreadProvider("claude-code");
    const registry = new ProviderRegistry();
    registry.register(provider);
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const, jwtSecret: "resume-secret" };
    registerThreadRoutes(app, config, { threadService, providerRegistry: registry });
    const headers = await authHeader(config.jwtSecret, "user-1");
    const foreign = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/resume`, headers: await authHeader(config.jwtSecret, "other-owner") });
    __jait_capture(1, (foreign.statusCode));
    const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/resume`, headers });
    __jait_capture(2, (response.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length === 1);
    __jait_capture(3, (provider.startSessionCalls[0]), ({ threadId: thread.id, model: undefined, mode: "supervised", workingDirectory: process.cwd() }));
    const sent = (provider.sendTurn.mock.calls as unknown as Array<[string, string]>)[0]![1];
    __jait_capture(4, (sent));
    __jait_capture(5, (sent));
    __jait_capture(6, (sent));
    __jait_capture(7, (threadService.getById(thread.id)));
    const duplicate = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/resume`, headers });
    __jait_capture(8, (duplicate.statusCode));
    const otherWork = threadService.create({ userId: "user-1", personaAgentId: "agent-1", title: "Older task", providerId: "codex" });
    threadService.markError(otherWork.id, "Quota exhausted");
    const busyAgent = await app.inject({ method: "POST", url: `/api/threads/${otherWork.id}/resume`, headers });
    __jait_capture(9, (busyAgent.statusCode));
    __jait_capture(10, (threadService.getById(otherWork.id)?.status));
    __jait_capture(11, (provider.startSessionCalls));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_271_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    service.savePersonaAgent("user-1", { id: "agent-1", name: "Builder", providerId: "claude-code", model: "new-model" });
    const thread = service.create({ userId: "user-1", personaAgentId: "agent-1", title: "Fix", providerId: "codex" });
    service.markError(thread.id, "Quota exhausted");
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const, jwtSecret: "resume-secret" };
    registerThreadRoutes(app, config, { threadService: service, providerRegistry: new ProviderRegistry() });
    const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/resume`, headers: await authHeader(config.jwtSecret, "user-1") });
    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (service.getById(thread.id)));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_288_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const threadService = new ThreadService(db);
    const userService = new UserService(db);
    const user = userService.createUser("restart-owner", "password123");
    const thread = threadService.create({ title: "Fix the bug", providerId: "codex", userId: user.id,
      workingDirectory: process.cwd(), runtimeMode: "supervised", model: "test-model", kind: "delegation" });
    threadService.addActivity(thread.id, "message", "Fix the bug", { role: "user", content: "Fix the bug" });
    threadService.addActivity(thread.id, "message", "Patched parser", { role: "assistant", content: "Patched parser; still need validation." + "x".repeat(16000) + "Remaining: run tests." });
    threadService.markRunning(thread.id, "lost-session");
    const provider = new MockThreadProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const, jwtSecret: "recovery-test-secret" };
    threadService.queueRestartRecovery();
    registerThreadRoutes(app, config, { threadService, providerRegistry, userService });
    const recover = (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns;
    await recover();
    await waitFor(() => provider.sendTurn.mock.calls.length > 0);
    __jait_capture(1, (provider.startSessionCalls));
    __jait_capture(2, (provider.startSessionCalls[0]), ({ threadId: thread.id, mode: "supervised", model: "test-model", workingDirectory: process.cwd() }));
    const sent = (provider.sendTurn.mock.calls as unknown as Array<[string, string]>)[0]![1];
    __jait_capture(3, (sent));
    __jait_capture(4, (sent));
    __jait_capture(5, (sent));
    __jait_capture(6, (sent));
    __jait_capture(7, (threadService.getById(thread.id)?.status));
    await recover();
    __jait_capture(8, (provider.startSessionCalls));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_323_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("stopped-owner", "password123");
    const provider = new MockThreadProvider();
    const registry = new ProviderRegistry();
    registry.register(provider);
    for (const status of ["idle", "completed", "interrupted"] as const) {
      const thread = service.create({ title: status, providerId: "codex", userId: user.id });
      service.update(thread.id, { status });
    }
    const orphan = service.create({ title: "ownerless", providerId: "codex" });
    service.markRunning(orphan.id, "lost");
    const app = Fastify();
    service.queueRestartRecovery();
    registerThreadRoutes(app, { ...loadConfig(), nodeEnv: "test" }, { threadService: service, providerRegistry: registry, userService: users });
    await (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns();
    __jait_capture(1, (provider.startSessionCalls));
    __jait_capture(2, (service.listPendingRecovery()));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_348_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("offline-owner", "password123");
    const thread = service.create({ title: "Work", providerId: "codex", userId: user.id, workingDirectory: process.cwd() });
    service.markRunning(thread.id, "lost");
    const provider = new MockThreadProvider();
    const available = vi.spyOn(provider, "checkAvailability").mockResolvedValue(false);
    const registry = new ProviderRegistry();
    registry.register(provider);
    const config = { ...loadConfig(), nodeEnv: "test" as const };
    let app = Fastify();
    service.queueRestartRecovery();
    registerThreadRoutes(app, config, { threadService: service, providerRegistry: registry, userService: users });
    for (let i = 0; i < 4; i++) await (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns();
    __jait_capture(1, (service.getRecovery(thread.id)));
    __jait_capture(2, (provider.startSessionCalls));
    await app.close();
    app = Fastify();
    const restored = new ThreadService(db);
    restored.queueRestartRecovery();
    registerThreadRoutes(app, config, { threadService: restored, providerRegistry: registry, userService: users });
    available.mockResolvedValue(true);
    await (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns();
    await waitFor(() => provider.sendTurn.mock.calls.length === 1);
    __jait_capture(3, (restored.getById(thread.id)?.status));
    __jait_capture(4, (restored.getRecovery(thread.id)));
    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => restored.getById(thread.id)?.status === "completed");
    __jait_captureType(5, (restored.getRecovery(thread.id)));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_384_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    const thread = service.create({ title: "Work", providerId: "codex", userId: user.id, workingDirectory: process.cwd() });
    service.markRunning(thread.id, "lost");
    service.queueRestartRecovery();
    __jait_capture(1, (service.claimRecovery(thread.id))); // simulate process dying before startSession
    const config = { ...loadConfig(), nodeEnv: "test" as const };
    for (let i = 0; i < 3; i++) {
      const app = Fastify();
      const provider = new MockThreadProvider();
      const registry = new ProviderRegistry();
      registry.register(provider);
      const restored = new ThreadService(db);
      restored.queueRestartRecovery();
      registerThreadRoutes(app, config, { threadService: restored, providerRegistry: registry, userService: users });
      await (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns();
      if (i < 2) {
        await waitFor(() => provider.sendTurn.mock.calls.length === 1);
        __jait_capture(2, (restored.getById(thread.id)?.status));
      } else {
        __jait_capture(3, (provider.startSessionCalls));
        __jait_capture(4, (restored.getById(thread.id)));
      }
      await app.close();
    }
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_416_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("cancel-owner", "password123");
    const thread = service.create({ title: "Work", providerId: "codex", userId: user.id, workingDirectory: process.cwd() });
    service.markRunning(thread.id, "lost");
    const provider = new MockThreadProvider();
    const start = provider.startSession.bind(provider);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const starting = vi.spyOn(provider, "startSession").mockImplementation(async (options) => { await gate; return start(options); });
    const stopping = vi.spyOn(provider, "stopSession");
    const registry = new ProviderRegistry();
    registry.register(provider);
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const };
    service.queueRestartRecovery();
    registerThreadRoutes(app, config, { threadService: service, providerRegistry: registry, userService: users });
    const recovering = (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns();
    await waitFor(() => starting.mock.calls.length === 1);
    const response = await app.inject({ method: "POST", url: `/api/threads/${thread.id}/stop`, headers: await authHeader(config.jwtSecret, user.id) });
    __jait_capture(1, (response.statusCode));
    release();
    await recovering;
    __jait_capture(2, (stopping.mock.calls));
    __jait_capture(3, (provider.sendTurn.mock.calls));
    __jait_capture(4, (service.getById(thread.id)?.status));
    __jait_captureType(5, (service.getRecovery(thread.id)));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_450_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const provider = new MockThreadProvider();
    const registry = new ProviderRegistry();
    registry.register(provider);
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const };
    registerThreadRoutes(app, config, { threadService: service, providerRegistry: registry });
    const thread = service.create({ title: "Work", providerId: "codex", userId: "stream-owner", workingDirectory: process.cwd() });
    await app.inject({ method: "POST", url: `/api/threads/${thread.id}/start`, headers: await authHeader(config.jwtSecret, "stream-owner"), payload: {} });
    provider.emit({ type: "token", sessionId: "mock-session-1", content: "Partial progress" });
    __jait_capture(1, (new ThreadService(db).getActivities(thread.id).some((activity) => activity.payload && (activity.payload as { content?: string }).content === "Partial progress")));
    provider.emit({ type: "message", sessionId: "mock-session-1", role: "assistant", content: "Partial progress finished." });
    const messages = service.getActivities(thread.id).filter((activity) => activity.kind === "message");
    __jait_capture(2, (messages));
    __jait_capture(3, (messages[0]?.payload));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_472_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("remote-restart-owner", "password123");
    const thread = service.create({ title: "Remote work", providerId: "codex", userId: user.id, workingDirectory: process.cwd() });
    service.markRunning(thread.id, "old-remote-session");
    service.update(thread.id, { executionNodeId: "original-node", executionNodeName: "Original node" });
    const localProvider = new MockThreadProvider();
    const registry = new ProviderRegistry();
    registry.register(localProvider);
    let connected = false;
    const node = { id: "original-node", name: "Original node", providers: ["codex"] };
    const proxy = vi.fn(async (_nodeId: string, op: string) => op === "send-turn" ? { completed: true } : { ok: true, stopped: false });
    const ws = { getFsNodes: () => connected ? [node] : [], findNodeByDeviceId: () => connected ? node : null,
      proxyProviderOp: proxy, broadcastAll: vi.fn() } as unknown as WsControlPlane;
    const app = Fastify();
    const config = { ...loadConfig(), nodeEnv: "test" as const };
    service.queueRestartRecovery();
    registerThreadRoutes(app, config, { threadService: service, providerRegistry: registry, userService: users, ws });
    const recover = (app as typeof app & { recoverInterruptedThreadTurns: () => Promise<number> }).recoverInterruptedThreadTurns;
    await recover();
    __jait_capture(1, (localProvider.startSessionCalls));
    __jait_capture(2, (service.getRecovery(thread.id)));
    connected = true;
    await recover();
    await waitFor(() => proxy.mock.calls.some(([, op]) => op === "send-turn"));
    __jait_capture(3, (proxy.mock.calls.slice(0, 2).map(([, op]) => op)));
    __jait_capture(4, (proxy.mock.calls));
    __jait_capture(5, (localProvider.startSessionCalls));
    await waitFor(() => service.getById(thread.id)?.status === "completed");
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_508_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider());

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", providerId: "codex", kind: "delegation" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_542_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider());
    registerThreadRoutes(app, config, { threadService: new ThreadService(db), providerRegistry });
    const owner = await authHeader(config.jwtSecret, "owner");
    const other = await authHeader(config.jwtSecret, "other");
    const profile = {
      name: "Researcher", persona: "Find evidence", avatar: "🦉", providerId: "codex",
      repositoryIds: [], skillIds: ["research"], schedule: { kind: "adaptive", rules: "" },
      allowedTools: [], requiresApproval: true, notificationChannels: [], notificationEvents: [], paused: true,
    };
    const saved = await app.inject({ method: "PUT", url: "/api/persona-agents/agent-1", headers: owner, payload: profile });
    __jait_capture(1, (saved.statusCode));
    __jait_capture(2, (saved.json()));
    const list = await app.inject({ method: "GET", url: "/api/persona-agents", headers: owner });
    __jait_capture(3, (list.json().agents));
    const otherList = await app.inject({ method: "GET", url: "/api/persona-agents", headers: other });
    __jait_capture(4, (otherList.json().agents));
    const report = await app.inject({ method: "PUT", url: "/api/persona-agents/agent-2", headers: owner,
      payload: { ...profile, name: "Assistant", role: "Analyst", reportsToId: "agent-1" } });
    __jait_capture(5, (report.statusCode));
    __jait_capture(6, (report.json()));
    const cycle = await app.inject({ method: "PUT", url: "/api/persona-agents/agent-1", headers: owner,
      payload: { ...profile, reportsToId: "agent-2" } });
    __jait_capture(7, (cycle.statusCode));
    const selfReport = await app.inject({ method: "PUT", url: "/api/persona-agents/agent-1", headers: owner,
      payload: { ...profile, reportsToId: "agent-1" } });
    __jait_capture(8, (selfReport.statusCode));
    await app.inject({ method: "PUT", url: "/api/persona-agents/other-agent", headers: other, payload: profile });
    const crossUserManager = await app.inject({ method: "PUT", url: "/api/persona-agents/agent-2", headers: owner,
      payload: { ...profile, reportsToId: "other-agent" } });
    __jait_capture(9, (crossUserManager.statusCode));
    const denied = await app.inject({ method: "POST", url: "/api/threads", headers: other,
      payload: { title: "Unauthorized", providerId: "codex", personaAgentId: "agent-1" } });
    __jait_capture(10, (denied.statusCode));
    const created = await app.inject({ method: "POST", url: "/api/threads", headers: owner,
      payload: { title: "Research", providerId: "codex", personaAgentId: "agent-1" } });
    __jait_capture(11, (created.statusCode));
    __jait_capture(12, (created.json().personaAgentId));
    const removed = await app.inject({ method: "DELETE", url: "/api/persona-agents/agent-1", headers: owner });
    __jait_capture(13, (removed.statusCode));
    const remaining = await app.inject({ method: "GET", url: "/api/persona-agents", headers: owner });
    __jait_capture(14, (remaining.json().agents));
    const thread = await app.inject({ method: "GET", url: `/api/threads/${created.json().id}`, headers: owner });
    __jait_captureType(15, (thread.json().personaAgentId));
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_595_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider());
    registerThreadRoutes(app, config, { threadService, providerRegistry });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const segments = [
      { type: "text", text: "See " },
      { type: "chat", sessionId: "referenced-chat", name: "Earlier chat" },
      { type: "text", text: " please" },
    ];
    const first = threadService.create({
      userId: "user-1", title: "First", providerId: "codex", workingDirectory: process.cwd(),
    });
    const started = await app.inject({
      method: "POST", url: `/api/threads/${first.id}/start`, headers,
      payload: { message: "See earlier chat please", displaySegments: segments, titleTask: "" },
    });
    __jait_capture(1, (started.statusCode));
    __jait_capture(2, (threadService.getActivities(first.id).find((activity) => activity.kind === "message")?.payload), ({ displaySegments: segments }));

    const second = threadService.create({
      userId: "user-1", title: "Second", providerId: "codex", workingDirectory: process.cwd(),
    });
    threadService.update(second.id, { status: "completed", providerSessionId: "mock-session-1" });
    const sent = await app.inject({
      method: "POST", url: `/api/threads/${second.id}/send`, headers,
      payload: { message: "See earlier chat please", displaySegments: segments },
    });
    __jait_capture(3, (sent.statusCode));
    __jait_capture(4, (threadService.getActivities(second.id).find((activity) => activity.kind === "message")?.payload), ({ displaySegments: segments }));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_639_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("thread-user", "secret");
    users.updateSettings(user.id, { chatProvider: "jait" });
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider("jait"));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", providerId: "jait", kind: "delegation" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_678_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const sessionState = new SessionStateService(db);
    const user = users.createUser("selected-defaults-user", "secret");
    // The account-level default points at a provider that is not even registered:
    // it must never be what a spawned thread runs on. Only the choice made in the
    // chat itself counts.
    users.updateSettings(user.id, { chatProvider: "ollama" });
    sessionState.set("session-selected-defaults", {
      "chat.provider": "codex",
      "chat.providerRuntimeMode": "supervised",
      "chat.cliModels": { codex: "gpt-5-codex" },
    });
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider("codex"));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
      sessionState,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", sessionId: "session-selected-defaults", kind: "delegation" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_729_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("effort-user", "secret");
    users.updateSettings(user.id, { chatProvider: "claude-code" });
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, { threadService, providerRegistry, userService: users });

    const headers = await authHeader(config.jwtSecret, user.id);
    const created = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "Helper",
        providerId: "claude-code",
        reasoningEffort: "xhigh",
        workingDirectory: process.cwd(),
      },
    });

    __jait_capture(1, (created.statusCode));
    __jait_capture(2, (created.json()));

    const started = await app.inject({
      method: "POST",
      url: `/api/threads/${created.json().id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    __jait_capture(3, (started.statusCode));
    await waitFor(() => provider.startSessionCalls.length >= 1);
    __jait_capture(4, (provider.startSessionCalls[0]?.reasoningEffort));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_776_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const sessionState = new SessionStateService(db);
    const user = users.createUser("effort-inherit-user", "secret");
    users.updateSettings(user.id, { chatProvider: "ollama" });
    sessionState.set("session-effort", { "chat.provider": "codex", "chat.reasoningEffort": "high" });
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider("codex"));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
      sessionState,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", sessionId: "session-effort" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json()));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_813_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("effort-bad-user", "secret");
    users.updateSettings(user.id, { chatProvider: "codex" });
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider("codex"));

    registerThreadRoutes(app, config, { threadService, providerRegistry, userService: users });

    const headers = await authHeader(config.jwtSecret, user.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Helper", providerId: "codex", reasoningEffort: "high --dangerously" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_captureType(2, (response.json().reasoningEffort));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_843_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("thread-user", "secret");
    users.updateSettings(user.id, { chatProvider: "jait" });
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("jait");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const thread = threadService.create({
      userId: user.id,
      title: "Helper",
      providerId: "jait",
      workingDirectory: process.cwd(),
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    __jait_capture(1, (response.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    __jait_capture(2, (provider.sendTurn.mock.calls[0]?.[0]));
    expectThreadTurnMessage(provider.sendTurn.mock.calls[0]?.[1], "inspect ui");
    __jait_captureType(3, (provider.sendTurn.mock.calls[0]?.[2]));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_887_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);
    const skillRegistry = new SkillRegistry();
    skillRegistry.add({
      id: "word-docx",
      name: "Word / DOCX",
      description: "Handle DOCX files without formatting drift.",
      filePath: "C:/skills/word-docx/SKILL.md",
      source: "user",
      enabled: true,
    });

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      skillRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "DOCX helper",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Inspect the DOCX template", titleTask: "" },
    });

    __jait_capture(1, (response.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    const turnMessage = provider.sendTurn.mock.calls.at(-1)?.[1] as string;
    // Discovery-first contract: no eager <available_skills> catalog with file
    // paths — just the lazy <skillDiscovery> instruction, with the auto-matched
    // skill named in the routing summary.
    __jait_capture(2, (turnMessage));
    __jait_capture(3, (turnMessage));
    __jait_capture(4, (turnMessage));
    __jait_capture(5, (turnMessage));
    __jait_capture(6, (turnMessage));
    __jait_capture(7, (turnMessage));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_945_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);
    const skillRegistry = new SkillRegistry();
    skillRegistry.add({
      id: "word-docx",
      name: "Word / DOCX",
      description: "Handle DOCX files without formatting drift.",
      filePath: "C:/skills/word-docx/SKILL.md",
      source: "user",
      enabled: true,
    });
    skillRegistry.add({
      id: "browser-research",
      name: "Browser Research",
      description: "Use the browser for deep web research.",
      filePath: "C:/skills/browser-research/SKILL.md",
      source: "user",
      enabled: true,
    });

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      skillRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "DOCX helper",
      providerId: "codex",
      workingDirectory: process.cwd(),
      skillIds: ["word-docx"],
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Inspect the template", titleTask: "" },
    });

    __jait_capture(1, (response.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    const turnMessage = provider.sendTurn.mock.calls.at(-1)?.[1] as string;
    // Only the pinned skill is auto-activated; the unpinned one is not named,
    // and neither leaks its file path — skills are discovered lazily.
    __jait_capture(2, (turnMessage));
    __jait_capture(3, (turnMessage));
    __jait_capture(4, (turnMessage));
    __jait_capture(5, (turnMessage));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1009_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Claude helper", providerId: "claude-code", kind: "delegation" },
    });

    __jait_capture(1, (createResponse.statusCode));
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    __jait_capture(2, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    __jait_capture(3, (provider.sendTurn.mock.calls[0]?.[0]));
    expectThreadTurnMessage(provider.sendTurn.mock.calls[0]?.[1], "inspect ui");
    __jait_captureType(4, (provider.sendTurn.mock.calls[0]?.[2]));

    threadService.update(thread.id, {
      status: "completed",
      error: null,
      completedAt: new Date().toISOString(),
    });

    const sendResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/send`,
      headers,
      payload: { message: "address the follow-up" },
    });

    __jait_capture(5, (sendResponse.statusCode));
    __jait_capture(6, (provider.sendTurn.mock.calls[1]?.[0]));
    expectThreadTurnMessage(provider.sendTurn.mock.calls[1]?.[1], "address the follow-up");
    __jait_captureType(7, (provider.sendTurn.mock.calls[1]?.[2]));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1071_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Claude helper", providerId: "claude-code", kind: "delegation" },
    });
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "inspect ui", titleTask: "" },
    });

    __jait_capture(1, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const resume = await interventionRunResumeRegistry.resumeThread(
      thread.id,
      "User completed intervention on browser session bs_123. Note: Continue from the current page.",
    );
    __jait_capture(2, (resume));

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });

    await waitFor(() => provider.sendTurn.mock.calls.length >= 2);
    __jait_capture(3, (provider.sendTurn.mock.calls));
    __jait_capture(4, (threadService.getById(thread.id)?.status));

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.status === "completed");

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1129_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const users = new UserService(db);
    const user = users.createUser("background-cmd-user", "secret");
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("claude-code");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      userService: users,
    });

    const headers = await authHeader(config.jwtSecret, user.id);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Claude helper", providerId: "claude-code", kind: "delegation" },
    });
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "kick off a background build", titleTask: "" },
    });
    __jait_capture(1, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    // The agent ends its own turn right after starting the background command,
    // so the thread flips to "completed" well before the command finishes.
    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.status === "completed");

    // The background command finishes afterwards; this is the notification
    // path backgroundCommandMonitor's completion handler drives in chat.ts.
    const resume = await interventionRunResumeRegistry.resumeThread(
      thread.id,
      "Background command finished: build succeeded.",
    );
    __jait_capture(2, (resume));

    await waitFor(() => provider.sendTurn.mock.calls.length >= 2);
    __jait_capture(3, (provider.sendTurn.mock.calls[1]?.[0]));
    expectThreadTurnMessage(provider.sendTurn.mock.calls[1]?.[1], "Background command finished: build succeeded.");
    __jait_capture(4, (threadService.getById(thread.id)?.status));

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });
    await waitFor(() => threadService.getById(thread.id)?.status === "completed");

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1191_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const user = users.createUser("queued-thread-user", "secret");
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      sessionState,
      userService: users,
    });

    const sessionId = "session-with-thread-queue";
    const headers = await authHeader(config.jwtSecret, user.id);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: { title: "Queued thread", providerId: "codex", sessionId },
    });
    const thread = createResponse.json() as { id: string };

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "first message", titleTask: "" },
    });
    __jait_capture(1, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    sessionState.set(sessionId, {
      queued_thread_messages: {
        [thread.id]: [
          {
            id: "queued-1",
            content: "second message",
            fullContent: "second message",
            displayContent: "second message",
            providerId: "codex",
            queuedAt: Date.now(),
          },
        ],
      },
    });

    provider.emit({ type: "turn.completed", sessionId: "mock-session-1" });

    await waitFor(() => provider.sendTurn.mock.calls.length >= 2);
    __jait_capture(2, (provider.sendTurn.mock.calls[1]?.[0]));
    expectThreadTurnMessage(provider.sendTurn.mock.calls[1]?.[1], "second message");
    __jait_captureType(3, (provider.sendTurn.mock.calls[1]?.[2]));
    __jait_captureType(4, (sessionState.get(sessionId, ["queued_thread_messages"])["queued_thread_messages"]));
    __jait_capture(5, (threadService.getActivities(thread.id).some((activity) => (
      activity.kind === "message" && activity.summary.includes("second message")
    ))));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1261_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    threadService.create({ userId: "user-1", title: "Thread 1", providerId: "codex" });
    threadService.create({ userId: "user-1", title: "Thread 2", providerId: "codex" });
    threadService.create({ userId: "user-1", title: "Thread 3", providerId: "codex" });

    const response = await app.inject({
      method: "GET",
      url: "/api/threads?limit=2",
      headers,
    });

    __jait_capture(1, (response.statusCode));
    const payload = response.json() as { hasMore: boolean; threads: Array<{ title: string }> };
    __jait_capture(2, (payload.hasMore));
    __jait_capture(3, (payload.threads));
    const titles = payload.threads.map((thread) => thread.title);
    __jait_capture(4, (new Set(titles).size));
    __jait_capture(5, (titles.every((title) => ["Thread 1", "Thread 2", "Thread 3"].includes(title))));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1297_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
      commit: { status: "skipped_no_changes" },
      push: { status: "skipped_not_requested" },
      branch: { status: "skipped_not_requested" },
      pr: { status: "skipped_not_requested" },
    }));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json()));
    __jait_capture(3, (runStackedAction.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1342_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const prUrl = "https://github.com/acme/repo/pull/42";
    const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
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
    }));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.markCompleted(thread.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json()), ({
      message: `Pull request ready: ${prUrl}`,
      prUrl,
    }));
    __jait_capture(3, (runStackedAction.mock.calls), ([process.cwd(),"commit_push_pr","feat: implement feature",false,"main",undefined,undefined]));

    const updated = threadService.getById(thread.id);
    __jait_capture(4, (updated?.prUrl), (prUrl));
    __jait_capture(5, (updated?.prNumber));
    __jait_capture(6, (updated?.prTitle));
    __jait_capture(7, (updated?.prBaseBranch));
    __jait_capture(8, (updated?.prState));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1413_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider();
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
      branch: "feature/existing-pr",
    });
    threadService.update(thread.id, {
      providerSessionId: "mock-session-1",
      prUrl: "https://github.com/acme/repo/pull/42",
      prState: "open",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/send`,
      headers,
      payload: { message: "Address the review feedback" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (provider.sendTurn.mock.calls));
    __jait_capture(3, (provider.sendTurn.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1466_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider();
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
      branch: "feature/existing-pr",
    });
    threadService.update(thread.id, {
      status: "completed",
      providerSessionId: null,
      prUrl: "https://github.com/acme/repo/pull/42",
      prState: "open",
      completedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Fix the failing test", titleTask: "" },
    });

    __jait_capture(1, (response.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    __jait_capture(2, (provider.sendTurn.mock.calls.some(([sessionId, content]) =>
      sessionId === "mock-session-1"
      && typeof content === "string"
      && content.includes("Apply this follow-up work to the existing PR on branch `feature/existing-pr`."),
    )));
    
    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1517_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider();
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.addActivity(thread.id, "message", "Investigate the flaky test", {
      role: "user",
      content: "Investigate the flaky test",
      fullContent: "Investigate the flaky test",
    });
    threadService.addActivity(thread.id, "message", "I found a race in the retry path.", {
      role: "assistant",
      content: "I found a race in the retry path.",
    });
    threadService.update(thread.id, {
      status: "completed",
      providerSessionId: null,
      completedAt: new Date().toISOString(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Apply the fix now", titleTask: "" },
    });

    __jait_capture(1, (response.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);
    const firstTurn = provider.sendTurn.mock.calls[0]?.[1];
    __jait_capture(2, (firstTurn));
    __jait_capture(3, (firstTurn));
    __jait_capture(4, (firstTurn));
    __jait_capture(5, (firstTurn));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1574_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider();
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.update(thread.id, {
      status: "completed",
      providerSessionId: "mock-session-1",
      completedAt: "2026-04-21T00:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/send`,
      headers,
      payload: { message: "Continue with the fix" },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (threadService.getById(thread.id)));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1620_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const prUrl = "https://github.com/acme/repo/pull/42";
    let resolveRun: ((result: GitStepResult) => void) | null = null;
    const runStackedAction = vi.fn(
      () =>
        new Promise<GitStepResult>((resolve) => {
          resolveRun = resolve;
        }),
    );

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.markCompleted(thread.id);

    const responsePromise = app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    await waitFor(() => threadService.getById(thread.id)?.prState === "creating");
    __jait_capture(1, (threadService.getById(thread.id)?.prState));

    resolveRun?.({
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
    });

    const response = await responsePromise;
    __jait_capture(2, (response.statusCode));
    __jait_capture(3, (threadService.getById(thread.id)?.prBaseBranch));
    __jait_capture(4, (threadService.getById(thread.id)?.prState));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1684_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockThreadProvider());
    const broadcastAll = vi.fn();
    const ws = {
      broadcastAll,
    } as unknown as WsControlPlane;

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.markInterrupted(thread.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
    });

    __jait_capture(1, (response.statusCode));

    const statusCall = broadcastAll.mock.calls.find(
      ([event]) => (event as { type?: string }).type === "thread.status",
    );
    __jait_captureType(2, (statusCall));
    __jait_capture(3, (statusCall?.[0]), ([thread.id,thread.id]));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1742_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    // Simulates an ACP provider that emits tokens → tool.start → tool.result → tokens
    // and verifies the thread handler flushes accumulated text into message activities.
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "ACP message test",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "do something", titleTask: "" },
    });
    __jait_capture(1, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const sid = "mock-session-1";

    // Simulate ACP event sequence: text → tool → text → done
    // Phase 1: assistant emits text tokens before a tool call
    provider.emit({ type: "token", sessionId: sid, content: "Let me " });
    provider.emit({ type: "token", sessionId: sid, content: "check that file." });

    // Phase 2: tool call starts — should flush "Let me check that file."
    provider.emit({ type: "tool.start", sessionId: sid, tool: "read_file", args: { path: "/tmp/test.txt" }, callId: "call-1" });
    provider.emit({ type: "tool.result", sessionId: sid, tool: "read_file", ok: true, message: "file contents", callId: "call-1" });

    // Phase 3: more tokens after the tool
    provider.emit({ type: "token", sessionId: sid, content: "The file contains " });
    provider.emit({ type: "token", sessionId: sid, content: "the expected data." });

    // Phase 4: turn completes — should flush "The file contains the expected data."
    provider.emit({ type: "turn.completed", sessionId: sid });

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 100));

    // Verify activities (getActivities returns descending order, reverse for chronological)
    const activities = threadService.getActivities(thread.id).reverse();
    const messageActivities = activities.filter((a) => a.kind === "message");
    const toolActivities = activities.filter((a) => a.kind === "tool.start" || a.kind === "tool.result");

    // Should have at least 2 assistant message activities (one before tool, one after)
    const assistantMessages = messageActivities.filter(
      (a) => (a.payload as { role?: string })?.role === "assistant",
    );
    __jait_capture(2, (assistantMessages.length));

    // First assistant message: text before the tool call
    __jait_capture(3, (assistantMessages[0]!.summary));
    const firstPayload = assistantMessages[0]!.payload as { content?: string };
    __jait_capture(4, (firstPayload.content));

    // Second assistant message: text after the tool call
    __jait_capture(5, (assistantMessages[1]!.summary));
    const secondPayload = assistantMessages[1]!.payload as { content?: string };
    __jait_capture(6, (secondPayload.content));

    // Should also have tool activities
    __jait_capture(7, (toolActivities.some((a) => a.kind === "tool.start")));
    __jait_capture(8, (toolActivities.some((a) => a.kind === "tool.result")));

    // Verify ordering: message → tool.start → tool.result → message
    const ordered = activities.filter(
      (a) => a.kind === "message" || a.kind === "tool.start" || a.kind === "tool.result",
    );
    const kinds = ordered.map((a) => {
      if (a.kind === "message") {
        return `message:${(a.payload as { role?: string })?.role ?? "?"}`;
      }
      return a.kind;
    });

    // Expected chronological sequence: user message, assistant text, tool.start, tool.result, assistant text
    const firstAssistantIdx = kinds.indexOf("message:assistant");
    const toolStartIdx = kinds.indexOf("tool.start");
    const toolResultIdx = kinds.indexOf("tool.result");
    const lastAssistantIdx = kinds.lastIndexOf("message:assistant");

    __jait_capture(9, (firstAssistantIdx), (toolStartIdx));
    __jait_capture(10, (toolStartIdx), (toolResultIdx));
    __jait_capture(11, (toolResultIdx), (lastAssistantIdx));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1848_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    // Edge case: ACP provider sends tokens → turn.completed with no tools
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Token-only test",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "explain something", titleTask: "" },
    });
    __jait_capture(1, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const sid = "mock-session-1";

    // Only tokens, no tool calls
    provider.emit({ type: "token", sessionId: sid, content: "Here is my explanation " });
    provider.emit({ type: "token", sessionId: sid, content: "of the topic." });
    provider.emit({ type: "turn.completed", sessionId: sid });

    await new Promise((r) => setTimeout(r, 100));

    const activities = threadService.getActivities(thread.id).reverse();
    const assistantMessages = activities.filter(
      (a) => a.kind === "message" && (a.payload as { role?: string })?.role === "assistant",
    );

    // The accumulated tokens should be flushed as a message activity
    __jait_capture(2, (assistantMessages.length));
    const payload = assistantMessages[0]!.payload as { content?: string };
    __jait_capture(3, (payload.content));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_threads_test_ts_1905_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function expectThreadTurnMessage(message: unknown, startsWith: string): void {
  __jait_capture(0, (message), ([startsWith]));
}
class MockThreadProvider implements CliProviderAdapter {
  readonly id: "jait" | "codex" | "claude-code";
  readonly info: ProviderInfo;

  private emitter = new EventEmitter();
  readonly sendTurn = vi.fn(async (): Promise<void> => {
    return;
  });

  constructor(id: "jait" | "codex" | "claude-code" = "codex") {
    this.id = id;
    this.info = {
      id,
      name: id === "jait" ? "Mock Jait" : id === "claude-code" ? "Mock Claude Code" : "Mock Codex",
      description: "Test provider",
      available: true,
      modes: ["full-access", "supervised"],
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly startSessionCalls: StartSessionOptions[] = [];

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = "mock-session-1";
    this.startSessionCalls.push(options);
    this.emit({ type: "session.started", sessionId });
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

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
/*__jait_scope_open__*/{
const __jait_hook_9697 = () => {
    interventionRunResumeRegistry.clearForTests();
  };

try {
await (async()=>{

    // Simulates: text → tool1 → text → tool2 → text → done
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const providerRegistry = new ProviderRegistry();
    const provider = new MockThreadProvider("codex");
    providerRegistry.register(provider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Multi-tool test",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "do multiple things", titleTask: "" },
    });
    __jait_capture(1, (startResponse.statusCode));
    await waitFor(() => provider.sendTurn.mock.calls.length >= 1);

    const sid = "mock-session-1";

    // text1 → tool1 → text2 → tool2 → text3
    provider.emit({ type: "token", sessionId: sid, content: "First I'll read the file." });
    provider.emit({ type: "tool.start", sessionId: sid, tool: "read_file", args: { path: "/a.txt" }, callId: "c1" });
    provider.emit({ type: "tool.result", sessionId: sid, tool: "read_file", ok: true, message: "contents of a", callId: "c1" });

    provider.emit({ type: "token", sessionId: sid, content: "Now let me write the output." });
    provider.emit({ type: "tool.start", sessionId: sid, tool: "write_file", args: { path: "/b.txt" }, callId: "c2" });
    provider.emit({ type: "tool.result", sessionId: sid, tool: "write_file", ok: true, message: "written", callId: "c2" });

    provider.emit({ type: "token", sessionId: sid, content: "All done!" });
    provider.emit({ type: "turn.completed", sessionId: sid });

    await new Promise((r) => setTimeout(r, 100));

    const activities = threadService.getActivities(thread.id).reverse();
    const assistantMessages = activities.filter(
      (a) => a.kind === "message" && (a.payload as { role?: string })?.role === "assistant",
    );

    // Should have 3 assistant messages: before tool1, between tools, after tool2
    __jait_capture(2, (assistantMessages.length));
    __jait_capture(3, ((assistantMessages[0]!.payload as { content: string }).content));
    __jait_capture(4, ((assistantMessages[1]!.payload as { content: string }).content));
    __jait_capture(5, ((assistantMessages[2]!.payload as { content: string }).content));

    await app.close();
    sqlite.close();
  
})();

} finally {
await __jait_hook_9697();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
