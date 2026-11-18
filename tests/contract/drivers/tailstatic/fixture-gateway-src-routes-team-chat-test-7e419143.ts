// Translated fixture from packages/gateway/src/routes/team-chat.test.ts; expected literals are in tail_static.rs.

import { messages } from "../../../../packages/gateway/src/db/schema.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { __chatTestUtils, getPersonaChatRuntime } from "../../../../packages/gateway/src/routes/chat.js";
import { EventEmitter } from "node:events";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";

import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/team-chat.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_83_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const create = (name: string, memberIds: string[]) => app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { name, memberIds } });
    const first = await create("Implementation", ["Developer", "QA"]);
    const second = await create("Review", ["Developer"]);
    __jait_capture(1, (first.statusCode)); __jait_capture(2, (second.statusCode));
    __jait_capture(3, (first.json().room.id), (second.json().room.id));
    const snapshot = await app.inject({ method: "GET", url: "/api/team-rooms/" + second.json().room.id, headers });
    __jait_capture(4, (snapshot.json().members.map((agent: { id: string }) => agent.id)));
    __jait_capture(5, ((await create("Invalid", ["missing"])).statusCode));
    __jait_capture(6, ((await create("Empty", [])).statusCode));
    __jait_capture(7, ((await app.inject({ method: "POST", url: "/api/team-rooms", payload: { name: "No auth", memberIds: ["Developer"] } })).statusCode));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_96_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const response = await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Developer, implement the fix", clientKey: "automatic", attachments: [{ name: "notes.txt", mimeType: "text/plain", data: "bm90ZXM=" }] } });
    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.json().message.recipientIds));
    __jait_capture(3, (response.json().message.attachments[0].name));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_104_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const session = sessions.create({ userId: user.id, name: "Mixed identities" });
    const send = (id: string) => app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: "Check this", personaAgentId: id, provider: "jait", model: "wrong-model", runtimeMode: "full-access" } });
    const response = await send("Developer");
    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.body));
    __jait_capture(3, (provider.startSession.mock.calls[0]?.[0]));
    __jait_capture(4, (provider.sendTurn.mock.calls[0]?.[1]));
    await send("Developer");
    __jait_capture(5, (provider.startSession.mock.calls));
    await send("QA");
    __jait_capture(6, (provider.startSession.mock.calls));
    __jait_capture(7, (provider.sendTurn.mock.calls[2]?.[1]));
    const profiles = new ThreadService(opened.db);
    const saved = personaAgentProfileSchema.parse(profiles.getPersonaAgent("QA", user.id));
    profiles.savePersonaAgent(user.id, { ...saved, name: "Renamed QA", persona: "New QA instructions" });
    await send("QA");
    __jait_capture(8, (provider.startSession.mock.calls));
    __jait_capture(9, (provider.sendTurn.mock.calls[3]?.[1]));
    const rows = opened.db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    const assistantSnapshots = rows.filter(row => row.role === "assistant").map(row => JSON.parse(row.persona!));
    __jait_capture(10, (assistantSnapshots.map(item => item.name)));
    const history = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/messages?limit=50`, headers });
    __jait_capture(11, (history.json().messages.filter((item: {role: string}) => item.role === "assistant").map((item: {persona: {name: string}}) => item.persona.name)));
    __jait_capture(12, (getPersonaChatRuntime(user.id, "QA")));
    await app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: "Back to ordinary assistant", personaAgentId: null, provider: "codex", model: "saved-model", runtimeMode: "supervised" } });
    __jait_capture(13, (provider.startSession.mock.calls));
    __jait_capture(14, (provider.sendTurn.mock.calls[4]?.[1]));
    __jait_captureType(15, (JSON.parse(sessions.getById(session.id, user.id)!.metadata!).chatPersonaAgentId));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_137_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const session = sessions.create({ userId: user.id, name: "Validation" });
    const profiles = new ThreadService(opened.db);
    const saved = personaAgentProfileSchema.parse(profiles.getPersonaAgent("Developer", user.id));
    profiles.savePersonaAgent(user.id, { ...saved, paused: true });
    const other = users.createUser("other-persona-user", "test-password");
    profiles.savePersonaAgent(other.id, { ...saved, id: "Foreign", reportsToId: null });
    for (const [personaAgentId, status] of [["Developer", 409], ["Foreign", 404], ["Missing", 404], [123, 400]] as const) {
      const response = await app.inject({ method: "POST", url: "/api/chat", headers,
        payload: { sessionId: session.id, content: "Do work", personaAgentId } });
      __jait_capture(1, (response.statusCode), (status));
    }
    __jait_capture(2, (provider.startSession.mock.calls));
    __jait_capture(3, (opened.db.select().from(messages).where(eq(messages.sessionId, session.id)).all()));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_153_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const session = sessions.create({ userId: user.id, name: "Queue" });
    const state = new SessionStateService(opened.db);
    __chatTestUtils.activeStreams.add(session.id);
    try {
      for (const personaAgentId of ["Developer", "QA"]) {
        const response = await app.inject({ method: "POST", url: "/api/chat", headers,
          payload: { sessionId: session.id, content: "Same queued request", personaAgentId } });
        __jait_capture(1, (response.statusCode));
      }
      const queue = state.get(session.id, ["queued_messages"])["queued_messages"] as Array<{personaAgentId: string}>;
      __jait_capture(2, (queue.map(item => item.personaAgentId)));
      state.set(session.id, { queued_messages: null });
    } finally { __chatTestUtils.activeStreams.delete(session.id); }

  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_170_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const session = sessions.create({ userId: user.id, name: "Interrupted persona work" });
    const state = new SessionStateService(opened.db);
    state.set(session.id, { "chat.activeTurn": {
      turnId: "persona-turn-before-outage", startedAt: new Date().toISOString(), mode: "agent", responseStyle: "normal",
      personaAgentId: "QA", provider: "codex", runtimeMode: "full-access", model: "wrong-model",
    } });
    provider.beforeSend = () => {
      __jait_capture(1, (getPersonaChatRuntime(user.id, "QA")));
      __jait_capture(2, (getPersonaChatRuntime("foreign-owner", "QA")));
      __jait_capture(3, (getPersonaChatRuntime(user.id, "Developer")));
      __jait_capture(4, ((state.get(session.id, ["chat.activeTurn"])["chat.activeTurn"] as {personaAgentId: string}).personaAgentId));
    };
    await __jait_captureResolved(5, ((app as typeof app & { recoverInterruptedChatTurns: () => Promise<number> }).recoverInterruptedChatTurns()));
    await vi.waitFor(() => __jait_capture(6, (provider.sendTurn.mock.calls)));
    await vi.waitFor(() => __jait_capture(7, (getPersonaChatRuntime(user.id, "QA"))));
    __jait_capture(8, (provider.startSession.mock.calls[0]?.[0]));
    __jait_capture(9, (provider.sendTurn.mock.calls[0]?.[1]));
    __jait_capture(10, (opened.db.select().from(messages).where(eq(messages.sessionId, session.id)).all().filter(row => row.role === "assistant" && row.persona).map(row => JSON.parse(row.persona!).id)));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_191_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const response = await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Check this ticket", recipientIds: ["Developer"], clientKey: "ticket" } });
    __jait_capture(1, (response.statusCode));
    await vi.waitFor(async () => __jait_capture(2, ((await snapshot()).deliveries[0]?.status)), { timeout: 10_000 });
    __jait_capture(3, (provider.startSession.mock.calls[0]?.[0]));
    __jait_capture(4, (provider.sendTurn.mock.calls[0]?.[1]));
    __jait_capture(5, (provider.sendTurn.mock.calls[0]?.[1]));
    const state = await snapshot();
    __jait_capture(6, (state.messages.at(-1)));
    const workId = state.deliveries[0].sessionId;
    __jait_capture(7, (state.messages.at(-1).workThreadId), (workId));
    __jait_capture(8, (state.deliveries[0]), ({ threadId: workId, threadStatus: "completed" }));
    __jait_captureType(9, (sessions.getById(workId)));
    // Repeating the request creates neither a second message nor work session.
    await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Check this ticket", recipientIds: ["Developer"], clientKey: "ticket" } });
    __jait_capture(10, (provider.startSession.mock.calls));
    // A later handoff to the same conversation must surface its own result.
    await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Retest the change", recipientIds: ["Developer"], targetSessionId: workId, clientKey: "retest" } });
    await vi.waitFor(async () => __jait_capture(11, ((await snapshot()).deliveries.at(-1)?.status)), { timeout: 10_000 });
    __jait_capture(12, ((await snapshot()).messages.filter((message: { kind: string }) => message.kind === "result")));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_216_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    provider.sendTurn.mockImplementation(async () => {});
    await app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
      payload: { content: "Bounded task", recipientIds: ["Developer", "QA", "Scrum"], clientKey: "queue-interrupt" } });
    await vi.waitFor(() => __jait_capture(1, (provider.sendTurn.mock.calls)));
    const first = await snapshot();
    const active = first.deliveries.find((item: { agentId: string }) => item.agentId === "Developer");
    await app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
      payload: { content: "Independent task", recipientIds: ["Developer"], clientKey: "independent" } });
    await vi.waitFor(() => __jait_capture(2, (provider.sendTurn.mock.calls)));
    await app.inject({ method: "POST", url: `/api/team-rooms/${roomId}/messages`, headers,
      payload: { content: "Continue first task", recipientIds: ["Developer"], targetSessionId: active.sessionId,
        clientKey: "thread-queue" } });
    const initial = await snapshot();
    const queued = initial.deliveries.find((item: { status: string }) => item.status === "queued");
    __jait_captureType(3, (queued));
    __jait_capture(4, (queued.sessionId), (active.sessionId));
    const independent = initial.deliveries.find((item: { agentId: string; sessionId: string; status: string }) =>
      item.agentId === "Developer" && item.sessionId !== active.sessionId && item.status === "running");
    __jait_captureType(5, (independent));
    __jait_capture(6, (provider.sendTurn.mock.calls));
    const result = await app.inject({ method: "POST", url: `/api/threads/${active.sessionId}/interrupt`, headers });
    __jait_capture(7, (result.statusCode));
    await vi.waitFor(async () => __jait_capture(8, ((await snapshot()).deliveries.find((item: { id: string }) => item.id === queued.id)?.status)));
    __jait_capture(9, ((await snapshot()).deliveries.find((item: { id: string }) => item.id === independent.id)?.status));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_243_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    provider.progressContent = "I'll begin checking the ticket.";
    await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Check ticket", recipientIds: ["Developer"], clientKey: "latest-answer" } });
    await vi.waitFor(async () => __jait_capture(1, ((await snapshot()).deliveries[0]?.status)), { timeout: 10_000 });
    __jait_capture(2, ((await snapshot()).messages.at(-1).content));

    provider.progressContent = undefined;
    provider.replyContent = "";
    await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Check empty completion", recipientIds: ["Developer"], clientKey: "empty-answer" } });
    await vi.waitFor(async () => __jait_capture(3, ((await snapshot()).deliveries.find((item: {agentId: string; status: string; error?: string}) =>
      item.agentId === "Developer" && item.status === "failed")?.error)), { timeout: 10_000 });
    // Recovery launches the manager too; await its terminal state before teardown.
    await vi.waitFor(async () => __jait_capture(4, ((await snapshot()).deliveries.every((item: {status: string}) =>
      !["queued", "running"].includes(item.status)))), { timeout: 10_000 });
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_261_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    const source = sessions.create({ userId: user.id, name: "Developer Chat" });
    const tool = registry.get("team.chat")!;
    const context = { userId: user.id, sessionId: source.id, projectRoot: process.cwd(), actionId: "relay" };
    __jait_capture(1, ((await tool.execute({ action: "send", roomId, content: "Use the board", recipientIds: [] }, context)).ok));
    const state = await snapshot();
    __jait_capture(2, (state.messages[0]), ({ content: "Use the board", sender: { kind: "chat", name: "Developer Chat", avatar: null, sourceSessionId: source.id } }));
    __jait_capture(3, ((await tool.execute({ action: "send", roomId, content: "" }, context)).ok));
    const privateChat = sessions.create({ userId: "another-user" });
    __jait_capture(4, ((await tool.execute({ action: "send", roomId, content: "Spoof" }, { ...context, sessionId: privateChat.id })).ok));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_team_chat_test_ts_273_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  beforeSend?: () => void;
  progressContent?: string;
  replyContent = "Work checked and ready.";
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
    setTimeout(() => {
      if (this.progressContent) this.events.emit("event", { type: "message", sessionId, role: "assistant", content: this.progressContent });
      if (this.replyContent) this.events.emit("event", { type: "token", sessionId, content: this.replyContent });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  interruptTurn = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let app: Awaited<ReturnType<typeof createServer>>;
let users: UserService;
let sessions: SessionService;
let user: ReturnType<UserService["createUser"]>;
let headers: { authorization: string };
let provider: TeamProvider;
let registry: ToolRegistry;
let roomId: string;
const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();
const __jait_hook_2929 = async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    __jait_capture(0, (created.statusCode)); roomId = created.json().room.id;
  };
const __jait_hook_4498 = async () => { await app.close(); opened.sqlite.close(); };
await __jait_hook_2929();
try {
await (async()=>{

    __jait_capture(1, ((await app.inject({ method: "GET", url: "/api/team-rooms" })).statusCode));
    const other = users.createUser("Other", "test-password");
    const otherHeaders = { authorization: "Bearer " + await signAuthToken(other, config.jwtSecret) };
    __jait_capture(2, ((await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers: otherHeaders })).statusCode));
    const bad = await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Bad target", clientKey: "invalid", recipientIds: ["foreign-agent"] } });
    __jait_capture(3, (bad.statusCode));
    __jait_capture(4, ((await snapshot()).deliveries));
  
})();

} finally {
await __jait_hook_4498();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
