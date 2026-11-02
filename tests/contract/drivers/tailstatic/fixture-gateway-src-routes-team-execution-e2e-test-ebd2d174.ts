// Translated fixture from packages/gateway/src/routes/team-execution.e2e.test.ts; expected literals are in tail_static.rs.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createThreadControlTool } from "../../../../packages/gateway/src/tools/thread-tools.js";
import { JaitProvider } from "../../../../packages/gateway/src/providers/jait-provider.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";

import type { ToolResult } from "../../../../packages/gateway/src/tools/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/team-execution.e2e.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_108_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    scripted.push(stream(toolReply("team_chat", { action: "send", roomId, kind: "result", recipientIds: ["Coordinator"],
      content: "Fixture verified: regression passed.", clientKey: "fixture-result" })), stream(finalReply));
    const first = await post("one-assignment"); __jait_capture(1, (first.statusCode));
    const duplicate = await post("one-assignment"); __jait_capture(2, (duplicate.json().message.id), (first.json().message.id));
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "completed", "delivery completion");
    const state = await snapshot(); const delivery = state.deliveries[0]; const thread = threads.getById(delivery.sessionId)!;
    __jait_capture(3, (thread.personaAgentId)); __jait_capture(4, (thread.status));
    __jait_capture(5, (state.deliveries)); __jait_capture(6, (threads.list(userId)));
    __jait_captureType(7, (sessions.getById(thread.id, userId)));
    const results = state.messages.filter((message: any) => message.kind === "result");
    __jait_capture(8, (results));
    __jait_capture(9, (results[0]), ({ sender: { kind: "agent", id: "Developer", sourceSessionId: thread.id }, workThreadId: thread.id }));
    __jait_capture(10, (requests)); __jait_capture(11, (scripted));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_124_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    scripted.push(new Response(JSON.stringify({ error: { message: "Fixture quota exhausted" } }), { status: 429 }));
    await post("quota");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "failed", "quota blocker");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    __jait_capture(1, (thread.status)); __jait_capture(2, (thread.error));
    __jait_capture(3, (state.messages.filter((message: any) => message.kind === "result")));
    const blocked = state.messages.filter((message: any) => message.kind === "blocked");
    __jait_capture(4, (blocked)); __jait_capture(5, (blocked[0].recipientIds));
    __jait_capture(6, (blocked[0].workThreadId), (thread.id));
    __jait_capture(7, (requests));
    await (app as any).recoverInterruptedThreadTurns(); __jait_capture(8, (requests));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_138_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    for (const [i, name] of ["lookup", "repair", "verify"].entries()) {
      fixtureTool(`fixture.${name}`, { ok: false, message: "fatal: not a git repository: /host/.git" });
      scripted.push(stream(toolReply(`fixture_${name}`, { attempt: i }, `failure-${i}`)));
    }
    // An unresolved dependency parks the worker; it cannot be repaired by a duplicate manager turn.
    await post("bounded-failure");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "blocked", "execution guard");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    __jait_capture(1, (state.deliveries));
    __jait_capture(2, (executed)); __jait_capture(3, (requests));
    __jait_capture(4, (thread.status)); __jait_capture(5, (thread.error));
    __jait_capture(6, (threads.getExecutionCheckpoint(thread.id)?.calls));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_153_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    const dependency: ToolResult = { ok: false, message: "fatal: not a git repository: /fixture/.git" };
    fixtureTool("fixture.dependency", dependency);
    for (let i = 0; i < 3; i++) scripted.push(stream(toolReply("fixture_dependency", { attempt: i }, `blocked-${i}`)));
    await post("repairable-task");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "blocked", "parked task");
    const first = await snapshot();
    const id = first.deliveries[0].sessionId;
    __jait_captureType(1, (threads.getById(id)?.providerSessionId));

    dependency.ok = true;
    dependency.message = "Dependency repaired; original task succeeded.";
    scripted.push(stream(toolReply("fixture_dependency", { attempt: 4 }, "repaired")), stream(finalReply));
    const resumed = await app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
      payload: { content: "Dependency repaired. Resume the original task and finish it.", kind: "assignment",
        recipientIds: ["Developer"], targetSessionId: id, clientKey: "resume-repaired-task" } });
    __jait_capture(2, (resumed.statusCode));
    await eventually(() => threads.getById(id)?.status === "completed", "same task completed");
    __jait_capture(3, (opened.sqlite.prepare("SELECT count(*) AS n FROM agent_threads").get()));
    __jait_capture(4, (executed));
    __jait_capture(5, (requests));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_176_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    fixtureTool("fixture.read", { ok: true, message: "Read complete", data: { content: "Unchanged fixture content" } });
    for (let i = 0; i < 40; i++) scripted.push(stream(toolReply("fixture_read", { attempt: i }, `read-${i}`)));
    // No-progress work is parked without spending another model turn on the same loop.
    await post("no-progress");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "blocked", "no-progress cutoff");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    __jait_capture(1, (state.deliveries));
    __jait_capture(2, (executed)); __jait_capture(3, (requests));
    __jait_capture(4, (thread.error));
    __jait_capture(5, (state.messages.filter((message: any) => message.kind === "blocked")));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_189_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    registry.register({ ...createThreadControlTool({ threadService: threads, providerRegistry: providers }), tier: "core" });
    scripted.push(stream(toolReply("thread_control", { action: "create", title: "Relay helper", message: "Post my result to the team" })), stream(finalReply));
    await post("no-relay-helper");
    await eventually(async () => (await snapshot()).deliveries[0]?.status === "completed", "relay restriction");
    const state = await snapshot(); const thread = threads.getById(state.deliveries[0].sessionId)!;
    const result = threads.getActivities(thread.id).find(activity => activity.kind === "tool.error");
    __jait_capture(1, (result?.summary));
    __jait_capture(2, (threads.list(userId))); __jait_capture(3, (requests));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_execution_e2e_test_ts_200_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const FIXTURE_URL = "http://scripted-provider.invalid/v1";
const toolReply = (name: string, args: unknown, id = "fixture-call") => ({
  choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }],
});
const finalReply = { choices: [{ delta: { content: "Fixture task finished." }, finish_reason: "stop" }] };
const stream = (reply: unknown) => new Response(`data: ${JSON.stringify(reply)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
async function eventually(check: () => Promise<boolean> | boolean, label: string) {
  // A full native turn (two provider rounds + SQLite writes) can exceed 5s when the
  // whole gateway suite runs in parallel; the budget is a load guard, not the assertion.
  const deadline = Date.now() + 20_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let threads: ThreadService;
let sessions: SessionService;
let providers: ProviderRegistry;
let native: JaitProvider;
let registry: ToolRegistry;
let headers: { authorization: string };
let roomId: string;
let root: string;
let userId: string;
let scripted: Response[];
let requests: Array<Record<string, unknown>>;
let executed: string[];
let originalFetch: typeof fetch;
const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: "test", logLevel: "silent",
    openaiBaseUrl: FIXTURE_URL, openaiApiKey: "fixture-only", openaiModel: "fixture-model" };
const snapshot = async () => (await app.inject({ method: "GET", url: `/api/team-rooms/${roomId}`, headers })).json();
const post = (key: string) => app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
    payload: { content: "Developer, implement the fixture and post the result using team.chat.", kind: "assignment", recipientIds: ["Developer"], clientKey: key } });
function fixtureTool(name: string, result: ToolResult) {
    registry.register({ name, description: "Deterministic fixture adapter", tier: "core", risk: "low", defaultConsentLevel: "none",
      parameters: { type: "object", properties: { attempt: { type: "number" } } },
      execute: async () => { executed.push(name); return result; } });
  }
const __jait_hook_3304 = async () => {
    const artifacts = resolve(dirname(fileURLToPath(__jait_original_url)), "../../../../.jait/artifacts");
    mkdirSync(artifacts, { recursive: true });
    root = mkdtempSync(join(artifacts, "jait-execution-e2e-"));
    scripted = []; requests = []; executed = [];
    originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, options: RequestInit) => {
      // Fail closed: this suite cannot contact a real model or any other host.
      if (String(url) !== `${FIXTURE_URL}/chat/completions`) throw new Error(`Unexpected network request: ${String(url)}`);
      requests.push(JSON.parse(String(options.body)));
      const response = scripted.shift();
      if (!response) throw new Error("Script exhausted: unexpected additional provider round");
      return response;
    }));
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    threads = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    const users = new UserService(opened.db); const user = users.createUser("Fixture Owner", "test-password"); userId = user.id;
    users.updateSettings(user.id, { jaitBackend: "openai", apiKeys: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: FIXTURE_URL, OPENAI_MODEL: "fixture-model" } });
    headers = { authorization: `Bearer ${await signAuthToken(user, config.jwtSecret)}` };
    for (const id of ["Coordinator", "Developer", "QA"]) threads.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, role: id, reportsToId: id === "Coordinator" ? null : "Coordinator", persona: "Fixture role", avatar: "Nova", paused: false, providerId: "jait", model: "fixture-model", requiresApproval: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
    }));
    registry = new ToolRegistry(); providers = new ProviderRegistry();
    native = new JaitProvider({ config, threadService: threads, userService: users, toolRegistry: registry });
    providers.register(native);
    app = await createServer(config, { db: opened.db, threadService: threads, sessionService: sessions, userService: users,
      providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    registry.register({ ...registry.get("team.chat")!, tier: "core" });
    const source = sessions.create({ userId, name: "User chat", projectPath: root });
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: source.id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_6055 = async () => {
    await app?.close(); opened?.sqlite.close();
    globalThis.fetch = originalFetch; vi.unstubAllGlobals();
    if (root) rmSync(root, { recursive: true, force: true });
  };
await __jait_hook_3304();
try {
await (async()=>{

    const thread = threads.create({ userId, personaAgentId: "Developer", title: "Recovery fixture", providerId: "jait", model: "fixture-model", kind: "delivery", workingDirectory: root });
    threads.addActivity(thread.id, "message", "original", { role: "user", content: "Implement parser recovery." });
    threads.addActivity(thread.id, "message", "steering", { role: "user", content: "Only change parser.ts; preserve its API." });
    threads.addActivity(thread.id, "execution.checkpoint", "saved limits", { calls: 2, windowCalls: 2, evidence: [], failures: { "Git metadata unavailable": 2 } });
    threads.markRunning(thread.id, "lost-provider-session"); threads.queueRestartRecovery();
    fixtureTool("fixture.verify", { ok: false, message: "fatal: not a git repository: /host/.git" });
    scripted.push(stream(toolReply("fixture_verify", { attempt: 3 }, "recovery-failure")));
    await (app as any).recoverInterruptedThreadTurns();
    await eventually(() => threads.getById(thread.id)?.status === "blocked", "recovered failure limit");
    __jait_capture(1, (threads.list(userId))); __jait_capture(2, (executed)); __jait_capture(3, (requests));
    const outbound = JSON.stringify(requests[0]);
    __jait_capture(4, (outbound));
    __jait_capture(5, (outbound));
    __jait_capture(6, (threads.getById(thread.id)?.routingPlan?.intent));
    __jait_capture(7, (threads.getExecutionCheckpoint(thread.id)?.calls));
    await (app as any).recoverInterruptedThreadTurns(); __jait_capture(8, (requests));
  
})();

} finally {
await __jait_hook_6055();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
