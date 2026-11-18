// Translated fixture from packages/gateway/src/services/team-chat-stopped-thread.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { TeamChatService } from "../../../../packages/gateway/src/services/team-chat.js";

import { teamDeliveries } from "../../../../packages/gateway/src/db/schema.js";
import { uuidv7 } from "../../../../packages/gateway/src/db/uuidv7.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/team-chat-stopped-thread.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_team_chat_stopped_thread_test_ts_71_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };
const __jait_hook_2520 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_3117 = () => { service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_2520();
try {
await (async()=>{

    const dispatch = vi.fn(() => new Promise<{ content: string }>(() => {}));
    service.setDispatcher(dispatch);
    post("Unsettled active turn", "w3-active", ["Developer"]);
    const active = deliveryFor(service, "Unsettled active turn");
    profiles.markRunning(active.sessionId, "active-provider");
    __jait_capture(0, (active.status));

    // Persist FIFO followers directly so this regression is independent of the
    // separate per-agent/per-thread dispatch serialization change.
    const followerIds = [uuidv7(), uuidv7()];
    for (const id of followerIds) {
      opened.db.insert(teamDeliveries).values({
        ...active, id, status: "queued", error: null,
      }).run();
    }
    const sibling = profiles.create({
      userId: owner, personaAgentId: "Developer", providerId: "codex", title: "Sibling work",
    });
    profiles.markRunning(sibling.id, "sibling-provider");
    const siblingDeliveryId = uuidv7();
    opened.db.insert(teamDeliveries).values({
      ...active, id: siblingDeliveryId, sessionId: sibling.id, status: "running",
    }).run();
    const siblingFollowerId = uuidv7();
    opened.db.insert(teamDeliveries).values({
      ...active, id: siblingFollowerId, sessionId: sibling.id, status: "queued",
    }).run();

    profiles.markInterrupted(active.sessionId);
    const statuses = new Map(service.deliveries(owner, room.id).map(row => [row.id, row.status]));
    // No pump, new post, or promise settlement after the stop.
    for (const id of followerIds) __jait_capture(1, (statuses.get(id)));
    __jait_capture(2, (statuses.get(active.id)));
    __jait_capture(3, (statuses.get(siblingDeliveryId)));
    __jait_capture(4, (statuses.get(siblingFollowerId)));
    __jait_capture(5, (profiles.getById(sibling.id)?.status));
    __jait_capture(6, (dispatch.mock.calls));
    profiles.markInterrupted(active.sessionId);
    __jait_capture(7, (service.deliveries(owner, room.id).filter(row => followerIds.includes(row.id))
      .every(row => row.status === "cancelled")));
    const restored = new TeamChatService(opened.db, sessions, profiles);
    __jait_capture(8, (restored.deliveries(owner, room.id).filter(row => followerIds.includes(row.id))
      .every(row => row.status === "cancelled")));
    restored.close();
  
})();

} finally {
await __jait_hook_3117();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_stopped_thread_test_ts_118_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };
const __jait_hook_2520 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_3117 = () => { service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_2520();
try {
await (async()=>{

    post("Restart recovery work", "w3-recovery", ["Developer"]);
    const delivery = deliveryFor(service, "Restart recovery work");
    profiles.markRunning(delivery.sessionId, "recovery-provider");
    profiles.queueRestartRecovery();
    __jait_capture(0, (profiles.getById(delivery.sessionId)?.status));
    __jait_capture(1, (profiles.getRecovery(delivery.sessionId)?.pending));
    __jait_capture(2, (deliveryFor(service, "Restart recovery work").status));
    profiles.markInterrupted(delivery.sessionId);
    __jait_captureType(3, (profiles.getRecovery(delivery.sessionId)));
    __jait_capture(4, (deliveryFor(service, "Restart recovery work").status));
  
})();

} finally {
await __jait_hook_3117();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_stopped_thread_test_ts_131_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };
const __jait_hook_2520 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_3117 = () => { service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_2520();
try {
await (async()=>{

    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const dispatch = async (delivery: { id: string }) => {
      started.push(delivery.id);
      // Park only the two slot-holders; anything else that starts is a defect and
      // completes immediately so the failing run leaves no parked work behind.
      if (started.length <= 2) await new Promise<void>(resolve => { releases.set(delivery.id, resolve); });
      return { content: "Completed." };
    };

    // Queue the backlog before a dispatcher is available. Independent agents can
    // now run concurrently; stopping queued work must still prevent dispatch.
    post("Hold first slot", "slot-one", ["Developer"]);
    post("Hold second slot", "slot-two", ["QA"]);
    __jait_capture(0, (started));

    post("Work the user then stops", "stopped-work", ["Research"]);
    const stopped = deliveryFor(service, "Work the user then stops");
    __jait_capture(1, (stopped.status));
    __jait_capture(2, (started), (stopped.id));

    // The product stop path: POST /api/threads/:id/stop -> markInterrupted.
    profiles.markInterrupted(stopped.sessionId);
    __jait_capture(3, (profiles.getById(stopped.sessionId)!.status));
    service.setDispatcher(dispatch);
    await service.pump();
    __jait_capture(4, (started));

    const slotIds = service.deliveries(owner, room.id)
      .filter(delivery => delivery.id !== stopped.id).map(delivery => delivery.id);
    __jait_capture(5, (slotIds));
    for (const release of releases.values()) release();
    const statusOf = (source: TeamChatService, id: string) =>
      source.deliveries(owner, room.id).find(delivery => delivery.id === id)?.status;
    await vi.waitFor(() => __jait_capture(6, (slotIds.every(id => statusOf(service, id) === "completed"))));

    // The same call both `runDelivery()`'s finally block and `recover()` make.
    await service.pump();

    __jait_capture(7, (started), (stopped.id));
    const after = deliveryFor(service, "Work the user then stops");
    __jait_capture(8, (after.status));
    // Not "queued" either: an abandoned queued row is what makes Agents/Threads and
    // reconnect reporting dishonest (ticket 4, D3). Cancel must reach a terminal status.
    __jait_capture(9, (after.status));
  
})();

} finally {
await __jait_hook_3117();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_stopped_thread_test_ts_179_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };
const __jait_hook_2520 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_3117 = () => { service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_2520();
try {
await (async()=>{

    // No dispatcher yet, so the delivery stays genuinely `queued` with nothing running.
    post("Queued work the user stopped", "stopped-before-restart", ["Developer"]);
    const stopped = deliveryFor(service, "Queued work the user stopped");
    __jait_capture(0, (stopped.status));
    __jait_capture(1, (profiles.getById(stopped.sessionId)!.status));
    profiles.markInterrupted(stopped.sessionId);

    const dispatcher = vi.fn(async () => ({ content: "should not run" }));
    const restored = new TeamChatService(opened.db, sessions, profiles);
    restored.setDispatcher(dispatcher);
    await restored.recover();

    __jait_capture(2, (dispatcher.mock.calls));
    const after = deliveryFor(restored, "Queued work the user stopped");
    __jait_capture(3, (after.status));
    __jait_capture(4, (after.status));
    restored.close();
  
})();

} finally {
await __jait_hook_3117();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_stopped_thread_test_ts_205_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };
const __jait_hook_2520 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_3117 = () => { service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_2520();
try {
await (async()=>{

    post("Queued work nobody stopped", "live-thread", ["Developer"]);
    const live = deliveryFor(service, "Queued work nobody stopped");
    __jait_capture(0, (live.status));
    __jait_capture(1, (profiles.getById(live.sessionId)!.status));

    const dispatched: string[] = [];
    service.setDispatcher(async delivery => { dispatched.push(delivery.id); return { content: "Ran." }; });
    await service.pump();
    await vi.waitFor(() => __jait_capture(2, (dispatched.length)));
    __jait_capture(3, (dispatched), ([live.id]));
    await vi.waitFor(() => __jait_capture(4, (deliveryFor(service, "Queued work nobody stopped").status)));
  
})();

} finally {
await __jait_hook_3117();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_team_chat_stopped_thread_test_ts_218_3": {

const { personaAgentProfileSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
/*__jait_scope_open__*/{
let opened: Awaited<ReturnType<typeof openDatabase>>;
let profiles: ThreadService;
let sessions: SessionService;
let service: TeamChatService;
let room: TeamRoom;
let databaseClosed = false;
const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });
const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };
const __jait_hook_2520 = async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  };
const __jait_hook_3117 = () => { service.close(); if (!databaseClosed) opened.sqlite.close(); };
await __jait_hook_2520();
try {
await (async()=>{

    const releases = new Map<string, (value: { content: string }) => void>();
    const dispatch = vi.fn((delivery: { id: string }) => new Promise<{ content: string }>(resolve => {
      releases.set(delivery.id, resolve);
    }));
    service.setDispatcher(dispatch);
    try {
      post("Real active", "real-active", ["Developer"]);
      const active = deliveryFor(service, "Real active");
      profiles.markRunning(active.sessionId, "active-provider");
      post("Real sibling", "real-sibling", ["Developer"]);
      const sibling = deliveryFor(service, "Real sibling");
      profiles.markRunning(sibling.sessionId, "sibling-provider");
      service.post(owner, room.id, {
        content: "Real follower", clientKey: "real-follower", sender: human,
        recipientIds: ["Developer"], targetSessionId: active.sessionId,
      });
      const follower = deliveryFor(service, "Real follower");
      __jait_capture(0, (dispatch.mock.calls));
      __jait_capture(1, (follower.status));
      profiles.markInterrupted(active.sessionId);
      __jait_capture(2, (deliveryFor(service, "Real follower").status));
      __jait_capture(3, (deliveryFor(service, "Real sibling").status));
      __jait_capture(4, (profiles.getById(sibling.sessionId)?.status));
      releases.get(sibling.id)!({ content: "" });
      await vi.waitFor(() => __jait_capture(5, (deliveryFor(service, "Real sibling").status)));
      __jait_capture(6, (dispatch.mock.calls));
      __jait_capture(7, (deliveryFor(service, "Real follower").status));
    } finally {
      service.close();
      for (const release of releases.values()) release({ content: "" });
      await Promise.resolve();
    }
  
})();

} finally {
await __jait_hook_3117();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
