// Translated fixture from packages/gateway/src/db/sqlite-shim.test.ts; expected literals are in tail_static.rs.
import { openRawSqlite, createDrizzle, sqliteBackend } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import type { SqliteDatabase, DrizzleDB } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { migrateDatabase } from "../../../../packages/gateway/src/db/connection.js";
import * as schema from "../../../../packages/gateway/src/db/schema.js";

import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/db/sqlite-shim.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_25_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    sqlite = await openRawSqlite(":memory:");
    __jait_captureType(0, (sqlite));
    __jait_capture(1, (typeof sqlite.exec));
    __jait_capture(2, (typeof sqlite.prepare));
    __jait_capture(3, (typeof sqlite.close));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_33_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    sqlite = await openRawSqlite(":memory:");
    // In the vitest environment this will be bun:sqlite (shimmed) or node:sqlite
    __jait_capture(0, (["bun:sqlite", "node:sqlite", "better-sqlite3"]), (sqliteBackend));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_39_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    sqlite = await openRawSqlite(":memory:");
    // This is the critical test — createDrizzle must NOT import
    // drizzle-orm/better-sqlite3/driver.js (which top-level-imports
    // the better-sqlite3 native package).
    db = await createDrizzle(sqlite);
    __jait_captureType(0, (db));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_48_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    sqlite = await openRawSqlite(":memory:");
    sqlite.exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)");
    sqlite.prepare("INSERT INTO test_table (id, name) VALUES (?, ?)").run(1, "hello");
    const row = sqlite.prepare("SELECT * FROM test_table WHERE id = ?").get(1) as { id: number; name: string };
    __jait_capture(0, (row));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_56_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    sqlite = await openRawSqlite(":memory:");
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    db = await createDrizzle(sqlite);
    migrateDatabase(sqlite);

    const now = new Date().toISOString();

    // Insert a user row using Drizzle ORM
    db.insert(schema.users).values({
      id: "user-1",
      username: "testuser",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    }).run();

    // Read it back
    const rows = db.select().from(schema.users).where(eq(schema.users.id, "user-1")).all();
    __jait_capture(0, (rows));
    __jait_capture(1, (rows[0].username));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_80_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    sqlite = await openRawSqlite(":memory:");
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA foreign_keys = ON");
    db = await createDrizzle(sqlite);
    migrateDatabase(sqlite);

    const now = new Date().toISOString();

    // Insert a session
    db.insert(schema.sessions).values({
      id: "sess-1",
      createdAt: now,
      lastActiveAt: now,
    }).run();

    // Select it back
    const session = db.select().from(schema.sessions)
      .where(eq(schema.sessions.id, "sess-1")).get();
    __jait_captureType(0, (session));
    __jait_capture(1, (session!.id));

    // Insert messages referencing the session
    db.insert(schema.messages).values({
      id: "msg-1",
      sessionId: "sess-1",
      role: "user",
      content: "Hello world",
      createdAt: now,
    }).run();

    const msgs = db.select().from(schema.messages)
      .where(eq(schema.messages.sessionId, "sess-1")).all();
    __jait_capture(2, (msgs));
    __jait_capture(3, (msgs[0].content));

    // Update
    db.update(schema.sessions)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(schema.sessions.id, "sess-1")).run();

    // Delete
    db.delete(schema.messages).where(eq(schema.messages.id, "msg-1")).run();
    const deleted = db.select().from(schema.messages)
      .where(eq(schema.messages.id, "msg-1")).get();
    __jait_captureType(4, (deleted));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_sqlite_shim_test_ts_128_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: DrizzleDB;
const __jait_hook_784 = () => {
  try { sqlite?.close(); } catch {}
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Use the high-level openDatabase which chains openRawSqlite + createDrizzle
    const { openDatabase } = await import("../../../../packages/gateway/src/db/connection.js");
    const result = await openDatabase(":memory:");
    sqlite = result.sqlite;
    db = result.db;

    migrateDatabase(sqlite);

    const now = new Date().toISOString();

    // Verify the complete pipeline works
    db.insert(schema.users).values({
      id: "user-1",
      username: "testuser",
      passwordHash: "hash",
      createdAt: now,
      updatedAt: now,
    }).run();

    const user = db.select().from(schema.users).where(eq(schema.users.id, "user-1")).get();
    __jait_captureType(0, (user));
    __jait_capture(1, (user!.username));
  
})();

} finally {
await __jait_hook_784();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
