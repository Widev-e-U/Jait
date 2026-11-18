// Translated fixture from packages/gateway/src/services/team-chat.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { TeamChatService, rankTeamRecipients } from "../../../../packages/gateway/src/services/team-chat.js";
import { createTeamChatTool } from "../../../../packages/gateway/src/tools/team-chat-tools.js";

import * as uuidIds from "../../../../packages/gateway/src/db/uuidv7.js";
import * as systemOne from "../../../../packages/gateway/src/services/system-one.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/team-chat.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_41_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const members = Array.from({ length: 7 }, (_, i) => "Worker" + i);
    for (const id of members) profiles.savePersonaAgent(owner, profile(id));
    const selected = service.createRoom(owner, { name: "All workers", memberIds: members });
    const releases: Array<() => void> = [];
    const dispatch = vi.fn((_delivery: unknown, _agent: unknown, _prompt: string) => new Promise<{ content: string }>(resolve => {
      releases.push(() => resolve({ content: "Done" }));
    }));
    service.setDispatcher(dispatch);
    try {
      service.post(owner, selected.id, { content: "Work", clientKey: "all", sender: human, recipientIds: members });
      const firstThread = service.deliveries(owner, selected.id).find(d => d.agentId === members[0])!.sessionId;
      service.post(owner, selected.id, { content: "Independent task", clientKey: "independent", sender: human, recipientIds: [members[0]!] });
      __jait_capture(0, (dispatch.mock.calls));
      service.post(owner, selected.id, { content: "Follow up", clientKey: "follow-up", sender: human,
        recipientIds: [members[0]!], targetSessionId: firstThread });
      __jait_capture(1, (dispatch.mock.calls));
      __jait_capture(2, (service.deliveries(owner, selected.id).filter(d => d.status === "running")));
      __jait_capture(3, (service.deliveries(owner, selected.id).filter(d => d.status === "queued")));
      // Multiple continuations stay in FIFO order without blocking the independent task.
      service.post(owner, selected.id, { content: "Second follow up", clientKey: "follow-up-2", sender: human,
        recipientIds: [members[0]!], targetSessionId: firstThread });
      __jait_capture(4, (dispatch.mock.calls));
      releases[0]!();
      await vi.waitFor(() => __jait_capture(5, (dispatch.mock.calls)));
      __jait_capture(6, (dispatch.mock.calls.at(-1)?.[2]));
      __jait_capture(7, (service.deliveries(owner, selected.id).filter(d => d.status === "queued")));
      releases[8]!();
      await vi.waitFor(() => __jait_capture(8, (dispatch.mock.calls)));
      __jait_capture(9, (dispatch.mock.calls.at(-1)?.[2]));
      __jait_capture(10, (service.deliveries(owner, selected.id).filter(d => d.status === "queued")));
    } finally {
      service.close();
      for (const release of releases) release();
      await Promise.resolve();
    }
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_79_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const dispatch = vi.fn(async () => { throw new Error("Execution blocked: Required executable unavailable persisted after two retries."); });
    service.setDispatcher(dispatch);
    post("Implement fix", "blocked-env", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id)[0]?.status)));
    __jait_capture(1, (dispatch.mock.calls));
    __jait_capture(2, (service.history(owner, room.id).filter(message => message.kind === "review")));
    __jait_capture(3, (service.history(owner, room.id).some(message => message.kind === "blocked")));
    service.close();
    const reopened = new TeamChatService(opened.db, sessions, profiles);
    __jait_capture(4, (reopened.deliveries(owner, room.id)[0]?.status));
    reopened.close();
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_93_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const first = service.createRoom(owner, { name: "Implementation", memberIds: ["Developer", "Research"] });
    const second = service.createRoom(owner, { name: "Review", memberIds: ["Developer", "QA"] });
    __jait_capture(0, (first.id), (second.id));
    __jait_capture(1, (service.list(owner).map(room => room.id)), ([room.id,first.id,second.id]));
    __jait_capture(2, (service.ensureRoom(owner, "Developer").id), (room.id));
    __jait_capture(3, (service.roomMembers(owner, first.id).map(agent => agent.id).sort()));
    service.post(owner, first.id, { content: "Investigate", clientKey: "same-key", sender: human, recipientIds: [] });
    service.post(owner, second.id, { content: "Review", clientKey: "same-key", sender: human, recipientIds: [] });
    __jait_capture(4, (service.history(owner, first.id).map(message => message.content)));
    __jait_capture(5, (service.history(owner, second.id).map(message => message.content)));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    __jait_capture(6, (service.roomMembers(owner, first.id).map(agent => agent.id)));
    __jait_capture(7, (service.roomMembers(owner, second.id).map(agent => agent.id)));
    const reopened = new TeamChatService(opened.db, sessions, profiles);
    __jait_capture(8, (reopened.get(owner, first.id).memberIds));
    reopened.close();
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_112_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    profiles.savePersonaAgent("other", profile("Foreign"));
    __jait_thrown(0, () => service.createRoom(owner, { name: "", memberIds: ["QA"] }));
    __jait_thrown(1, () => service.createRoom(owner, { name: "Empty", memberIds: [] }));
    __jait_thrown(2, () => service.createRoom(owner, { name: "Foreign", memberIds: ["Foreign"] }));
    const selected = service.createRoom(owner, { name: "Selected", memberIds: ["Developer", "Research", "Research"] });
    __jait_capture(3, (selected.memberIds));
    __jait_thrown(4, () => service.get("other", selected.id));
    __jait_capture(5, (service.list("other")));
    __jait_thrown(6, () => service.post(owner, selected.id, { content: "QA review", clientKey: "outside", sender: human, recipientIds: ["QA"] }));
    __jait_thrown(7, () => service.post(owner, selected.id, { content: "Joining", clientKey: "sender", sender: sender("Scrum") }));
    const routed = await service.postRouted(owner, selected.id, { content: "Research this", clientKey: "routing", sender: human });
    __jait_capture(8, (routed.recipientIds));
    const delivery = service.deliveries(owner, selected.id)[0]!;
    __jait_capture(9, (service.context(owner, delivery.sessionId)));
    __jait_capture(10, (service.context(owner, delivery.sessionId)), (selected.id));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_130_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["PR merged"], human);
    const evidence = "Tests pass; PR not merged. See the evidence in the task thread.";
    const dispatcher = vi.fn(async (_delivery, agent, _prompt: string) => ({ content: agent.id === "Developer" ? evidence : "I'll check the PR." }));
    service.setDispatcher(dispatcher);
    post("Implement", "conversational-worker", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (dispatcher.mock.calls)));
    const review = service.history(owner, room.id).find(message => message.coordinationEvent?.kind === "completion")!;
    __jait_capture(1, (review.content));
    __jait_capture(2, (review.content), (evidence));
    __jait_capture(3, (review.workThreadId), (service.deliveries(owner, room.id)[0]!.sessionId));
    __jait_capture(4, (dispatcher.mock.calls[1]?.[2]));
    __jait_capture(5, (dispatcher.mock.calls[1]?.[2]), (evidence));
    __jait_capture(6, (service.get(owner, room.id).goal?.status));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_146_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const report = "## Findings\\n" + "Tests could not run; the change remains unverified. ".repeat(30);
    service.setDispatcher(async () => ({ content: report }));
    post("Investigate", "detailed-report", ["QA"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id)[0]?.status)));
    const result = service.history(owner, room.id).find(message => message.kind === "result")!;
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.workThreadId), (service.deliveries(owner, room.id)[0]!.sessionId));
    __jait_capture(3, (result.content));
    __jait_capture(4, (result.content));
    __jait_capture(5, (result.content));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_159_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const dispatcher = vi.fn(async (_delivery, agent, _prompt: string) => {
      if (agent.id === "Developer") throw new Error("Runtime missing: bun");
      return { content: "I'll check the runtime." };
    });
    service.setDispatcher(dispatcher);
    post("Run the checks", "conversational-recovery", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (dispatcher.mock.calls)));
    const review = service.history(owner, room.id).find(message => message.coordinationEvent?.kind === "recovery")!;
    __jait_capture(1, (review.content));
    __jait_capture(2, (review.workThreadId), (service.deliveries(owner, room.id)[0]!.sessionId));
    __jait_capture(3, (dispatcher.mock.calls[1]?.[2]));
    __jait_capture(4, (dispatcher.mock.calls[1]?.[2]));
    __jait_capture(5, (dispatcher.mock.calls[1]?.[2]));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_175_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    profiles.savePersonaAgent(owner, profile("Junior", "Developer"));
    const rootContext = service.context(owner, "", profile("Scrum"))!;
    const managerContext = service.context(owner, "", profile("Developer", "Scrum"))!;
    const juniorContext = service.context(owner, "", profile("Junior", "Developer"))!;
    __jait_capture(0, (rootContext));
    __jait_capture(1, (managerContext));
    __jait_capture(2, (managerContext));
    __jait_capture(3, (managerContext));
    __jait_capture(4, (juniorContext));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_187_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    __jait_capture(0, (service.context(owner, "", profile("Developer", "Scrum"))));
    profiles.savePersonaAgent(owner, profile("Junior", "Developer"));
    __jait_capture(1, (service.context(owner, "", profile("Developer", "Scrum"))));
    profiles.savePersonaAgent(owner, profile("Junior", "QA"));
    __jait_capture(2, (service.context(owner, "", profile("Developer", "Scrum"))));
    __jait_capture(3, (service.context(owner, "", profile("QA", "Scrum"))));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_196_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    post("Coordinate delivery", "manager-start", ["Scrum"]);
    const managerThread = service.deliveries(owner, room.id)[0]!.sessionId;
    post("Implement", "worker-start", ["Developer"]);
    const worker = service.deliveries(owner, room.id)[1]!;
    const outcome = { sender: { ...sender("Developer"), sourceSessionId: worker.sessionId },
      kind: "result" as const, content: "Local tests pass; PR still missing.", recipientIds: [],
      clientKey: "worker-outcome", workSessionId: worker.sessionId };
    service.post(owner, room.id, outcome);
    service.post(owner, room.id, outcome);
    const checks = service.history(owner, room.id).filter(message => message.coordinationEvent?.kind === "completion");
    __jait_capture(0, (checks));
    __jait_capture(1, (checks[0]!.recipientIds));
    __jait_capture(2, (checks[0]!.targetSessionId), (managerThread));
    __jait_capture(3, (service.deliveries(owner, room.id)));
    __jait_capture(4, (service.get(owner, room.id).goal?.status));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_215_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    let parent = post("Implement", "deep-worker", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    for (let depth = 1; depth < 33; depth++) parent = service.post(owner, room.id, {
      content: "Progress " + depth, clientKey: "progress-" + depth, sender: sender("Developer"),
      recipientIds: [], parentMessageId: parent.id,
    });
    const outcome = service.post(owner, room.id, {
      sender: { ...sender("Developer"), sourceSessionId: delivery.sessionId }, kind: "result",
      content: "Tests pass", clientKey: "deep-result", recipientIds: [], parentMessageId: parent.id,
    });
    service.post(owner, room.id, {
      sender: { ...sender("Developer"), sourceSessionId: delivery.sessionId }, kind: "verification",
      content: "More evidence", clientKey: "deep-verify", recipientIds: [], parentMessageId: outcome.id,
    });
    const reviews = service.history(owner, room.id).filter(message => message.kind === "review");
    __jait_capture(0, (reviews));
    __jait_capture(1, (reviews[0]), ({ parentMessageId: outcome.id, depth: 0,
      coordinationEvent: { kind: "completion", deliveryId: delivery.id } }));
    __jait_thrown(2, () => service.post(owner, room.id, { sender: sender("Developer"), kind: "assignment",
      content: "Another handoff", recipientIds: ["QA"], parentMessageId: outcome.id, clientKey: "still-bounded" }));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_239_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    post("Implement", "crash-worker", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    const hook = vi.spyOn(service as unknown as { requestCompletionCheck: () => void }, "requestCompletionCheck").mockImplementation(() => {});
    service.post(owner, room.id, { sender: { ...sender("Developer"), sourceSessionId: delivery.sessionId },
      kind: "result", content: "Tests pass", clientKey: "committed-outcome", recipientIds: [] });
    hook.mockRestore();
    opened.sqlite.prepare("UPDATE team_room_deliveries SET status = 'completed' WHERE id = ?").run(delivery.id);
    service.close();
    const restored = new TeamChatService(opened.db, sessions, profiles);
    try {
      await restored.recover();
      await restored.recover();
      __jait_capture(0, (restored.history(owner, room.id).filter(message => message.kind === "review")));
      __jait_capture(1, (restored.deliveries(owner, room.id).filter(item => item.agentId === "Scrum")));
      __jait_capture(2, (restored.get(owner, room.id).goal?.status));
    } finally { restored.close(); }
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_259_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    let parent = post("Start", "deep-failure-root", []);
    for (let depth = 1; depth < 32; depth++) parent = service.post(owner, room.id, {
      content: "Progress", clientKey: "failure-progress-" + depth, sender: sender("Developer"),
      recipientIds: [], parentMessageId: parent.id,
    });
    service.post(owner, room.id, { content: "Implement", clientKey: "deep-failed-work", sender: sender("Scrum"),
      kind: "assignment", recipientIds: ["Developer"], parentMessageId: parent.id });
    const delivery = service.deliveries(owner, room.id)[0]!;
    opened.sqlite.prepare("UPDATE team_room_deliveries SET status = 'failed', error = 'Provider request failed' WHERE id = ?").run(delivery.id);
    service.close();
    const restored = new TeamChatService(opened.db, sessions, profiles);
    try {
      await restored.recover();
      await restored.recover();
      __jait_capture(0, (restored.deliveries(owner, room.id).filter(item => item.agentId === "Developer")));
      const reviews = restored.history(owner, room.id).filter(message => message.kind === "review");
      __jait_capture(1, (reviews));
      __jait_capture(2, (reviews[0]), ({ depth: 0, coordinationEvent: { kind: "recovery", deliveryId: delivery.id } }));
    } finally { restored.close(); }
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_281_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    post("Implement", "old-turn", ["Developer"]);
    const first = service.deliveries(owner, room.id)[0]!;
    service.post(owner, room.id, { sender: { ...sender("Developer"), sourceSessionId: first.sessionId },
      kind: "result", content: "First result", clientKey: "first-result", recipientIds: [] });
    service.post(owner, room.id, { sender: human, content: "Continue", clientKey: "new-turn",
      recipientIds: ["Developer"], targetSessionId: first.sessionId });
    const second = service.deliveries(owner, room.id).filter(item => item.agentId === "Developer").at(-1)!;
    service.close();
    const restored = new TeamChatService(opened.db, sessions, profiles);
    try {
      await restored.recover();
      const reviews = restored.history(owner, room.id).filter(message => message.kind === "review");
      __jait_capture(0, (reviews));
      __jait_capture(1, (reviews[0]), ({ coordinationEvent: { deliveryId: first.id } }));
      __jait_capture(2, (reviews[0]), ({ coordinationEvent: { deliveryId: second.id } }));
    } finally { restored.close(); }
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_301_3_each0": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
/*__jait_scope_open__*/{
const outcome = "success";
await __jait_hook_1399();
try {
await (async()=>{

    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    service.setDispatcher(async () => { await completed;
      if (outcome === "failure") throw new Error("Late provider error");
      return { content: "Late answer" };
    });
    post("Implement", "stopped-late", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    opened.sqlite.prepare("UPDATE team_room_deliveries SET status = 'cancelled', error = 'Stopped by user' WHERE id = ?").run(delivery.id);
    finish();
    // Flush the real dispatch continuation and its finally/pump path.
    await completed;
    await new Promise(resolve => setTimeout(resolve, 20));
    __jait_capture(0, (service.deliveries(owner, room.id)[0]));
    __jait_capture(1, (service.deliveries(owner, room.id)));
    __jait_capture(2, (service.history(owner, room.id).filter(message => ["result", "blocked", "review"].includes(message.kind))));
  
})();

} finally {
await __jait_hook_1987();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_301_3_each1": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
/*__jait_scope_open__*/{
const outcome = "failure";
await __jait_hook_1399();
try {
await (async()=>{

    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    service.setDispatcher(async () => { await completed;
      if (outcome === "failure") throw new Error("Late provider error");
      return { content: "Late answer" };
    });
    post("Implement", "stopped-late", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    opened.sqlite.prepare("UPDATE team_room_deliveries SET status = 'cancelled', error = 'Stopped by user' WHERE id = ?").run(delivery.id);
    finish();
    // Flush the real dispatch continuation and its finally/pump path.
    await completed;
    await new Promise(resolve => setTimeout(resolve, 20));
    __jait_capture(0, (service.deliveries(owner, room.id)[0]));
    __jait_capture(1, (service.deliveries(owner, room.id)));
    __jait_capture(2, (service.history(owner, room.id).filter(message => ["result", "blocked", "review"].includes(message.kind))));
  
})();

} finally {
await __jait_hook_1987();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_320_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    profiles.savePersonaAgent(owner, profile("Junior", "Developer"));
    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    post("Implement", "junior-start", ["Junior"]);
    const worker = service.deliveries(owner, room.id)[0]!;
    service.post(owner, room.id, { sender: { ...sender("Junior"), sourceSessionId: worker.sessionId },
      kind: "verification", content: "Acceptance evidence", recipientIds: [], clientKey: "junior-outcome" });
    __jait_capture(0, (service.deliveries(owner, room.id).at(-1)?.agentId));
    __jait_capture(1, (service.history(owner, room.id).at(-1)?.content));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_331_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["PR merged"], human);
    const dispatcher = vi.fn(async (_delivery, agent) => ({ content: agent.id === "Developer" ?
      "Tests pass; PR not merged." : "Not yet complete: PR and independent review remain." }));
    service.setDispatcher(dispatcher);
    post("Implement", "dispatcher-worker", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (dispatcher.mock.calls)));
    await vi.waitFor(() => __jait_capture(1, (service.deliveries(owner, room.id).every(delivery => delivery.status === "completed"))));
    __jait_capture(2, (service.get(owner, room.id).goal?.status));
    __jait_capture(3, (service.history(owner, room.id).filter(message => message.coordinationEvent?.kind === "completion")));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_343_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const selected = service.createRoom(owner, { name: "Worker only", memberIds: ["Developer", "QA"] });
    service.setGoal(owner, selected.id, "Ship", ["Tests pass"], human);
    service.post(owner, selected.id, { sender: human, kind: "assignment", content: "Implement",
      recipientIds: ["Developer"], clientKey: "selected-worker" });
    const worker = service.deliveries(owner, selected.id)[0]!;
    service.post(owner, selected.id, { sender: { ...sender("Developer"), sourceSessionId: worker.sessionId },
      kind: "result", content: "Outcome", recipientIds: [], clientKey: "selected-result" });
    __jait_capture(0, (service.deliveries(owner, selected.id)));
    __jait_capture(1, (service.deliveries(owner, room.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_355_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    service.post(owner, room.id, { sender: sender("Developer"), kind: "result",
      content: "Claim", recipientIds: [], clientKey: "untracked" });
    __jait_capture(0, (service.deliveries(owner, room.id)));
    post("Implement", "worker-start", ["Developer"]);
    const worker = service.deliveries(owner, room.id)[0]!;
    profiles.savePersonaAgent(owner, { ...profile("Scrum"), paused: true });
    const outcome = { sender: { ...sender("Developer"), sourceSessionId: worker.sessionId },
      kind: "result" as const, content: "Outcome", recipientIds: [] };
    service.post(owner, room.id, { ...outcome, clientKey: "paused" });
    __jait_capture(1, (service.deliveries(owner, room.id)));
    profiles.savePersonaAgent(owner, profile("Scrum"));
    service.completeGoal(owner, room.id, ["User accepted"], human);
    service.post(owner, room.id, { ...outcome, clientKey: "completed" });
    __jait_capture(2, (service.deliveries(owner, room.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_373_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    post("Implement ticket", "thread-first", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    const thread = profiles.getById(delivery.sessionId)!;
    __jait_capture(0, (thread));
    __jait_captureType(1, (sessions.getById(delivery.sessionId)));
    __jait_capture(2, (service.sender(owner, thread.id, room.id)));
    __jait_capture(3, (service.context(owner, thread.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_383_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.post(owner, room.id, { content: "Acknowledged", clientKey: "ack",
      sender: sender("Developer"), kind: "discussion", recipientIds: ["Scrum"] });
    __jait_capture(0, (service.deliveries(owner, room.id)));
    __jait_capture(1, (service.history(owner, room.id)[0]!.recipientIds));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_390_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const members = service.members(owner, room.rootAgentId);
    __jait_capture(0, (rankTeamRecipients("Implement a bug fix", members, room.rootAgentId)[0]?.id));
    __jait_capture(1, (rankTeamRecipients("QA, retest acceptance criteria", members, room.rootAgentId)[0]?.id));
    __jait_capture(2, (rankTeamRecipients("What next?", members, room.rootAgentId, "Developer")[0]?.id));
    __jait_capture(3, (rankTeamRecipients("QA retest", members.map(member => ({ ...member, paused: member.id === "QA" })), room.rootAgentId).some(item => item.id === "QA")));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_398_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const input = { content: "Developer, implement the fix", clientKey: "auto", sender: human,
      attachments: [{ name: "evidence.txt", mimeType: "text/plain", data: "ZXZpZGVuY2U=" }] };
    const first = await service.postRouted(owner, room.id, input);
    __jait_capture(0, (first.recipientIds));
    __jait_capture(1, (first.attachments), (input.attachments));
    __jait_capture(2, ((await service.postRouted(owner, room.id, input)).id), (first.id));
    __jait_capture(3, (service.deliveries(owner, room.id)));
    const sessionId = service.deliveries(owner, room.id)[0]!.sessionId;
    const context = service.context(owner, sessionId)!;
    __jait_capture(4, (context));
    __jait_capture(5, (context));
    __jait_capture(6, (context));
    __jait_capture(7, (context));
    __jait_capture(8, (context));
    __jait_capture(9, ((await service.postRouted(owner, room.id, { ...input, clientKey: "passive", sender: sender("Developer"), recipientIds: [] })).recipientIds));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_416_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    service.setDecisionKeys(() => ({ SYSTEM_ONE_BASE_URL: "http://localhost:9999" }));
    const evaluate = vi.spyOn(systemOne, "evaluateDecision");
    try {
      evaluate.mockResolvedValue({ model: "test", answers: { recipient: { type: "choice", choice: "QA", confidence: 0.92 }, reason: { type: "choice", choice: "expertise" } } });
      __jait_capture(0, ((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "system", sender: human })).recipientIds));
      const recorded = service.history(owner, room.id).find(message => message.recipientIds.includes("QA"))!;
      __jait_capture(1, (recorded.routingDecision));
      __jait_capture(2, (recorded.routingDecision?.candidates.find(member => member.id === "Developer")));
      __jait_capture(3, ((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "system", sender: human })).routingDecision), (recorded.routingDecision));
      __jait_capture(4, (evaluate.mock.calls));
      const state = JSON.parse(evaluate.mock.calls[0]![1]);
      __jait_capture(5, (state.hierarchy.find((member: { id: string }) => member.id === "Developer")));
      evaluate.mockResolvedValue({ model: "test", answers: { recipient: { type: "choice", choice: "Research" } } });
      __jait_capture(6, ((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "invalid", sender: human })).recipientIds));
      evaluate.mockRejectedValue(new Error("offline"));
      const fallback = await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "offline", sender: human });
      __jait_capture(7, (fallback.recipientIds));
      __jait_capture(8, (fallback.routingDecision));
      __jait_capture(9, (fallback.routingDecision?.reason));
      __jait_capture(10, ((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "explicit", sender: human, recipientIds: ["Scrum"] })).recipientIds));
      __jait_capture(11, (evaluate.mock.calls));
    } finally { evaluate.mockRestore(); }
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_441_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    let finish!: () => void;
    service.setDispatcher(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { content: "Done" }; });
    post("Work", "closing", ["Developer"]);
    service.close();
    opened.sqlite.close();
    databaseClosed = true;
    finish();
    await new Promise(resolve => setTimeout(resolve, 10));
    // A late database write would reject unhandled and fail this regression.
  
})();
__jait_record({slot:0,completed:true});
} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_453_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    __jait_capture(0, (service.ensureRoom(owner, "QA").id), (room.id));
    __jait_capture(1, (service.members(owner, room.rootAgentId).map(agent => agent.id).sort()));
    profiles.savePersonaAgent(owner, profile("QA", "Research"));
    __jait_capture(2, (service.members(owner, room.rootAgentId).map(agent => agent.id)));
    __jait_capture(3, (service.ensureRoom(owner, "QA").id), (room.id));
    __jait_thrown(4, () => service.get("other", room.id));
    __jait_thrown(5, () => service.post(owner, room.id, { content: "Cross team", clientKey: "foreign", sender: human, recipientIds: ["Research"] }));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_463_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const session = sessions.create({ userId: owner, name: "Developer Chat", projectPath: "/tmp/repo" });
    const tool = createTeamChatTool(service, sessions);
    const context = { sessionId: session.id, userId: owner, actionId: "relay", projectRoot: "/tmp/repo", requestedBy: "agent" };
    const input = { action: "send" as const, agentId: "Developer", content: "Use the Scrum board first.", clientKey: "same-relay" };
    __jait_capture(0, ((await tool.execute(input, context)).ok));
    __jait_capture(1, ((await tool.execute(input, context)).ok));
    const reloaded = new TeamChatService(opened.db, sessions, profiles);
    const message = reloaded.history(owner, room.id)[0]!;
    __jait_capture(2, (message.sender), ({ kind: "chat", id: session.id, name: "Developer Chat", avatar: null, sourceSessionId: session.id }));
    __jait_capture(3, (message.content));
    __jait_capture(4, (reloaded.deliveries(owner, room.id)));
    __jait_capture(5, (reloaded.get(owner, room.id).projectPath));
    const agentSession = reloaded.deliveries(owner, room.id)[0]!.sessionId;
    __jait_capture(6, (reloaded.sender(owner, agentSession, room.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_480_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const dispatcher = vi.fn(async () => ({ content: "Reviewed." }));
    service.setDispatcher(dispatcher);
    const source = sessions.create({ userId: owner, name: "Long source chat title", projectPath: "/tmp/repo" });
    const tool = createTeamChatTool(service, sessions);
    const content = "Continue the unfinished review.\nKeep the existing worktree.";
    const result = await tool.execute({ action: "send", roomId: room.id, content, recipientIds: ["QA"], clientKey: "plain-relay" },
      { sessionId: source.id, userId: owner, projectRoot: "/tmp/repo", requestedBy: "agent" });
    __jait_capture(0, (result.ok));
    await vi.waitFor(() => __jait_capture(1, (service.deliveries(owner, room.id)[0]?.status)));
    __jait_capture(2, (dispatcher.mock.calls), ([content]));
    __jait_capture(3, (service.history(owner, room.id)[0]), ({ content, kind: "relay",
      sender: { kind: "chat", name: "Long source chat title", sourceSessionId: source.id } }));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_495_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    let finish!: () => void;
    const wait = new Promise<void>(resolve => { finish = resolve; });
    const dispatcher = vi.fn(async () => { await wait; return { content: "Implemented and ready for review." }; });
    service.setDispatcher(dispatcher);
    post("Ticket one", "one", ["Developer"]);
    post("Ticket two", "two", ["Developer"]);
    __jait_capture(0, (dispatcher.mock.calls));
    const deliveries = service.deliveries(owner, room.id);
    __jait_capture(1, (new Set(deliveries.map(delivery => delivery.sessionId)).size));
    for (const delivery of deliveries) __jait_capture(2, (service.workForSession(owner, delivery.sessionId)), ({ roomId: room.id, agentId: "Developer" }));
    finish();
    await vi.waitFor(() => __jait_capture(3, (service.deliveries(owner, room.id).every(delivery => delivery.status === "completed"))));
    __jait_capture(4, (service.history(owner, room.id).filter(message => message.kind === "result")));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_511_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const original = post("Build", "build", ["Developer"]);
    const work = service.deliveries(owner, room.id)[0]!;
    service.post(owner, room.id, { content: "Change the acceptance criteria.", sender: sender("Developer"), recipientIds: ["Developer"], clientKey: "steer", targetSessionId: work.sessionId, parentMessageId: original.id });
    __jait_capture(0, (service.deliveries(owner, room.id)[1]!.sessionId), (work.sessionId));
    __jait_thrown(1, () => service.post(owner, room.id, { content: "Wrong owner", sender: human, recipientIds: ["QA"], clientKey: "invalid-steer", targetSessionId: work.sessionId }));
    const privateChat = sessions.create({ userId: "other" });
    __jait_thrown(2, () => service.sender(owner, privateChat.id, room.id));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_521_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const lead = sender("Scrum");
    service.setGoal(owner, room.id, "Ship notifications", ["Tests pass", "QA approves"], lead);
    __jait_thrown(0, () => service.completeGoal(owner, room.id, ["Tests pass"], lead));
    __jait_thrown(1, () => service.completeGoal(owner, room.id, ["Test report", "QA report"], lead));
    service.post(owner, room.id, { content: "Verified tests and acceptance scenarios.", clientKey: "verify", sender: sender("QA"), kind: "verification", recipientIds: [] });
    __jait_capture(2, (service.completeGoal(owner, room.id, ["test log", "QA report"], lead).goal?.status));
    service.setGoal(owner, room.id, "Next ticket", ["Acceptance"], lead);
    __jait_thrown(3, () => service.completeGoal(owner, room.id, ["Old QA report"], lead));
    __jait_thrown(4, () => service.setGoal(owner, room.id, "Take over", ["Test"], sender("Developer")));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_533_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    post("Before restart", "restart", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    opened.sqlite.prepare("UPDATE team_room_deliveries SET status = 'running' WHERE id = ?").run(delivery.id);
    const dispatcher = vi.fn(async () => ({ content: "should not run" }));
    const restored = new TeamChatService(opened.db, sessions, profiles);
    restored.setDispatcher(dispatcher); await restored.recover();
    __jait_capture(0, (dispatcher.mock.calls));
    __jait_capture(1, (restored.deliveries(owner, room.id)[0]!.status));
    restored.close();
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_545_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const dispatcher = vi.fn(async (delivery, agent) => {
      if (agent.id === "Developer") {
        service.post(owner, room.id, { sender: { ...sender(agent.id), sourceSessionId: delivery.sessionId },
          content: "Bun is unavailable; prepare the test runtime.", kind: "blocked", recipientIds: [],
          clientKey: "explicit-block", parentMessageId: delivery.messageId });
        return { content: "I could not run tests." };
      }
      return { content: "Escalated the environment blocker." };
    });
    service.setDispatcher(dispatcher);
    post("Verify the change", "blocked-work", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id)[0]?.status)));
    await vi.waitFor(() => __jait_capture(1, (dispatcher.mock.calls)));
    __jait_capture(2, (service.deliveries(owner, room.id)[0]?.error));
    __jait_capture(3, (service.history(owner, room.id).filter(message => message.kind === "review")));
    __jait_capture(4, (service.history(owner, room.id).find(message => message.kind === "review")));
    __jait_capture(5, (service.history(owner, room.id).filter(message => message.kind === "blocked")));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_565_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    const dispatcher = vi.fn(async () => { throw new Error("Provider request failed"); });
    service.setDispatcher(dispatcher);
    post("Implement", "provider-failure", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id))));
    await vi.waitFor(() => __jait_capture(1, (service.deliveries(owner, room.id).every(item => item.status === "failed"))));
    __jait_capture(2, (dispatcher.mock.calls));
    __jait_capture(3, (service.history(owner, room.id).filter(message => message.kind === "blocked")));
    __jait_capture(4, (service.history(owner, room.id).filter(message => message.kind === "review")));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_576_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    profiles.savePersonaAgent(owner, { ...profile("Scrum"), paused: true });
    const dispatcher = vi.fn(async () => { throw new Error("Tool consent timed out"); });
    service.setDispatcher(dispatcher);
    post("Implement", "paused-manager", ["Developer"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id)[0]?.status)));
    __jait_capture(1, (dispatcher.mock.calls));
    profiles.savePersonaAgent(owner, profile("Scrum"));
    service.setGoal(owner, room.id, "Done", ["verified"], human);
    service.completeGoal(owner, room.id, ["test evidence"], human);
    post("Implement", "closed-goal", ["Developer"]);
    await vi.waitFor(() => __jait_capture(2, (service.deliveries(owner, room.id)[1]?.status)));
    __jait_capture(3, (service.deliveries(owner, room.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_591_3_each0": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
/*__jait_scope_open__*/{
const { kinds, status } = { kinds: ["blocked", "verification"] as const, status: "completed" };
await __jait_hook_1399();
try {
await (async()=>{

    // Force valid IDs in descending lexical order within one millisecond.
    // This also checks assignment/outcome association and restart history.
    let suffix = 0xffffffffffff;
    vi.spyOn(uuidIds, "uuidv7").mockImplementation(() =>
      "019fe795-0000-7000-8000-" + (suffix--).toString(16).padStart(12, "0"));
    service.setDispatcher(async (delivery, agent) => {
      for (const kind of kinds) service.post(owner, room.id, {
        sender: { ...sender(agent.id), sourceSessionId: delivery.sessionId }, content: kind,
        kind, recipientIds: [], clientKey: delivery.id + ":" + kind, parentMessageId: delivery.messageId,
      });
      return { content: "Verified." };
    });
    post("Verify", "resolved-blocker", ["QA"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id)[0]?.status)));
    const outcomes = service.history(owner, room.id).filter(message => kinds.includes(message.kind as typeof kinds[number]) && message.sender.id === "QA");
    __jait_capture(1, (outcomes.map(message => message.kind)), ([...kinds]));
    if (status === "completed") __jait_capture(2, (service.deliveries(owner, room.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_591_3_each1": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
/*__jait_scope_open__*/{
const { kinds, status } = { kinds: ["verification", "blocked"] as const, status: "failed" };
await __jait_hook_1399();
try {
await (async()=>{

    // Force valid IDs in descending lexical order within one millisecond.
    // This also checks assignment/outcome association and restart history.
    let suffix = 0xffffffffffff;
    vi.spyOn(uuidIds, "uuidv7").mockImplementation(() =>
      "019fe795-0000-7000-8000-" + (suffix--).toString(16).padStart(12, "0"));
    service.setDispatcher(async (delivery, agent) => {
      for (const kind of kinds) service.post(owner, room.id, {
        sender: { ...sender(agent.id), sourceSessionId: delivery.sessionId }, content: kind,
        kind, recipientIds: [], clientKey: delivery.id + ":" + kind, parentMessageId: delivery.messageId,
      });
      return { content: "Verified." };
    });
    post("Verify", "resolved-blocker", ["QA"]);
    await vi.waitFor(() => __jait_capture(0, (service.deliveries(owner, room.id)[0]?.status)));
    const outcomes = service.history(owner, room.id).filter(message => kinds.includes(message.kind as typeof kinds[number]) && message.sender.id === "QA");
    __jait_capture(1, (outcomes.map(message => message.kind)), ([...kinds]));
    if (status === "completed") __jait_capture(2, (service.deliveries(owner, room.id)));
  
})();

} finally {
await __jait_hook_1987();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_test_ts_614_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const __jait_hook_1399 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_1987 = () => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_1399();
try {
await (async()=>{

    let parent = post("Start", "start", []);
    for (let depth = 1; depth <= 33; depth++) parent = service.post(owner, room.id, { content: "Round " + depth, clientKey: String(depth), sender: sender("Developer"), recipientIds: [], parentMessageId: parent.id });
    __jait_thrown(0, () => service.post(owner, room.id, { content: "Loop", clientKey: "loop", sender: sender("Developer"), kind: "assignment", recipientIds: ["QA"], parentMessageId: parent.id }));
    profiles.savePersonaAgent(owner, { ...profile("QA", "Scrum"), paused: true });
    post("Review", "paused", ["QA"]);
    __jait_capture(1, (service.deliveries(owner, room.id).at(-1)));
  
})();

} finally {
await __jait_hook_1987();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
