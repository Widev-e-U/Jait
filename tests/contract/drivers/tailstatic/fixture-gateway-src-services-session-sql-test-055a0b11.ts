// Translated fixture from packages/gateway/src/services/session-sql.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { SessionSqlService } from "../../../../packages/gateway/src/services/session-sql.js";
import { createSessionSqlTool } from "../../../../packages/gateway/src/tools/session-sql-tools.js";
import { ToolName } from "../../../../packages/gateway/src/tools/tool-names.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/session-sql.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_112_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT id, role, content FROM messages ORDER BY id LIMIT 10" });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.columns));
      __jait_capture(5, (data.rowCount));
      __jait_capture(6, (data.truncated));
      __jait_capture(7, (data.rows[0]));
      // First call includes the queryable table list; blocked/internal tables excluded.
      __jait_capture(8, (data.tables));
      __jait_capture(9, (data.tables));
      __jait_capture(10, (data.tables));
      __jait_capture(11, (data.tables));
      __jait_capture(12, (data.tables));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_131_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({
        sql: "WITH recent AS (SELECT * FROM messages WHERE created_at >= '2026-02-01') SELECT COUNT(*) AS n FROM recent",
      });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rows[0]));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_143_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const byDay = service.query({
        sql: "SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM messages GROUP BY d ORDER BY d DESC LIMIT 14",
      });
      __jait_capture(3, (byDay.ok));
      if (!byDay.ok) return;
      const dayData = byDay.data;
      if (!("rows" in dayData)) throw new Error("expected query result");
      __jait_capture(4, (dayData.rows));

      const joined = service.query({
        sql: "SELECT s.id, COUNT(t.id) AS threads FROM sessions s LEFT JOIN agent_threads t ON t.session_id = s.id GROUP BY s.id ORDER BY s.id",
      });
      __jait_capture(5, (joined.ok));
      if (!joined.ok) return;
      const joinData = joined.data;
      if (!("rows" in joinData)) throw new Error("expected query result");
      __jait_capture(6, (joinData.rows));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_172_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const first = service.query({ sql: "SELECT COUNT(*) AS n FROM sessions" });
      const second = service.query({ sql: "SELECT COUNT(*) AS n FROM sessions" });
      __jait_capture(3, (first.ok && second.ok));
      if (!first.ok || !second.ok) return;
      const firstData = first.data;
      const secondData = second.data;
      if (!("rows" in firstData) || !("rows" in secondData)) throw new Error("expected query results");
      __jait_captureType(4, (firstData.tables));
      __jait_captureType(5, (secondData.tables));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_185_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const commented = service.query({
        sql: "-- pick everything\n/* still one statement */\nSELECT id FROM sessions WHERE name != 'drop table users' LIMIT 5;",
      });
      __jait_capture(3, (commented.ok));
      if (!commented.ok) return;
      const data = commented.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rowCount));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for0": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for1": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for2": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["delete", "DELETE FROM messages", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for3": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["drop", "DROP TABLE messages", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for4": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for6": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for7": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for8": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for9": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for10": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["detach", "DETACH DATABASE x", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for11": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["vacuum", "VACUUM", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for12": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["reindex", "REINDEX", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for13": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["begin", "BEGIN TRANSACTION", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for14": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["commit", "COMMIT", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for15": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_220_7_for16": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];
const [label, sql, expectedError] = ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"];

try {
await (async()=>{

        const service = await setup();
        const result = service.query({ sql });
        expectError(result, expectedError);
      
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_227_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

try {
await (async()=>{

      const service = await setup();
      expectError(service.query({ sql: "" }), "invalid_sql");
      expectError(service.query({ sql: "   \n\t " }), "invalid_sql");
      expectError(service.query({ sql: "-- nothing here\n/* or here */" }), "invalid_sql");
    
})();
__jait_record({slot:3,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_234_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

try {
await (async()=>{

      const service = await setup();
      const prose = service.query({ sql: "hello world" });
      __jait_capture(3, (prose.ok));
      if (!prose.ok) __jait_capture(4, (prose.error));
      const explain = service.query({ sql: "EXPLAIN SELECT 1" });
      __jait_capture(5, (explain.ok));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_243_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

try {
await (async()=>{

      const service = await setup();
      expectError(service.query({ sql: "SELECT 1; SELECT 2" }), "multi_statement");
      expectError(service.query({ sql: "SELECT 1; DROP TABLE messages" }), "multi_statement");
      // A single trailing semicolon is fine — even with trailing whitespace.
      __jait_capture(3, (service.query({ sql: "SELECT 1;" }).ok));
      __jait_capture(4, (service.query({ sql: "SELECT 1; \n\t " }).ok));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_252_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

try {
await (async()=>{

      const service = await setup();
      // Keyword as a bare word inside the statement body is still caught.
      const sneaky = service.query({ sql: "SELECT * FROM sessions WHERE status = 'active' UNION SELECT 1, 2, 3, 4, 5, 6, 7, 8 FROM pragma_user_settings" });
      __jait_capture(3, (sneaky.ok));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_259_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

try {
await (async()=>{

      const service = await setup();
      const queries = [
        "SELECT * FROM user_secrets",
        "SELECT key FROM user_secrets WHERE id = 'sec-1'",
        "SELECT id FROM users",
        "SELECT * FROM user_settings",
        "SELECT s.id FROM sessions s JOIN user_secrets u ON u.user_id = s.user_id",
        "SELECT (SELECT COUNT(*) FROM user_secrets) AS leaked",
        'SELECT * FROM "user_secrets"',
        "WITH c AS (SELECT * FROM user_secrets) SELECT * FROM c",
        "SELECT * FROM automation_repositories",
        "SELECT * FROM mobile_push_registrations",
      ];
      for (const sql of queries) {
        const result = service.query({ sql });
        __jait_capture(3, (result.ok));
        if (!result.ok) __jait_capture(4, (result.error));
      }
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_280_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const rejectionCases: Array<[string, string, string]> = [
      ["insert", "INSERT INTO sessions (id, user_id, created_at, last_active_at) VALUES ('x', 'u', 'now', 'now')", "readonly_violation"],
      ["update", "UPDATE sessions SET status = 'archived'", "readonly_violation"],
      ["delete", "DELETE FROM messages", "readonly_violation"],
      ["drop", "DROP TABLE messages", "readonly_violation"],
      ["create", "CREATE TABLE evil (id TEXT)", "readonly_violation"],
      ["alter", "ALTER TABLE sessions ADD COLUMN evil TEXT", "readonly_violation"],
      ["pragma", "PRAGMA table_info(sessions)", "readonly_violation"],
      ["pragma journal mode", "PRAGMA journal_mode = WAL", "readonly_violation"],
      ["pragma function form", "SELECT * FROM pragma_table_info('sessions') WHERE 1=1", "readonly_violation"],
      ["attach", "ATTACH DATABASE '/tmp/x.db' AS x", "readonly_violation"],
      ["detach", "DETACH DATABASE x", "readonly_violation"],
      ["vacuum", "VACUUM", "readonly_violation"],
      ["reindex", "REINDEX", "readonly_violation"],
      ["begin", "BEGIN TRANSACTION", "readonly_violation"],
      ["commit", "COMMIT", "readonly_violation"],
      ["transaction", "BEGIN; SELECT 1; COMMIT;", "multi_statement"],
      ["mutation in CTE", "WITH x AS (SELECT 1) DELETE FROM messages", "readonly_violation"],
    ];

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT COUNT(*) AS n FROM consent_log" });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rows[0]));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_292_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM audit_log ORDER BY id" });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rowCount));
      __jait_capture(5, (data.truncated));
      __jait_capture(6, (data.rows));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_304_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM audit_log ORDER BY id", maxRows: 5 });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rowCount));
      __jait_capture(5, (data.truncated));
      __jait_capture(6, (data.rows[0]));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_316_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM audit_log ORDER BY id", maxRows: 10000 });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rowCount));
      __jait_capture(5, (data.truncated));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_327_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM messages LIMIT 500000" });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rowCount));
      __jait_capture(5, (data.truncated));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_338_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.query({ sql: "SELECT id FROM messages", maxRows: 10 });
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("rows" in data)) throw new Error("expected query result");
      __jait_capture(4, (data.rowCount));
      __jait_capture(5, (data.truncated));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_351_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const result = service.schema();
      __jait_capture(3, (result.ok));
      if (!result.ok) return;
      const data = result.data;
      if (!("tables" in data)) throw new Error("expected schema summary");
      const byName = new Map(data.tables.map((table) => [table.table, table]));
      const sessions = byName.get("sessions");
      __jait_captureType(4, (sessions));
      __jait_capture(5, (sessions?.columns.map((column) => column.name)));
      __jait_capture(6, (sessions?.columns.find((column) => column.name === "created_at")?.type));
      // Blocked tables are named but not described.
      __jait_capture(7, (data.blockedTables));
      __jait_capture(8, (data.blockedTables));
      __jait_captureType(9, (data.tables.find((table) => table.table === "user_secrets")));
      __jait_captureType(10, (data.tables.find((table) => table.table === "_migrations")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_381_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = new SessionSqlService({
        exec: () => {},
        close: () => {},
        transaction: () => ({}) as never,
        prepare: () => {
          throw new Error("boom");
        },
      } as never);
      const result = service.schema();
      __jait_capture(3, (result.ok));
      if (!result.ok) __jait_capture(4, (result.error));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_397_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const tool = createSessionSqlTool(service);
      __jait_capture(3, (tool.name), (ToolName.SessionSql));
      __jait_capture(4, (tool.name));

      const schemaResult = await tool.execute({ mode: "schema" }, undefined as never);
      __jait_capture(5, (schemaResult.ok));
      const schemaData = schemaResult.data as { tables?: unknown[] };
      __jait_capture(6, (Array.isArray(schemaData.tables)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_409_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const tool = createSessionSqlTool(service);
      const result = await tool.execute({}, undefined as never);
      __jait_capture(3, (result.ok));
      __jait_capture(4, (result.data));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_417_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const tool = createSessionSqlTool(service);
      const result = await tool.execute({ sql: "SELECT id FROM messages" }, undefined as never);
      __jait_capture(3, (result.ok));
      __jait_capture(4, (result.message));
      const data = result.data as { truncated?: boolean };
      __jait_capture(5, (data.truncated));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_sql_test_ts_427_5": {


let sqlite: SqliteDatabase | undefined;
async function setup(): Promise<SessionSqlService> {
  if (!sqlite) {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    seedFixtures(opened.sqlite);
    sqlite = opened.sqlite;
  }
  return new SessionSqlService(sqlite);
}
function expectError(
  result: { ok: boolean; error?: string; message?: string },
  expectedError: string,
): void {
  __jait_capture(0, (result.ok));
  if (result.ok) return;
  __jait_capture(1, (result.error), (expectedError));
  __jait_capture(2, (result.message));
}
function seedFixtures(db: SqliteDatabase): void {
  const insert = (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params);

  insert(
    "INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    "user-1", "jakob", "secret-hash-never-leaked", "2026-01-05T09:00:00.000Z", "2026-01-05T09:00:00.000Z",
  );

  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-a", "user-1", "Refactor gateway", "/home/jakob/jait", "2026-02-10T10:00:00.000Z", "2026-02-10T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-b", "user-1", "Write docs", "/home/jakob/jait", "2026-02-11T10:00:00.000Z", "2026-02-11T11:00:00.000Z", "completed",
  );
  insert(
    "INSERT INTO sessions (id, user_id, name, project_path, created_at, last_active_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    "sess-c", "user-1", "Old chat", "/tmp/other", "2026-01-20T10:00:00.000Z", "2026-01-20T11:00:00.000Z", "completed",
  );

  const message = (id: string, sessionId: string, role: string, content: string, createdAt: string) =>
    insert(
      "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      id, sessionId, role, content, createdAt,
    );
  message("m-1", "sess-a", "user", "fix the flaky test", "2026-02-10T10:01:00.000Z");
  message("m-2", "sess-a", "assistant", "done", "2026-02-10T10:02:00.000Z");
  message("m-3", "sess-b", "user", "draft the README", "2026-02-11T10:01:00.000Z");
  message("m-4", "sess-c", "user", "hello", "2026-01-20T10:01:00.000Z");

  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-1", "user-1", "sess-a", "subagent fix", "openai", "gpt-5", "completed", "2026-02-10T10:03:00.000Z", "2026-02-10T10:05:00.000Z",
  );
  insert(
    "INSERT INTO agent_threads (id, user_id, session_id, title, provider_id, model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "th-2", "user-1", "sess-b", "subagent docs", "openai", "gpt-5", "completed", "2026-02-11T10:03:00.000Z", "2026-02-11T10:05:00.000Z",
  );

  insert(
    "INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "mem-1", "user-1", "prefers bun over npm", "chat", "sess-a", "gateway", "[]", "2026-02-10T12:00:00.000Z", "2026-02-10T12:00:00.000Z",
  );

  insert(
    "INSERT INTO scheduled_jobs (id, user_id, name, cron, tool_name, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    "job-1", "user-1", "nightly backup", "0 3 * * *", "terminal.run", 1, "2026-02-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z",
  );
  const run = (id: string, jobId: string, status: string, startedAt: string, completedAt: string) =>
    insert(
      "INSERT INTO scheduled_job_runs (id, job_id, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?)",
      id, jobId, status, startedAt, completedAt,
    );
  run("run-1", "job-1", "succeeded", "2026-02-10T03:00:00.000Z", "2026-02-10T03:01:00.000Z");
  run("run-2", "job-1", "succeeded", "2026-02-11T03:00:00.000Z", "2026-02-11T03:01:00.000Z");
  run("run-3", "job-1", "failed", "2026-02-12T03:00:00.000Z", "2026-02-12T03:01:00.000Z");

  insert(
    "INSERT INTO user_secrets (id, user_id, type, key, label, encrypted_value, iv, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "sec-1", "user-1", "api_key", "openai", "OpenAI key", "enc-blob", "iv-blob", "tag-blob", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
  );

  // 260-row table to exercise truncation.
  for (let i = 0; i < 260; i += 1) {
    insert(
      "INSERT INTO audit_log (id, timestamp, session_id, action_id, action_type, tool_name, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      `audit-${i}`, `2026-02-10T${String(8 + (i % 12)).padStart(2, "0")}:00:00.000Z`, "sess-a", `act-${i}`, "call", "terminal.run", "completed",
    );
  }
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{

try {
await (async()=>{

      const service = await setup();
      const tool = createSessionSqlTool(service);
      const mutation = await tool.execute({ sql: "DELETE FROM messages" }, undefined as never);
      __jait_capture(3, (mutation.ok));
      __jait_capture(4, (mutation.data));

      const blocked = await tool.execute({ sql: "SELECT * FROM user_secrets" }, undefined as never);
      __jait_capture(5, (blocked.ok));
      __jait_capture(6, (blocked.data));
    
})();

} finally {

}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
