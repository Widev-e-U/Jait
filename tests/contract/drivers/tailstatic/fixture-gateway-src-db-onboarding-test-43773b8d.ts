// Translated fixture from packages/gateway/src/db/onboarding.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase, verifySchema, getSchemaVersion } from "../../../../packages/gateway/src/db/connection.js";
import { migrations } from "../../../../packages/gateway/src/db/migrations.js";
import * as schema from "../../../../packages/gateway/src/db/schema.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import type { JaitDB } from "../../../../packages/gateway/src/db/connection.js";

import { SessionSearchService } from "../../../../packages/gateway/src/services/session-search.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/db/onboarding.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_50_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    __jait_thrown(0, () => migrateDatabase(sqlite));
    __jait_capture(1, (getSchemaVersion(sqlite)), (Math.max(...migrations.map((m) => m.id))));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_55_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);

    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    ).map((r) => r.name).filter((n) => !n.startsWith("_") && n !== "sqlite_sequence");

    const expected = [
      "agent_thread_activities",
      "agent_threads",
      "architecture_diagrams",
      "code_graph_indexes",
      "audit_log",
      "automation_plans",
      "automation_repositories",
      "consent_log",
      "consent_session_approvals",
      "memories",
      "messages",
      "message_context_metadata",
      "network_hosts",
      "reminders",
      "scheduled_job_runs",
      "scheduled_jobs",
      "session_state",
      "sessions",
      "trust_levels",
      "user_settings",
      "users",
      "project_state",
      "projects",
    ];

    for (const table of expected) {
      __jait_capture(0, (tables), (table));
    }
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_93_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);

    const columns = (
      sqlite.prepare("PRAGMA table_info(agent_threads)").all() as { name: string }[]
    ).map((c) => c.name);

    // Every column defined in the Drizzle schema must exist
    const expectedColumns = [
      "id", "user_id", "session_id", "title", "provider_id",
      "model", "reasoning_effort", "runtime_mode", "kind", "working_directory", "branch",
      "status", "provider_session_id", "error", "pr_url", "pr_number",
      "pr_title", "pr_base_branch", "pr_state", "execution_node_id", "execution_node_name",
      "skill_ids", "routing_plan", "change_files", "change_insertions",
      "change_deletions", "created_at", "updated_at", "completed_at",
    ];

    for (const col of expectedColumns) {
      __jait_capture(0, (columns), (col));
    }
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_115_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);

    // This is the exact query that crashed in v0.1.207
    const rows = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .orderBy(desc(schema.agentThreads.updatedAt))
      .all();

    __jait_capture(0, (rows));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_129_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);

    const now = new Date().toISOString();
    db.insert(schema.agentThreads)
      .values({
        id: "test-thread-1",
        title: "Test thread",
        providerId: "jait",
        kind: "delegation",
        status: "running",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const rows = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .all();

    __jait_capture(0, (rows));
    __jait_capture(1, (rows[0].kind));
    __jait_capture(2, (rows[0].title));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_156_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);

    // Attempt a SELECT from every table — if any column is missing,
    // Drizzle will generate SQL referencing it and SQLite will throw.
    const schemaTables = [
      schema.projects,
      schema.sessions,
      schema.users,
      schema.userSettings,
      schema.auditLog,
      schema.trustLevels,
      schema.consentLog,
      schema.consentSessionApprovals,
      schema.memories,
      schema.messages,
      schema.sessionState,
      schema.projectState,
      schema.architectureDiagrams,
      schema.codeGraphIndexes,
      schema.agentThreads,
      schema.agentThreadActivities,
      schema.automationRepositories,
      schema.automationPlans,
      schema.networkHosts,
      schema.scheduledJobs,
      schema.scheduledJobRuns,
    ];

    for (const table of schemaTables) {
      __jait_thrown(0, () => {
        db.select().from(table).all();
      });
    }
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_192_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);
    __jait_thrown(0, () => migrateDatabase(sqlite));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_199_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    applyMigrationsThrough(51);
    sqlite.prepare(`
      INSERT INTO messages (id, session_id, role, content, context_flow, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      "message-with-memory",
      "session-1",
      "assistant",
      "done",
      JSON.stringify({ memory: { injectedIds: ["memory-1"] }, rounds: [] }),
      new Date().toISOString(),
    );

    const migration = migrations.find((entry) => entry.id === 52);
    __jait_captureType(0, (migration));
    if (!migration) return;
    migration.run(sqlite);

    __jait_capture(1, (sqlite.prepare(`
      SELECT message_id AS messageId, has_memory_provenance AS hasMemoryProvenance
      FROM message_context_metadata
    `).all()));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_224_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    applyMigrationsThrough(53);

    const now = "2026-08-11T09:00:00.000Z";
    sqlite.prepare(`
      INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, embedding, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "memory-keep",
      "project",
      "Ranking uses BM25 over memory content.",
      "chat",
      "session-1",
      "chat",
      JSON.stringify({ ranking: 1, bm25: 1 }),
      now,
      now,
    );

    const migration = migrations.find((entry) => entry.id === 54);
    __jait_captureType(0, (migration));
    if (!migration) return;
    migration.run(sqlite);
    // Re-running must not fail: the column is already gone.
    migration.run(sqlite);

    __jait_capture(1, (sqlite.prepare(`
      SELECT id, scope, content FROM memories
    `).all()));

    const columns = sqlite.prepare(`PRAGMA table_info(memories)`).all() as { name: string }[];
    __jait_capture(2, (columns.map((column) => column.name)));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_262_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    applyMigrationsThrough(54);

    const now = "2026-08-11T09:00:00.000Z";
    sqlite.prepare(`
      INSERT INTO memories (id, scope, content, source_type, source_id, source_surface, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "memory-compatible",
      "project",
      "Ranking uses BM25 over memory content.",
      "chat",
      "session-1",
      "chat",
      now,
      now,
    );

    const migration = migrations.find((entry) => entry.id === 56);
    __jait_captureType(0, (migration));
    if (!migration) return;
    migration.run(sqlite);
    migration.run(sqlite);

    __jait_capture(1, (sqlite.prepare(`
      SELECT id, content, embedding FROM memories
    `).all()));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_295_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    const ids = migrations.map((migration) => migration.id);
    __jait_capture(0, (new Set(ids).size), (ids.length));
    __jait_capture(1, (migrations.find((migration) => migration.name === "agent_threads_reasoning_effort")?.id));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_303_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    applyMigrationsThrough(36);

    const now = "2026-05-25T18:00:00.000Z";
    sqlite.prepare(`
      INSERT INTO workspaces (id, user_id, title, root_path, node_id, created_at, last_active_at, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "workspace-upgrade",
      "user-upgrade",
      "Upgrade Workspace",
      "/home/alice/jait",
      "gateway",
      now,
      now,
      "active",
      JSON.stringify({ pinned: true }),
    );
    sqlite.prepare(`
      INSERT INTO sessions (id, user_id, name, workspace_path, workspace_id, created_at, last_active_at, status, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "session-upgrade",
      "user-upgrade",
      "Upgrade Session",
      "/home/alice/jait",
      "workspace-upgrade",
      now,
      now,
      "active",
      JSON.stringify({ source: "upgrade-test" }),
    );
    sqlite.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "message-upgrade",
      "session-upgrade",
      "user",
      "The local upgrade retained this searchable migration context.",
      now,
    );
    sqlite.prepare(`
      INSERT INTO reminders (
        id,
        user_id,
        workspace_id,
        session_id,
        content,
        source_type,
        source_id,
        source_surface,
        status,
        tags,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "reminder-upgrade",
      "user-upgrade",
      "workspace-upgrade",
      "session-upgrade",
      "Remember that upgrade tests must preserve local data.",
      "agent",
      "source-upgrade",
      "chat",
      "active",
      JSON.stringify(["database", "upgrade"]),
      now,
      now,
    );

    migrateDatabase(sqlite);

    const session = sqlite.prepare(`
      SELECT project_id AS projectId, project_path AS projectPath, metadata
      FROM sessions
      WHERE id = ?
    `).get("session-upgrade") as { projectId: string; projectPath: string; metadata: string };
    __jait_capture(0, (session), ({
      projectId: "workspace-upgrade",
      projectPath: "/home/alice/jait",
      metadata: JSON.stringify({ source: "upgrade-test" }),
    }));

    const project = sqlite.prepare(`
      SELECT id, root_path AS rootPath, metadata
      FROM projects
      WHERE id = ?
    `).get("workspace-upgrade") as { id: string; rootPath: string; metadata: string };
    __jait_capture(1, (project), ({
      id: "workspace-upgrade",
      rootPath: "/home/alice/jait",
      metadata: JSON.stringify({ pinned: true }),
    }));

    const reminder = sqlite.prepare(`
      SELECT project_id AS projectId, session_id AS sessionId, content
      FROM reminders
      WHERE id = ?
    `).get("reminder-upgrade") as { projectId: string; sessionId: string; content: string };
    __jait_capture(2, (reminder));

    const searchResults = new SessionSearchService(sqlite).search({
      query: "searchable migration context",
      userId: "user-upgrade",
      includeThreadActivities: false,
    });
    __jait_capture(3, (searchResults));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_425_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    const failingMigration = {
      id: 10_000,
      name: "intentional_bad_ddl",
      run(db: SqliteDatabase) {
        db.exec("CREATE TABLE messages (id TEXT)");
      },
    };
    migrations.push(failingMigration);
    try {
      __jait_thrown(0, () => migrateDatabase(sqlite));
      __jait_captureType(1, (sqlite.prepare("SELECT 1 FROM _migrations WHERE id = ?").get(failingMigration.id) ?? undefined));
    } finally {
      migrations.pop();
    }
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_446_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    // Simulate an old DB: create agent_threads WITHOUT the kind column
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agent_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        title TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT,
        runtime_mode TEXT NOT NULL DEFAULT 'full-access',
        working_directory TEXT,
        branch TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        provider_session_id TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    // Verify kind is missing
    const colsBefore = (
      sqlite.prepare("PRAGMA table_info(agent_threads)").all() as { name: string }[]
    ).map((c) => c.name);
    __jait_capture(0, (colsBefore));

    // Run verifySchema — it should repair the missing column
    verifySchema(sqlite);

    const colsAfter = (
      sqlite.prepare("PRAGMA table_info(agent_threads)").all() as { name: string }[]
    ).map((c) => c.name);
    __jait_capture(1, (colsAfter));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_483_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    // Create the full old schema first (so migrations are "already done")
    migrateDatabase(sqlite);

    // Simulate corruption: drop and recreate without kind
    sqlite.exec("DROP TABLE agent_threads");
    sqlite.exec(`
      CREATE TABLE agent_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        title TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT,
        runtime_mode TEXT NOT NULL DEFAULT 'full-access',
        working_directory TEXT,
        branch TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        provider_session_id TEXT,
        error TEXT,
        pr_url TEXT,
        pr_number INTEGER,
        pr_title TEXT,
        pr_state TEXT,
        execution_node_id TEXT,
        execution_node_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);

    // Insert a row without kind
    const now = new Date().toISOString();
    sqlite.prepare(
      "INSERT INTO agent_threads (id, title, provider_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("old-thread", "Legacy thread", "jait", "running", now, now);

    // This would have crashed in v0.1.207
    __jait_thrown(0, () => {
      db.select().from(schema.agentThreads).where(and(eq(schema.agentThreads.status, "running"), isNotNull(schema.agentThreads.kind))).all();
    }); // Should throw because kind column is missing

    // Run verifySchema to repair
    verifySchema(sqlite);

    // Now the same query should work
    const rows = db
      .select()
      .from(schema.agentThreads)
      .where(and(eq(schema.agentThreads.status, "running"), isNotNull(schema.agentThreads.kind)))
      .all();

    __jait_capture(1, (rows));
    __jait_capture(2, (rows[0].kind)); // DEFAULT value
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_540_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    // Create bare-bones tables missing several columns
    sqlite.exec(`
      CREATE TABLE user_settings (
        user_id TEXT PRIMARY KEY,
        theme TEXT NOT NULL DEFAULT 'system',
        api_keys TEXT,
        updated_at TEXT NOT NULL
      )
    `);
    sqlite.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    verifySchema(sqlite);

    // Check user_settings got its missing columns
    const usCols = (
      sqlite.prepare("PRAGMA table_info(user_settings)").all() as { name: string }[]
    ).map((c) => c.name);
    __jait_capture(0, (usCols));
    __jait_capture(1, (usCols));
    __jait_capture(2, (usCols));
    __jait_capture(3, (usCols));
    __jait_capture(4, (usCols));

    // Check messages got its missing columns
    const msgCols = (
      sqlite.prepare("PRAGMA table_info(messages)").all() as { name: string }[]
    ).map((c) => c.name);
    __jait_capture(5, (msgCols));
    __jait_capture(6, (msgCols));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_580_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    // No tables created at all — verifySchema should not crash
    __jait_thrown(0, () => verifySchema(sqlite));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_585_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    migrateDatabase(sqlite);
    // All columns exist — should be a no-op
    __jait_thrown(0, () => verifySchema(sqlite));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_onboarding_test_ts_593_3": {

const { eq, desc, and, isNotNull } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
function applyMigrationsThrough(maxId: number): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    if (migration.id > maxId) continue;
    migration.run(sqlite);
    sqlite.prepare(
      "INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)"
    ).run(migration.id, migration.name, new Date().toISOString());
  }
}
const __jait_hook_880 = async () => {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
};
const __jait_hook_1003 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_880();
try {
await (async()=>{

    // This mirrors the exact sequence in index.ts main()
    migrateDatabase(sqlite);

    // 1. ThreadService.listRunning() — the exact call that crashed
    const runningThreads = db
      .select()
      .from(schema.agentThreads)
      .where(eq(schema.agentThreads.status, "running"))
      .orderBy(desc(schema.agentThreads.updatedAt))
      .all();
    __jait_capture(0, (runningThreads));

    // 2. Query sessions (SessionService)
    const sessions = db.select().from(schema.sessions).all();
    __jait_capture(1, (sessions));

    // 3. Query users (UserService)
    const users = db.select().from(schema.users).all();
    __jait_capture(2, (users));

    // 4. Query scheduled jobs (SchedulerService)
    const jobs = db
      .select()
      .from(schema.scheduledJobs)
      .where(eq(schema.scheduledJobs.enabled, 1))
      .all();
    __jait_capture(3, (jobs));

    // 5. Query projects (ProjectService)
    const projects = db.select().from(schema.projects).all();
    __jait_capture(4, (projects));

    // 6. Query memories
    const memories = db.select().from(schema.memories).all();
    __jait_capture(5, (memories));
  
})();

} finally {
await __jait_hook_1003();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
