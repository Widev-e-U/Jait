// Translated fixture from packages/gateway/src/db/repository-dedupe-migration.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase, type SqliteDatabase } from "../../../../packages/gateway/src/db/connection.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/db/repository-dedupe-migration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_db_repository_dedupe_migration_test_ts_45_3": {


/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
function rewindToV61() {
    sqlite.exec("DROP INDEX IF EXISTS idx_automation_repos_user_path");
    sqlite.exec("DELETE FROM _migrations WHERE id = 62");
  }
function insertRepo(id: string, userId: string | null, localPath: string, createdAt: string) {
    sqlite
      .prepare(
        `INSERT INTO automation_repositories (id, user_id, device_id, name, default_branch, local_path, created_at, updated_at)
         VALUES (?, ?, 'desktop-1', 'Zinsrechner', 'main', ?, ?, ?)`,
      )
      .run(id, userId, localPath, createdAt, createdAt);
  }
const __jait_hook_1444 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    rewindToV61();
  };
const __jait_hook_1625 = () => {
    sqlite.close();
  };
await __jait_hook_1444();
try {
await (async()=>{

    insertRepo("repo-a", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.912Z");
    insertRepo("repo-b", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.930Z");
    insertRepo("repo-c", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:27.002Z");
    // A different user's copy of the same path is a separate repository.
    insertRepo("repo-other", "user-2", "E:\\Zinsrechner", "2026-07-22T07:13:27.010Z");

    migrateDatabase(sqlite);

    const ids = (sqlite.prepare("SELECT id FROM automation_repositories ORDER BY id").all() as { id: string }[])
      .map((row) => row.id);
    __jait_capture(0, (ids));
  
})();

} finally {
await __jait_hook_1625();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_repository_dedupe_migration_test_ts_59_3": {


/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
function rewindToV61() {
    sqlite.exec("DROP INDEX IF EXISTS idx_automation_repos_user_path");
    sqlite.exec("DELETE FROM _migrations WHERE id = 62");
  }
function insertRepo(id: string, userId: string | null, localPath: string, createdAt: string) {
    sqlite
      .prepare(
        `INSERT INTO automation_repositories (id, user_id, device_id, name, default_branch, local_path, created_at, updated_at)
         VALUES (?, ?, 'desktop-1', 'Zinsrechner', 'main', ?, ?, ?)`,
      )
      .run(id, userId, localPath, createdAt, createdAt);
  }
const __jait_hook_1444 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    rewindToV61();
  };
const __jait_hook_1625 = () => {
    sqlite.close();
  };
await __jait_hook_1444();
try {
await (async()=>{

    insertRepo("repo-a", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.912Z");
    insertRepo("repo-b", "user-1", "E:\\Zinsrechner", "2026-07-22T07:13:26.930Z");
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO automation_plans (id, repo_id, user_id, title, status, created_at, updated_at)
         VALUES ('plan-1', 'repo-b', 'user-1', 'Ship it', 'draft', ?, ?)`,
      )
      .run(now, now);
    sqlite
      .prepare(
        `INSERT INTO projects (id, user_id, title, root_path, node_id, created_at, last_active_at, status, metadata, kind)
         VALUES ('p-1', 'user-1', 'Zinsrechner', 'E:\\Zinsrechner', 'gateway', ?, ?, 'active', ?, 'workspace')`,
      )
      .run(now, now, JSON.stringify({ repositoryId: "repo-b", color: "blue" }));

    migrateDatabase(sqlite);

    __jait_capture(0, (sqlite.prepare("SELECT repo_id FROM automation_plans WHERE id = 'plan-1'").get()));
    const metadata = JSON.parse(
      (sqlite.prepare("SELECT metadata FROM projects WHERE id = 'p-1'").get() as { metadata: string }).metadata,
    ) as Record<string, unknown>;
    __jait_capture(1, (metadata["repositoryId"]));
    // Unrelated metadata must survive the rewrite.
    __jait_capture(2, (metadata["color"]));
  
})();

} finally {
await __jait_hook_1625();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_repository_dedupe_migration_test_ts_88_3": {


/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
function rewindToV61() {
    sqlite.exec("DROP INDEX IF EXISTS idx_automation_repos_user_path");
    sqlite.exec("DELETE FROM _migrations WHERE id = 62");
  }
function insertRepo(id: string, userId: string | null, localPath: string, createdAt: string) {
    sqlite
      .prepare(
        `INSERT INTO automation_repositories (id, user_id, device_id, name, default_branch, local_path, created_at, updated_at)
         VALUES (?, ?, 'desktop-1', 'Zinsrechner', 'main', ?, ?, ?)`,
      )
      .run(id, userId, localPath, createdAt, createdAt);
  }
const __jait_hook_1444 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    rewindToV61();
  };
const __jait_hook_1625 = () => {
    sqlite.close();
  };
await __jait_hook_1444();
try {
await (async()=>{

    insertRepo("repo-a", null, "/srv/app", "2026-07-22T07:13:26.912Z");
    insertRepo("repo-b", null, "/srv/app", "2026-07-22T07:13:26.930Z");

    migrateDatabase(sqlite);

    __jait_capture(0, (sqlite.prepare("SELECT COUNT(*) n FROM automation_repositories").get()));
  
})();

} finally {
await __jait_hook_1625();
}
}

break;
}
case "tailstatic_packages_gateway_src_db_repository_dedupe_migration_test_ts_97_3": {


/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
function rewindToV61() {
    sqlite.exec("DROP INDEX IF EXISTS idx_automation_repos_user_path");
    sqlite.exec("DELETE FROM _migrations WHERE id = 62");
  }
function insertRepo(id: string, userId: string | null, localPath: string, createdAt: string) {
    sqlite
      .prepare(
        `INSERT INTO automation_repositories (id, user_id, device_id, name, default_branch, local_path, created_at, updated_at)
         VALUES (?, ?, 'desktop-1', 'Zinsrechner', 'main', ?, ?, ?)`,
      )
      .run(id, userId, localPath, createdAt, createdAt);
  }
const __jait_hook_1444 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    rewindToV61();
  };
const __jait_hook_1625 = () => {
    sqlite.close();
  };
await __jait_hook_1444();
try {
await (async()=>{

    migrateDatabase(sqlite);
    const repos = new RepositoryService(db);

    const first = repos.create({ userId: "user-1", name: "Zinsrechner", localPath: "E:\\Zinsrechner" });
    // The second caller checked findByPath before the first insert landed.
    const second = repos.create({ userId: "user-1", name: "Zinsrechner", localPath: "E:\\Zinsrechner" });

    __jait_capture(0, (second.id), (first.id));
    __jait_capture(1, (repos.list("user-1")));
  
})();

} finally {
await __jait_hook_1625();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
