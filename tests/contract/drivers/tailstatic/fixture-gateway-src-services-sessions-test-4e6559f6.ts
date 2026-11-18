// Translated fixture from packages/gateway/src/services/sessions.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/sessions.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_sessions_test_ts_23_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
      const session = sessions.create({ userId });
      const observedAt = session.lastActiveAt;
      __jait_capture(0, (session.viewedAt), (observedAt));
      vi.setSystemTime(new Date("2026-09-13T10:01:00.000Z"));
      sessions.touch(session.id);
      sessions.markViewed(session.id, userId, observedAt);
      __jait_capture(1, (sessions.getById(session.id)?.viewedAt), (observedAt));
      __jait_capture(2, (sessions.getById(session.id)?.lastActiveAt));
      sessions.markViewed(session.id, userId, "2026-09-13T10:01:00.000Z");
      sessions.markViewed(session.id, userId, observedAt);
      __jait_capture(3, (sessions.getById(session.id)?.viewedAt));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_43_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
      const session = sessions.create({ userId });
      sessions.touch(session.id);
      const promptAt = sessions.getById(session.id)!.lastActiveAt;
      sessions.markViewed(session.id, userId, promptAt);
      sessions.touch(session.id);
      const reply = sessions.getById(session.id)!;
      __jait_capture(0, (Date.parse(reply.lastActiveAt)), (Date.parse(promptAt)));
      __jait_capture(1, (reply.viewedAt), (promptAt));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_60_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({ userId, name: "Personal chat" });
    __jait_captureType(0, (session.projectId));

    const moved = sessions.moveToProject(session.id, "project-1", "/repo/jait", userId);

    __jait_capture(1, (moved?.projectId));
    __jait_capture(2, (moved?.projectPath));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_70_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({
      userId,
      projectId: "project-1",
      projectPath: "/repo/jait",
      name: "Project chat",
    });

    const moved = sessions.moveToProject(session.id, null, null, userId);

    __jait_captureType(0, (moved?.projectId));
    // A stale projectPath would keep pointing the chat at the folder of the
    // project it just left, since tool execution falls back to it.
    __jait_captureType(1, (moved?.projectPath));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_86_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({
      userId,
      name: "Keep my name",
      metadata: { chat: { provider: "anthropic" } },
    });

    const moved = sessions.moveToProject(session.id, "project-2", "/repo/other", userId);

    __jait_capture(0, (moved?.name));
    __jait_capture(1, (JSON.parse(moved?.metadata ?? "{}")));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_99_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({ userId, name: "Mine" });

    sessions.moveToProject(session.id, "project-1", "/repo/jait", "someone-else");

    __jait_captureType(0, (sessions.getById(session.id)?.projectId));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_107_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({
      userId,
      metadata: { chat: { provider: "anthropic", model: "claude-sonnet-4-5" } },
    });

    sessions.updateChatError(session.id, "Provider request failed with status 429", userId);

    const chat = JSON.parse(sessions.getById(session.id, userId)?.metadata ?? "{}").chat;
    __jait_capture(0, (chat.provider));
    __jait_capture(1, (chat.model));
    __jait_capture(2, (chat.lastError));
    __jait_capture(3, (typeof chat.lastErrorAt));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_122_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({ userId });
    sessions.updateChatError(session.id, "boom", userId);

    sessions.updateChatError(session.id, null, userId);

    const chat = JSON.parse(sessions.getById(session.id, userId)?.metadata ?? "{}").chat;
    __jait_captureType(0, (chat.lastError));
    __jait_captureType(1, (chat.lastErrorAt));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_sessions_test_ts_133_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let sessions: SessionService;
let userId: string;
const __jait_hook_387 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    sessions = new SessionService(opened.db);
    userId = new UserService(opened.db).createUser("session-owner", "password123").id;
  };
const __jait_hook_662 = () => {
    sqlite.close();
  };
await __jait_hook_387();
try {
await (async()=>{

    const session = sessions.create({ userId });

    sessions.updateChatError(session.id, "boom", "someone-else");

    const metadata = sessions.getById(session.id, userId)?.metadata ?? "";
    __jait_capture(0, (metadata.includes("lastError")));
  
})();

} finally {
await __jait_hook_662();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
