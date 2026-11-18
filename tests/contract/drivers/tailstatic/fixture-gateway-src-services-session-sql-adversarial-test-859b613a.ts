// Translated fixture from packages/gateway/src/services/session-sql.adversarial.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { SessionSqlService } from "../../../../packages/gateway/src/services/session-sql.js";
import { createSessionSqlTool } from "../../../../packages/gateway/src/tools/session-sql-tools.js";
import type { SessionSqlToolInput } from "../../../../packages/gateway/src/tools/session-sql-tools.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { ToolName } from "../../../../packages/gateway/src/tools/tool-names.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/session-sql.adversarial.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_100_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const before = messageCount();
    const result = svc.query({ sql: "WITH x AS (DELETE FROM messages RETURNING *) SELECT * FROM x" });
    refused(result, "readonly_violation");
    __jait_capture(3, (messageCount()), (before));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_108_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "WITH x AS (DELETE FROM messages RETURNING id) SELECT * FROM x LIMIT 5" });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_114_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({
      sql: "WITH x AS (INSERT INTO messages (id, session_id, role, content, created_at) VALUES ('adv-i', 'sess-a', 'user', 'pwned', '2026-01-01T00:00:00.000Z') RETURNING id) SELECT * FROM x",
    });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_122_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "WITH x AS (UPDATE messages SET content = 'pwned' RETURNING id) SELECT * FROM x" });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_128_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({
      sql: "WITH a AS (SELECT 1 AS v), b AS (DELETE FROM messages) SELECT v FROM a",
    });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_136_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "WITH x AS (SELECT 1) DELETE FROM messages" });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_142_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({
      sql: "WITH x AS (SELECT 1 /*)*/ ) DELETE FROM messages SELECT 1",
    });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_150_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const messageCount = () => {
    const stmt = sqlite!.prepare("SELECT COUNT(*) AS n FROM messages");
    return (stmt.get() as { n: number }).n;
  };

try {
await (async()=>{

    const svc = await service();
    // The keyword scan sees the live `DELETE FROM messages` tail even though a
    // naive lexer might treat it as swallowed by the `--` (there is no newline
    // at EOF, so the engine would also treat the tail as a comment — refusing
    // is the safe direction either way).
    const result = svc.query({ sql: "SELECT 1 --;\nDELETE FROM messages" });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for0": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["double-quoted", 'SELECT * FROM "user_secrets"'];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for1": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["bracketed", "SELECT * FROM [user_secrets]"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for2": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["backticked", "SELECT * FROM `user_secrets`"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["schema-qualified", "SELECT * FROM main.user_secrets"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for4": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for5": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["UPPERCASE", "SELECT * FROM USER_SECRETS"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for6": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["MixedCase", "SELECT * FROM User_Secrets"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for7": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for8": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for9": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for10": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for11": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for12": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for13": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for14": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["quoted uppercase users", 'SELECT * FROM "Users"'];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_186_5_for15": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];
const [label, sql] = ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "blocked_table");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_192_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "SELECT id FROM messages UNION SELECT id FROM mobile_push_registrations" }), "blocked_table");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_197_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "SELECT 1 FROM evil.user_secrets" }), "blocked_table");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_202_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];

try {
await (async()=>{

    const svc = await service();
    // `user_secrets_extra` shares a prefix but is a distinct table; the
    // word-boundary scan must not over-block, and the engine reports the
    // missing table.
    const result = svc.query({ sql: "SELECT * FROM user_secrets_extra" });
    __jait_capture(3, (result.ok));
    if (result.ok) return;
    __jait_capture(4, (result.error));
    __jait_capture(5, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_214_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted", 'SELECT * FROM "user_secrets"'],
    ["bracketed", "SELECT * FROM [user_secrets]"],
    ["backticked", "SELECT * FROM `user_secrets`"],
    ["schema-qualified", "SELECT * FROM main.user_secrets"],
    ["schema-qualified + quoted", 'SELECT * FROM main."user_secrets"'],
    ["UPPERCASE", "SELECT * FROM USER_SECRETS"],
    ["MixedCase", "SELECT * FROM User_Secrets"],
    ["double-quoted UPPERCASE", 'SELECT * FROM "USER_SECRETS"'],
    ["in a subquery", "SELECT * FROM (SELECT * FROM user_secrets) AS t"],
    ["in a CTE body", "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c"],
    ["joined", "SELECT m.id FROM messages m JOIN user_secrets s ON s.id = m.id"],
    ["joined via USING", "SELECT m.id FROM messages m JOIN users u USING (id)"],
    ["scalar subquery", "SELECT (SELECT group_concat(password_hash) FROM users) AS leak"],
    ["EXISTS probe", "SELECT 1 AS x WHERE EXISTS (SELECT 1 FROM user_settings)"],
    ["quoted uppercase users", 'SELECT * FROM "Users"'],
    ["blocked table as bare CTE name", "WITH user_secrets AS (SELECT 1 AS pw) SELECT * FROM user_secrets"],
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT 'user_secrets' AS literal" });
    __jait_capture(3, (result.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for0": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 /*; DROP TABLE messages*/ AS one";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for1": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 'DROP TABLE messages' AS s";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for2": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "-- INSERT INTO messages\nSELECT 1 AS one";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for4": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 -- DROP TABLE messages\n AS one";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for5": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT /* DROP */ /* TABLE */ 1 AS one";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_237_5_for6": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 'x; DELETE FROM messages; --' AS s";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_254_5_for0": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 /*;*/ ; DROP TABLE messages";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["readonly_violation", "multi_statement", "blocked_table", "sql_error"]), (result.error));
      // Must never be an *engine-executed* mutation: sql_error means SQLite
      // itself rejected the statement, which is acceptable.
      if (result.error === "sql_error") {
        __jait_capture(5, (result.message));
      }
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_254_5_for1": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["readonly_violation", "multi_statement", "blocked_table", "sql_error"]), (result.error));
      // Must never be an *engine-executed* mutation: sql_error means SQLite
      // itself rejected the statement, which is acceptable.
      if (result.error === "sql_error") {
        __jait_capture(5, (result.message));
      }
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_254_5_for2": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 /* ; */; DELETE FROM messages";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["readonly_violation", "multi_statement", "blocked_table", "sql_error"]), (result.error));
      // Must never be an *engine-executed* mutation: sql_error means SQLite
      // itself rejected the statement, which is acceptable.
      if (result.error === "sql_error") {
        __jait_capture(5, (result.message));
      }
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_254_5_for3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];
const sql = "SELECT 1 /* DE\nLE */ DELETE FROM messages";

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["readonly_violation", "multi_statement", "blocked_table", "sql_error"]), (result.error));
      // Must never be an *engine-executed* mutation: sql_error means SQLite
      // itself rejected the statement, which is acceptable.
      if (result.error === "sql_error") {
        __jait_capture(5, (result.message));
      }
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_268_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT 1 /* outer /* INSERT */ INSERT */ ; DELETE FROM messages" });
    __jait_capture(3, (result.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_274_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT 1 /* DROP TABLE messages" });
    __jait_capture(3, (result.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_280_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const harmless: string[] = [
    "SELECT 1 /*; DROP TABLE messages*/ AS one",
    "SELECT 'DROP TABLE messages' AS s",
    "SELECT 1 /* INSERT */ /* UPDATE */ /* DELETE */ AS one",
    "-- INSERT INTO messages\nSELECT 1 AS one",
    "SELECT 1 -- DROP TABLE messages\n AS one",
    "SELECT /* DROP */ /* TABLE */ 1 AS one",
    "SELECT 'x; DELETE FROM messages; --' AS s",
  ];
const hostile: string[] = [
    // Mutation keyword live OUTSIDE a comment:
    "SELECT 1 /*;*/ ; DROP TABLE messages",
    "SELECT 1 /* comment */ UNION ALL SELECT 1 FROM (DELETE FROM messages)",
    // Semicolon only appears after the comment ends:
    "SELECT 1 /* ; */; DELETE FROM messages",
    // Keyword spans the comment end:
    "SELECT 1 /* DE\nLE */ DELETE FROM messages",
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT * FROM messages WHERE content = '; DELETE FROM messages" });
    __jait_capture(3, (result.ok));
    if (result.ok) return;
    __jait_capture(4, (["sql_error", "readonly_violation"]), (result.error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for0": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for1": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for2": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for4": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for5": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for6": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["empty + mutation", "; DELETE FROM messages"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_305_5_for7": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];
const [label, sql] = ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
      if (result.ok) return;
      __jait_capture(4, (["multi_statement", "readonly_violation"]), (result.error));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_314_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];

try {
await (async()=>{

    const svc = await service();
    __jait_capture(3, (svc.query({ sql: "SELECT 1 AS one ;" }).ok));
    __jait_capture(4, (svc.query({ sql: "\r\n\t SELECT 1 AS one" }).ok));
    __jait_capture(5, (svc.query({ sql: "\u00A0SELECT 1 AS one" }).ok)); // NBSP: JS \s trims it
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_321_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT 'a;b' AS s, 2 AS n" });
    __jait_capture(3, (result.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_327_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "SELECT 1 -- intro\n; SELECT 2" }), "multi_statement");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_332_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];

try {
await (async()=>{

    const svc = await service();
    __jait_capture(3, (svc.query({ sql: "-- just a comment" }).error));
    __jait_capture(4, (svc.query({ sql: ";" }).error));
    __jait_capture(5, (svc.query({ sql: "/* block */" }).error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_339_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const multi: Array<[string, string]> = [
    ["semicolon after leading whitespace", "   \n\t ; DROP TABLE messages"],
    ["statement after trailing semicolon", "SELECT 1; DELETE FROM messages"],
    ["semicolon before comment, statement after", "SELECT 1 ;-- note\nDROP TABLE messages"],
    ["two statements separated only after a comment", "SELECT 1 /* ; */ ; DELETE FROM messages"],
    ["NUL byte as separator", "SELECT 1\u0000; DELETE FROM messages"],
    ["semicolon inside CTE, mutation after", "WITH x AS (SELECT 1; DELETE FROM messages) SELECT * FROM x"],
    ["empty + mutation", "; DELETE FROM messages"],
    ["semicolon then WITH", "SELECT 1; WITH x AS (SELECT 1) SELECT * FROM x"],
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT\u20281 AS one" }); // U+2028 before the digit
    __jait_capture(3, (result.ok));
    if (result.ok) return;
    __jait_capture(4, (result.error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_363_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];

try {
await (async()=>{

    const d = await db();
    d.exec("CREATE TABLE IF NOT EXISTS updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
    d.prepare("INSERT OR IGNORE INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_369_5_for0": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
const [label, sql] = ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_369_5_for1": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
const [label, sql] = ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_369_5_for2": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
const [label, sql] = ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_369_5_for3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
const [label, sql] = ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_369_5_for4": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
const [label, sql] = ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_369_5_for5": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];
const [label, sql] = ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"];

try {
await (async()=>{

      const svc = await service();
      const result = svc.query({ sql });
      __jait_capture(3, (result.ok));
    
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_376_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT load_extension('x')" });
    __jait_capture(3, (result.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_382_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];

try {
await (async()=>{

    const svc = await service();
    const write = svc.query({ sql: "SELECT writefile('/tmp/jait-adversarial-pwned', 'x') AS r" });
    __jait_capture(3, (write.ok));
    if (!write.ok) __jait_capture(4, (write.error));
    const read = svc.query({ sql: "SELECT readfile('/etc/passwd') AS r" });
    __jait_capture(5, (read.ok));
    if (!read.ok) __jait_capture(6, (read.error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_392_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "SELECT * FROM pragma_table_info('messages')" }), "readonly_violation");
    refused(svc.query({ sql: "SELECT * FROM pragma_journal_mode" }), "readonly_violation");
    refused(svc.query({ sql: "SELECT * FROM pragma_user_version" }), "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_399_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "PRAGMA journal_mode = WAL" }), "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_404_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const allowed: Array<[string, (r: AnyResult) => void]> = [
    // `updated_messages` is created right here: it proves a *real* table whose
    // name contains "update(d)" is queryable — not just a syntax error.
    ["table named like a mutation (created for the probe)", "SELECT id, note FROM updated_messages ORDER BY id LIMIT 1"],
    ["column named created_at / last_active_at", "SELECT created_at, last_active_at FROM sessions LIMIT 1"],
    ["strftime() date function", "SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM messages GROUP BY m"],
    ["max(last_active_at) aggregate", "SELECT MAX(last_active_at) AS latest FROM sessions"],
    ["user_id column on sessions", "SELECT user_id FROM sessions LIMIT 1"],
    ["banned word only inside a string literal", "SELECT 'delete from messages' AS s"],
  ];

try {
await (async()=>{

    const svc = await service();
    // KNOWN FALSE POSITIVE (reported to implementer): `replace(…)` is a legit
    // string function, but `REPLACE INTO` is a mutation. Current policy bans
    // the bare token everywhere → refuse. Safe direction; documented here.
    const result = svc.query({ sql: "SELECT replace('a-b', 'a', 'x') AS r" });
    refused(result, "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_418_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "EXPLAIN SELECT * FROM messages" }), "readonly_violation");
    refused(svc.query({ sql: "EXPLAIN QUERY PLAN SELECT * FROM messages" }), "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_424_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "VALUES (1), (2)" }), "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_429_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "(SELECT 1) UNION SELECT 2" });
    if (!result.ok) {
      // node:sqlite rejects a parenthesized compound at top level — that is a
      // native sql_error, NOT a statement-validation refusal.
      __jait_capture(3, (result.error));
    } else {
      __jait_capture(4, (result.ok));
    }
  
})();
__jait_record({slot:5,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_441_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({
      sql: "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 5) SELECT SUM(x) AS total FROM cnt",
    });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rows: { total: number }[] }).rows[0]?.total));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_451_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "\n-- discovery\nWITH t AS (SELECT 41 AS v) SELECT v + 1 AS w FROM t" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rows: { w: number }[] }).rows[0]?.w));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_459_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "DELETE FROM messages" }), "readonly_violation");
    refused(svc.query({ sql: "DROP TABLE messages" }), "readonly_violation");
    refused(svc.query({ sql: "BEGIN" }), "readonly_violation");
    refused(svc.query({ sql: "ATTACH ':memory:' AS evil" }), "readonly_violation");
    refused(svc.query({ sql: "VACUUM" }), "readonly_violation");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_473_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; columns: string[] };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
    __jait_capture(6, (data.columns)); // column names inferred from clamped SQL + first row (note: loses 'filler' — report finding)
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_484_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big LIMIT 999999" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number; truncated: boolean }).rowCount));
    __jait_capture(5, ((result.data as { truncated: boolean }).truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_493_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 999999 OFFSET 5" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    // KNOWN CLAMPING IMPRECISION (reported to implementer): appending the cap
    // yields `LIMIT 201 OFFSET 5` → 201 rows, not 196. Rows 6..205 are
    // returned (row 205 does not exist → 200 rows). Truncation is still
    // correct; only the count is off by the offset. Safe direction.
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
    __jait_capture(6, (data.rows[0]?.id)); // OFFSET preserved after clamping
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_508_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 5, 999999" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
    __jait_capture(6, (data.rows[0]?.id)); // comma-form offset preserved
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_519_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 5" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_529_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big LIMIT 201" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number }).rowCount));
    __jait_capture(5, ((result.data as { truncated: boolean }).truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_538_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big WHERE id <= 200" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number; truncated: boolean }).truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_546_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT * FROM (SELECT id FROM adv_big ORDER BY id LIMIT 3) AS t" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
    __jait_capture(6, (data.rows.map((r) => r.id)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_557_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({
      sql: "WITH top3 AS (SELECT id FROM adv_big ORDER BY id DESC LIMIT 3) SELECT id FROM top3",
    });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; rows: { id: number }[] };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.rows.map((r) => r.id)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_569_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big WHERE id IN (SELECT id FROM adv_big ORDER BY id DESC LIMIT 2)" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number }).rowCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_577_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({
      sql: "SELECT id FROM adv_big WHERE id <= 120 UNION ALL SELECT id FROM adv_big WHERE id > 120 ORDER BY id",
    });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_589_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT 'LIMIT 999999' AS literal" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rows: { literal: string }[] }).rows[0]?.literal));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_597_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id /* LIMIT 999999 */ LIMIT 999999" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number }).rowCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_605_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT 10", maxRows: 1 });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number }).rowCount));
    __jait_capture(5, ((result.data as { truncated: boolean }).truncated));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_614_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big", maxRows: 0.5 });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rowCount: number }).rowCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_622_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    for (const maxRows of [0, -5, 99999, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = svc.query({ sql: "SELECT id FROM adv_big", maxRows });
      __jait_capture(3, (result.ok));
      if (!result.ok) continue;
      const data = result.data as { rowCount: number; truncated: boolean };
      __jait_capture(4, (data.rowCount));
      __jait_capture(5, (data.truncated));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_634_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const first = svc.query({ sql: "SELECT 1 AS one" });
    __jait_capture(3, (first.ok));
    if (!first.ok) return;
    __jait_capture(4, (Array.isArray((first.data as { tables?: string[] }).tables)));
    const second = svc.query({ sql: "SELECT 1 AS one" });
    __jait_capture(5, (second.ok));
    if (!second.ok) return;
    __jait_capture(6, ("tables" in (second.data as object)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_651_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.schema();
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as {
      tables: { table: string; columns: { name: string; type: string }[] }[];
      blockedTables: string[];
    };
    const names = data.tables.map((t) => t.table);

    __jait_capture(4, (data.blockedTables));
    for (const blocked of data.blockedTables) __jait_capture(5, (names), (blocked));
    // Internal noise and fts5 shadow tables are hidden too:
    __jait_capture(6, (names));
    __jait_capture(7, (names));
    __jait_capture(8, (names));
    // Real content tables (incl. fts5 virtual parents) are listed:
    for (const expected of ["messages", "sessions", "agent_threads", "agent_thread_activities", "memories", "scheduled_jobs", "audit_log", "messages_fts", "agent_thread_activities_fts"]) {
      __jait_capture(9, (names), (expected));
    }
    // Fixture tables appear with columns:
    const big = data.tables.find((t) => t.table === "adv_big");
    __jait_capture(10, (big?.columns.map((c) => c.name)));
    for (const t of data.tables) __jait_capture(11, (Array.isArray(t.columns)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_680_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    refused(svc.query({ sql: "SELECT COUNT(*) AS n FROM user_secrets" }), "blocked_table");
    refused(svc.query({ sql: "SELECT username, password_hash FROM users LIMIT 1" }), "blocked_table");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_686_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    // This documents current behavior: sqlite_master is not on the blocklist,
    // so an agent could learn that e.g. `user_secrets` exists (names only —
    // not row data). Flagged to the implementer as a defense-in-depth gap.
    const result = svc.query({ sql: "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name" });
    __jait_capture(3, (result.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_702_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const result = await (await tool()).execute({
      sql: "SELECT s.name, COUNT(m.id) AS msgs FROM sessions s LEFT JOIN messages m ON m.session_id = s.id GROUP BY s.id ORDER BY msgs DESC, s.name LIMIT 3",
    });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as {
      columns: string[];
      rows: Record<string, unknown>[];
      rowCount: number;
      truncated: boolean;
      tables?: string[];
    };
    __jait_capture(4, (data.columns));
    __jait_capture(5, (data.rowCount));
    __jait_capture(6, (data.truncated));
    __jait_capture(7, (data.rows[0]));
    __jait_capture(8, (data.rows[1]));
    __jait_capture(9, (Array.isArray(data.tables))); // first query attaches table list
    __jait_capture(10, (typeof result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_724_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const result = await (await tool()).execute({
      sql: "SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM messages GROUP BY day ORDER BY day",
    });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rows: { day: string; n: number }[] };
    __jait_capture(4, (data.rows));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_738_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const direct = await (await tool()).execute({ sql: "SELECT id FROM adv_big", max_rows: 2 });
    __jait_capture(3, (direct.ok));
    if (!direct.ok) return;
    const data = direct.data as { rowCount: number; truncated: boolean };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
    __jait_capture(6, (direct.message));

    // Registry path coerces max_rows:"3" (string) → number 3.
    const registry = new ToolRegistry();
    registry.register(await tool());
    const context: ToolContext = {
      sessionId: "adv-test",
      actionId: "adv-action",
      projectRoot: "/home/jakob/jait",
      requestedBy: "tester",
    };
    const viaRegistry = await registry.execute(ToolName.SessionSql, { sql: "SELECT id FROM adv_big", max_rows: "3" }, context);
    __jait_capture(7, (viaRegistry.ok));
    if (!viaRegistry.ok) return;
    __jait_capture(8, ((viaRegistry.data as { rowCount: number }).rowCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_762_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const result = await (await tool()).execute({ mode: "schema" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { tables: unknown[]; blockedTables: string[] };
    __jait_capture(4, (data.tables.length));
    __jait_capture(5, (data.blockedTables));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_771_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const result = await (await tool()).execute({ mode: "schema", sql: "DELETE FROM messages" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ("tables" in (result.data as object)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_778_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const t = await tool();
    const blocked = await t.execute({ sql: "SELECT * FROM user_secrets" });
    __jait_capture(3, (blocked.ok));
    if (blocked.ok) return;
    __jait_capture(4, ((blocked.data as { error?: string }).error));

    const readonly = await t.execute({ sql: "DELETE FROM messages" });
    __jait_capture(5, (readonly.ok));
    if (readonly.ok) return;
    __jait_capture(6, ((readonly.data as { error?: string }).error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_791_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const result = await (await tool()).execute({ sql: "SELECT data FROM adv_blob_test" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    __jait_capture(4, ((result.data as { rows: { data: string }[] }).rows[0]?.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_798_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const t = await tool();
    const star = await t.execute({ sql: "SELECT * FROM messages WHERE 1 = 0" });
    __jait_capture(3, (star.ok));
    if (!star.ok) return;
    __jait_capture(4, ((star.data as { columns: string[] }).columns));

    const projection = await t.execute({ sql: "SELECT id, content FROM messages WHERE 1 = 0" });
    __jait_capture(5, (projection.ok));
    if (!projection.ok) return;
    __jait_capture(6, ((projection.data as { columns: string[] }).columns));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_829_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const t = await tool();
    for (const input of [{}, { sql: "" }, { sql: "   " }, { sql: null }]) {
      const result = await t.execute(input as SessionSqlToolInput);
      __jait_capture(3, (result.ok));
      if (result.ok) continue;
      __jait_capture(4, ((result.data as { error?: string }).error));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_839_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const t = await tool();
    for (const bad of [123, ["SELECT 1"], { sql: "x" }, true]) {
      const result = await t.execute({ sql: bad } as unknown as SessionSqlToolInput);
      __jait_capture(3, (result.ok));
      if (result.ok) continue;
      __jait_capture(4, ((result.data as { error?: string }).error));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_849_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const svc = await service();
    for (const bad of [123, ["SELECT 1"], true]) {
      const result = svc.query({ sql: bad } as unknown as { sql: string });
      __jait_capture(3, (result.ok));
      if (result.ok) continue;
      __jait_capture(4, (result.error));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_859_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const tool = async () => createSessionSqlTool(await service());

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register(await tool());
    const context: ToolContext = {
      sessionId: "adv-test",
      actionId: "adv-action",
      projectRoot: "/home/jakob/jait",
      requestedBy: "tester",
    };
    const result = await registry.execute(ToolName.SessionSql, { sql: 123 }, context);
    __jait_capture(3, (result.ok));
    if (result.ok) return;
    __jait_capture(4, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_884_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const cases: Array<[string, string]> = [
      ["writefile", "SELECT writefile('/tmp/jait-adversarial-pwned', 'x') AS r"],
      ["readfile", "SELECT readfile('/etc/passwd') AS r"],
      ["fts3_tokenizer", "SELECT fts3_tokenizer('simple') AS r"],
      ["zipfile", "SELECT zipfile('/tmp/jait-adversarial.zip') AS r"],
      ["sqlar", "SELECT sqlar('/tmp/jait-adversarial.tar') AS r"],
      ["load_extension", "SELECT load_extension('evil.so') AS r"],
      ["sqlite_load_extension", "SELECT sqlite_load_extension('evil.so') AS r"],
    ];
    for (const [name, sql] of cases) {
      const result = svc.query({ sql });
      refused(result, "banned_function");
      if (result.ok) continue;
      __jait_capture(3, (result.message), (name));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_903_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const cases = [
      "SELECT writefile ('/tmp/jait-adversarial-pwned', 'x') AS r", // space before (
      "SELECT WRITEFILE('/tmp/jait-adversarial-pwned', 'x') AS r", // case-insensitive
      'SELECT "writefile"(\'/tmp/jait-adversarial-pwned\', \'x\') AS r', // double-quoted name
      "SELECT [zipfile]('/tmp/jait-adversarial.zip') AS r", // bracketed name
      "SELECT `load_extension`('evil.so') AS r", // backticked name
      'SELECT "writefile" /*note*/ (\'/tmp/jait-adversarial-pwned\', \'x\') AS r', // comment between
    ];
    for (const sql of cases) refused(svc.query({ sql }), "banned_function");
  
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_916_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    // Fixture table named `writefile_log`.
    const table = svc.query({ sql: "SELECT * FROM writefile_log" });
    __jait_capture(3, (table.ok));
    // CTE named `zipfile`, and a column alias containing the banned name.
    const cte = svc.query({ sql: "WITH zipfile AS (SELECT 1 AS v) SELECT v FROM zipfile" });
    __jait_capture(4, (cte.ok));
    // `strftime` (the classic near-miss function) still allowed.
    const strftime = svc.query({ sql: "SELECT strftime('%Y', '2024-01-01') AS y" });
    __jait_capture(5, (strftime.ok));
    __jait_capture(6, (strftime.ok && strftime.data.rows[0].y));
    // String literal containing `writefile(` — never treated as a call.
    const literal = svc.query({ sql: "SELECT 'writefile(' || note AS tag FROM writefile_log" });
    __jait_capture(7, (literal.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_933_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const t = createSessionSqlTool(await service());
    const result = await t.execute({ sql: "SELECT readfile('/etc/passwd') AS r" });
    __jait_capture(3, (result.ok));
    if (result.ok) return;
    const data = result.data as { error?: string };
    __jait_capture(4, (data.error));
    __jait_capture(5, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for0": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for1": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for2": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for4": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for5": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for6": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_964_5_for7": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];
const [label, sql] = ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`];

try {
await (async()=>{

      const svc = await service();
      refused(svc.query({ sql }), "readonly_violation");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_970_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{
const cases: Array<[string, string]> = [
    ["double-quoted TVF name", `SELECT * FROM "pragma_table_info"('user_secrets')`],
    ["bracketed TVF name", `SELECT * FROM [pragma_table_info]('user_secrets')`],
    ["backticked TVF name", "SELECT * FROM `pragma_table_info`('user_secrets')"],
    ["double-quoted UPPERCASE", `SELECT * FROM "PRAGMA_TABLE_INFO"('user_secrets')`],
    ["quoted standalone pragma TVF", `SELECT * FROM "pragma_journal_mode"('DELETE')`],
    ["quoted pragma_* table name", `SELECT * FROM "pragma_user_version"`],
    ["quoted TVF name in a UNION arm", `SELECT 1 AS one UNION SELECT * FROM "pragma_table_list"`],
    ["quoted TVF name as alias", `SELECT id FROM messages AS "pragma_table_info" LIMIT 1`],
  ];

try {
await (async()=>{

    const svc = await service();
    // A quoted column that only *mentions* pragma (no underscore suffix):
    const alias = svc.query({ sql: `SELECT 1 AS "pragma"` });
    __jait_capture(3, (alias.ok));
    if (alias.ok) __jait_capture(4, ((alias.data as { rows: { pragma: number }[] }).rows[0]?.pragma));
    // A quoted alias whose name merely contains the substring:
    const contains = svc.query({ sql: `SELECT 1 AS "my_pragma_table_info"` });
    __jait_capture(5, (contains.ok));
    // A quoted column of a real fixture table:
    const column = svc.query({ sql: `SELECT "content" FROM "messages" ORDER BY id LIMIT 1` });
    __jait_capture(6, (column.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_994_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT -1" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean; rows: { id: number }[] };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
    __jait_capture(6, (data.rows[0]?.id));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_adversarial_test_ts_1005_3": {


let sqlite: SqliteDatabase | undefined;
async function db(): Promise<SqliteDatabase> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return sqlite;
}
async function service(): Promise<SessionSqlService> {
  return new SessionSqlService(await db());
}
function seedFixtures(db: SqliteDatabase): void {
  db.exec("CREATE TABLE updated_messages (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO updated_messages (id, note) VALUES (1, 'probe')").run();
  db.exec("CREATE TABLE adv_big (id INTEGER PRIMARY KEY, filler TEXT)");
  const insertBig = db.prepare("INSERT INTO adv_big (id, filler) VALUES (?, ?)");
  for (let i = 1; i <= 250; i += 1) insertBig.run(i, `row-${i}`);

  db.exec("CREATE TABLE adv_blob_test (id INTEGER PRIMARY KEY, data BLOB)");
  db.prepare("INSERT INTO adv_blob_test (data) VALUES (?)").run(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

  // Benign table whose NAME contains a banned function name — querying it
  // must stay allowed (banned functions are only refused as CALLS).
  db.exec("CREATE TABLE writefile_log (id INTEGER PRIMARY KEY, note TEXT)");
  db.prepare("INSERT INTO writefile_log (id, note) VALUES (?, ?)").run(1, "probe");

  db.prepare(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z");

  const session = (id: string, name: string, path: string, createdAt: string) =>
    db.prepare(
      "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, "user-1", name, path, createdAt, createdAt, "completed");
  session("sess-a", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z");
  session("sess-b", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z");

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    db.prepare("INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, sessionId, role, content, createdAt);
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-a", "user", "old message seeded for date coverage", "2026-01-20T08:30:00.000Z");
}
type AnyResult = { ok: boolean; error?: string; message?: string; data?: unknown };
function refused(result: AnyResult, error: string): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (error));
  __jait_capture(2, (result.message));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const svc = await service();
    const result = svc.query({ sql: "SELECT id FROM adv_big ORDER BY id LIMIT +5" });
    __jait_capture(3, (result.ok));
    if (!result.ok) return;
    const data = result.data as { rowCount: number; truncated: boolean };
    __jait_capture(4, (data.rowCount));
    __jait_capture(5, (data.truncated));
  
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
