// Translated fixture from packages/gateway/src/services/reminders.test.ts; expected literals are in tail_static.rs.

import { migrateDatabase, openDatabase, type JaitDB } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { messages, reminders, sessions } from "../../../../packages/gateway/src/db/schema.js";
import { ReminderService } from "../../../../packages/gateway/src/services/reminders.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/reminders.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_reminders_test_ts_23_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
const __jait_hook_407 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_557 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_407();
try {
await (async()=>{

    const service = new ReminderService(db);
    const created = service.create({
      userId: "user-1",
      projectId: "project-1",
      sessionId: "session-1",
      content: "Remember the deployment note",
      tags: ["Deploy", "deploy", "Notes"],
    });

    __jait_capture(0, (created), ({
      userId: "user-1",
      projectId: "project-1",
      sessionId: "session-1",
      content: "Remember the deployment note",
      status: "active",
      tags: JSON.stringify(["deploy", "notes"]),
    }));

    __jait_capture(1, (service.list({ userId: "user-1", projectId: "project-1" })));
    __jait_capture(2, (service.list({ userId: "user-2" })));
  
})();

} finally {
await __jait_hook_557();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_reminders_test_ts_46_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
const __jait_hook_407 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_557 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_407();
try {
await (async()=>{

    const service = new ReminderService(db);
    const created = service.create({
      userId: "user-1",
      content: "Follow up later",
    });

    const archived = service.update(created.id, { status: "archived" }, "user-1");
    __jait_capture(0, (archived?.status));
    __jait_capture(1, (service.list({ userId: "user-1", status: "active" })));
    __jait_capture(2, (service.delete(created.id, "user-2")));
    __jait_capture(3, (service.delete(created.id, "user-1")));
  
})();

} finally {
await __jait_hook_557();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_reminders_test_ts_60_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
const __jait_hook_407 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_557 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_407();
try {
await (async()=>{

    const service = new ReminderService(db);
    const created = service.create({
      userId: "user-1",
      projectId: "project-1",
      content: "Use icon-only controls for compact todo metadata",
      sourceType: "user",
      sourceId: "session-1",
      sourceSurface: "web",
      tags: ["todo", "ui"],
    });

    __jait_capture(0, (created.usageCount));
    __jait_captureType(1, (created.lastRetrievedAt));
    __jait_capture(2, (service.markRetrieved([created.id], "user-1")));

    const retrieved = service.getById(created.id, "user-1");
    __jait_capture(3, (retrieved?.usageCount));
    __jait_captureType(4, (retrieved?.lastRetrievedAt));

    const markdown = service.exportMarkdown({ userId: "user-1" });
    __jait_capture(5, (markdown));
    __jait_capture(6, (markdown));
    __jait_capture(7, (markdown));
    __jait_capture(8, (markdown));
  
})();

} finally {
await __jait_hook_557();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_reminders_test_ts_87_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
const __jait_hook_407 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_557 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_407();
try {
await (async()=>{

    const service = new ReminderService(db);
    db.insert(sessions).values({
      id: "session-1",
      userId: "user-1",
      projectId: "project-1",
      name: "Chat",
      createdAt: "2026-05-23T00:00:00.000Z",
      lastActiveAt: "2026-05-23T00:00:00.000Z",
    }).run();
    db.insert(messages).values({
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      content: "Remember that this project prefers slim todo controls.",
      createdAt: "2026-05-23T00:01:00.000Z",
    }).run();

    __jait_capture(0, (service.scanOldChatsForMemory("user-1")));
    const [created] = service.list({ userId: "user-1", status: "active" });
    __jait_capture(1, (created));
    __jait_capture(2, (service.scanOldChatsForMemory("user-1")));
  
})();

} finally {
await __jait_hook_557();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_reminders_test_ts_116_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
const __jait_hook_407 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_557 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_407();
try {
await (async()=>{

    const service = new ReminderService(db);
    const stale = service.create({
      userId: "user-1",
      content: "Old generated note",
      sourceType: "background_memory_scan",
      tags: ["old"],
    });
    db.update(reminders).set({
      updatedAt: "2025-01-01T00:00:00.000Z",
    }).where(eq(reminders.id, stale.id)).run();
    service.create({ userId: "user-1", content: "Use compact todo controls", tags: ["todo"] });
    service.create({ userId: "user-1", content: "Do not use compact todo controls", tags: ["todo"] });

    const result = service.runHygiene("user-1");
    __jait_capture(0, (result.archived));
    __jait_capture(1, (result.flagged));
    __jait_capture(2, (service.getById(stale.id, "user-1")?.status));
    const active = service.list({ userId: "user-1", status: "active" });
    __jait_capture(3, (active.some((row) => row.tags.includes("review:conflict"))));
  
})();

} finally {
await __jait_hook_557();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_reminders_test_ts_139_1": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
const __jait_hook_407 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_557 = () => {
  sqlite.close();
};
await __jait_hook_407();
try {
await (async()=>{

  const prefix = "remember " + "a".repeat(269);
  sqlite.prepare("INSERT INTO sessions(id,user_id,name,created_at,last_active_at) VALUES(?,?,?,?,?)")
    .run("unicode-session", "owner", "Unicode", "2026-01-01", "2026-01-01");
  sqlite.prepare("INSERT INTO messages(id,session_id,role,content,created_at) VALUES(?,?,?,?,?)")
    .run("unicode-message", "unicode-session", "user", prefix + "🦀" + "b".repeat(20), "2026-01-01");
  const service = new ReminderService(db);
  __jait_capture(0, (service.scanOldChatsForMemory("owner")));
  __jait_capture(1, (service.list({ userId: "owner" })[0]?.content), (prefix + "…"));
  __jait_capture(2, (service.scanOldChatsForMemory("owner")));
  __jait_capture(3, (service.list({ userId: "owner" })));

})();

} finally {
await __jait_hook_557();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
