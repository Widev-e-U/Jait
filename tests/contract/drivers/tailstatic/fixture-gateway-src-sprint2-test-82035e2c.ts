// Translated fixture from packages/gateway/src/sprint2.test.ts; expected literals are in tail_static.rs.
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { uuidv7 } from "../../../../packages/gateway/src/db/uuidv7.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint2.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint2_test_ts_48_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
await __jait_hook_964();
try {
await (async()=>{

    const id = uuidv7();
    __jait_capture(0, (id));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_55_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
await __jait_hook_964();
try {
await (async()=>{

    const ids = new Set(Array.from({ length: 100 }, () => uuidv7()));
    __jait_capture(0, (ids.size));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_60_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
await __jait_hook_964();
try {
await (async()=>{

    const id1 = uuidv7();
    // Small delay to ensure different timestamp
    const start = Date.now();
    while (Date.now() === start) {
      /* spin */
    }
    const id2 = uuidv7();
    __jait_capture(0, (id1 < id2));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_73_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
await __jait_hook_964();
try {
await (async()=>{

    const { sqlite } = makeTestDb();
    const tables = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    __jait_capture(0, (names));
    __jait_capture(1, (names));
    __jait_capture(2, (names));
    __jait_capture(3, (names));
    sqlite?.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_88_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
await __jait_hook_964();
try {
await (async()=>{

    if (!DatabaseCtor || !migrateDatabaseFn) throw new Error("Bun DB test dependencies are not loaded");
    const sqlite = new DatabaseCtor(":memory:");
    migrateDatabaseFn(sqlite);
    migrateDatabaseFn(sqlite); // should not throw
    sqlite.close();
  
})();
__jait_record({slot:0,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_111_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const session = svc.create({ name: "Test Session" });
    __jait_captureType(0, (session.id));
    __jait_capture(1, (session.name));
    __jait_capture(2, (session.status));
    __jait_captureType(3, (session.createdAt));
    __jait_captureType(4, (session.lastActiveAt));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_120_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const s1 = svc.create({ name: "A" });
    const s2 = svc.create({ name: "B" });
    __jait_capture(0, (s1.id), (s2.id));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_126_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    svc.create({ name: "First" });
    // Ensure distinct timestamps — wait 5ms
    await new Promise((r) => setTimeout(r, 5));
    svc.create({ name: "Second" });
    const list = svc.list();
    __jait_capture(0, (list.length));
    // Most recent should come first
    __jait_capture(1, (list[0]!.name));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_137_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const s = svc.create({ name: "To archive" });
    svc.archive(s.id);
    __jait_capture(0, (svc.list("active").length));
    __jait_capture(1, (svc.list("archived").length));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_144_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const s = svc.create({ name: "Find me" });
    __jait_capture(0, (svc.getById(s.id)?.name));
    __jait_captureType(1, (svc.getById("nonexistent")));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_150_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const s = svc.create({ name: "Touch me" });
    const originalTime = s.lastActiveAt;
    // Wait 1ms to ensure different timestamp
    const start = Date.now();
    while (Date.now() === start) {
      /* spin */
    }
    svc.touch(s.id);
    const updated = svc.getById(s.id)!;
    __jait_capture(0, (updated.lastActiveAt), (originalTime));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_163_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const s = svc.create({ name: "Delete me" });
    svc.delete(s.id);
    const deleted = svc.getById(s.id)!;
    __jait_capture(0, (deleted.status));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_170_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let svc: SessionService;
const __jait_hook_3356 = () => {
    ({ db, sqlite } = makeTestDb());
    svc = new SessionService(db);
  };
const __jait_hook_3455 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_3356();
try {
await (async()=>{

    const s = svc.create({ name: "Old" });
    svc.update(s.id, { name: "New" });
    __jait_capture(0, (svc.getById(s.id)!.name));
  
})();

} finally {
await __jait_hook_3455();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_191_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let audit: AuditWriter;
const __jait_hook_5728 = () => {
    ({ db, sqlite } = makeTestDb());
    audit = new AuditWriter(db);
  };
const __jait_hook_5826 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_5728();
try {
await (async()=>{

    const id = audit.write({
      sessionId: "sess-1",
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "terminal.run",
      inputs: { command: "ls" },
      status: "executed",
    });
    __jait_captureType(0, (id));
    __jait_capture(1, (id));
  
})();

} finally {
await __jait_hook_5826();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_204_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let audit: AuditWriter;
const __jait_hook_5728 = () => {
    ({ db, sqlite } = makeTestDb());
    audit = new AuditWriter(db);
  };
const __jait_hook_5826 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_5728();
try {
await (async()=>{

    const actionId = uuidv7();
    audit.write({
      actionId,
      actionType: "tool_call",
      status: "executed",
    });
    __jait_capture(0, (audit.hasAction(actionId)));
    __jait_capture(1, (audit.hasAction("nonexistent")));
  
})();

} finally {
await __jait_hook_5826();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_215_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let audit: AuditWriter;
const __jait_hook_5728 = () => {
    ({ db, sqlite } = makeTestDb());
    audit = new AuditWriter(db);
  };
const __jait_hook_5826 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_5728();
try {
await (async()=>{

    const actionId = uuidv7();
    audit.write({ actionId, actionType: "tool_call", status: "executed" });
    __jait_thrown(0, () =>
      audit.write({ actionId, actionType: "tool_call", status: "executed" }));
  
})();

} finally {
await __jait_hook_5826();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_223_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let audit: AuditWriter;
const __jait_hook_5728 = () => {
    ({ db, sqlite } = makeTestDb());
    audit = new AuditWriter(db);
  };
const __jait_hook_5826 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_5728();
try {
await (async()=>{

    audit.write({
      sessionId: "sess-A",
      actionId: uuidv7(),
      actionType: "tool_call",
      status: "executed",
    });
    audit.write({
      sessionId: "sess-B",
      actionId: uuidv7(),
      actionType: "tool_call",
      status: "executed",
    });
    audit.write({
      sessionId: "sess-A",
      actionId: uuidv7(),
      actionType: "message",
      status: "executed",
    });

    const entriesA = audit.getBySession("sess-A");
    __jait_capture(0, (entriesA.length));
    for (const e of entriesA) {
      __jait_capture(1, (e.sessionId));
    }

    const entriesB = audit.getBySession("sess-B");
    __jait_capture(2, (entriesB.length));
  
})();

} finally {
await __jait_hook_5826();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_253_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let db: ReturnType<typeof makeTestDb>["db"];
let sqlite: { close: () => void } | undefined;
let audit: AuditWriter;
const __jait_hook_5728 = () => {
    ({ db, sqlite } = makeTestDb());
    audit = new AuditWriter(db);
  };
const __jait_hook_5826 = () => {
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_5728();
try {
await (async()=>{

    const actionId = uuidv7();
    audit.write({
      actionId,
      actionType: "tool_call",
      toolName: "file.write",
      inputs: { path: "/tmp/test.txt", content: "hello" },
      outputs: { bytesWritten: 5 },
      status: "executed",
    });

    const entries = audit.getAll();
    __jait_capture(0, (entries.length));
    const entry = entries[0]!;
    __jait_capture(1, (JSON.parse(entry.inputs!)));
    __jait_capture(2, (JSON.parse(entry.outputs!)));
  
})();

} finally {
await __jait_hook_5826();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_302_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const res = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "My Project" },
    });
    __jait_capture(0, (res.statusCode));
    const body = JSON.parse(res.body);
    __jait_captureType(1, (body.id));
    __jait_capture(2, (body.name));
    __jait_capture(3, (body.status));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_316_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 1" },
    });
    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 2" },
    });

    const res = await app.inject({
      headers,
      method: "GET",
      url: "/api/sessions",
    });
    __jait_capture(0, (res.statusCode));
    const body = JSON.parse(res.body);
    __jait_capture(1, (body.sessions.length));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_340_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const createRes = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Active" },
    });
    const session = JSON.parse(createRes.body);

    // Archive it
    await app.inject({
      headers,
      method: "POST",
      url: `/api/sessions/${session.id}/archive`,
    });

    const res = await app.inject({
      headers,
      method: "GET",
      url: "/api/sessions?status=active",
    });
    const body = JSON.parse(res.body);
    __jait_capture(0, (body.sessions.length));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_365_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 1" },
    });
    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 2" },
    });
    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Session 3" },
    });

    const res = await app.inject({
      headers,
      method: "GET",
      url: "/api/sessions?limit=2",
    });
    __jait_capture(0, (res.statusCode));
    const body = JSON.parse(res.body);
    __jait_capture(1, (body.sessions));
    __jait_capture(2, (body.hasMore));
    __jait_capture(3, (body.sessions[0].name));
    __jait_capture(4, (body.sessions[1].name));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_398_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const createRes = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Find me" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      headers,
      method: "GET",
      url: `/api/sessions/${session.id}`,
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (JSON.parse(res.body).name));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_416_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const res = await app.inject({
      headers,
      method: "GET",
      url: "/api/sessions/nonexistent-id",
    });
    __jait_capture(0, (res.statusCode));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_425_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const createRes = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Old name" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      headers,
      method: "PATCH",
      url: `/api/sessions/${session.id}`,
      payload: { name: "New name" },
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (JSON.parse(res.body).name));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_444_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const createRes = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Delete me" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      headers,
      method: "DELETE",
      url: `/api/sessions/${session.id}`,
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (JSON.parse(res.body).ok));

    // Session should be deleted status
    const getRes = await app.inject({
      headers,
      method: "GET",
      url: `/api/sessions/${session.id}`,
    });
    __jait_capture(2, (JSON.parse(getRes.body).status));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_470_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Audited" },
    });

    const entries = audit.getAll();
    __jait_capture(0, (entries.length));
    __jait_capture(1, (entries.some((e) => e.actionType === "session.create")));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_483_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const createRes = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "To delete" },
    });
    const session = JSON.parse(createRes.body);

    await app.inject({
      headers,
      method: "DELETE",
      url: `/api/sessions/${session.id}`,
    });

    const entries = audit.getAll();
    __jait_capture(0, (entries.some((e) => e.actionType === "session.delete")));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_503_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Active" },
    });

    const res = await app.inject({
      headers,
      method: "GET",
      url: "/api/tools/sessions.list",
    });
    __jait_capture(0, (res.statusCode));
    const body = JSON.parse(res.body);
    __jait_capture(1, (body.sessions.length));
    __jait_capture(2, (body.sessions[0].name));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_522_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const createRes = await app.inject({
      headers,
      method: "POST",
      url: "/api/sessions",
      payload: { name: "Check status" },
    });
    const session = JSON.parse(createRes.body);

    const res = await app.inject({
      headers,
      method: "GET",
      url: `/api/tools/sessions.status?sessionId=${session.id}`,
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (JSON.parse(res.body).name));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_540_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let svc: SessionService;
let headers: { authorization: string };
let audit: AuditWriter;
let sqlite: { close: () => void } | undefined;
const __jait_hook_8407 = async () => {
    const testDb = makeTestDb();
    sqlite = testDb.sqlite;
    const userService = new UserService(testDb.db);
    const user = userService.createUser("session-route-owner", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret) };
    svc = new SessionService(testDb.db);
    audit = new AuditWriter(testDb.db);
    app = await createServer(testConfig, {
      db: testDb.db, sqlite: testDb.sqlite, userService,
      sessionService: svc,
      audit,
    });
  };
const __jait_hook_8994 = async () => {
    await app.close();
    sqlite?.close();
  };
await __jait_hook_964();
await __jait_hook_8407();
try {
await (async()=>{

    const res = await app.inject({
      headers,
      method: "GET",
      url: "/api/tools/sessions.status",
    });
    __jait_capture(0, (res.statusCode));
  
})();

} finally {
await __jait_hook_8994();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint2_test_ts_551_3": {


const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
let DatabaseCtor: { new (path: string): { close: () => void; run: (sql: string) => void; query: (sql: string) => { all: () => unknown[] } } } | undefined;
let drizzleFn: ((sqlite: unknown, opts: { schema: unknown }) => unknown) | undefined;
let dbSchema: unknown;
let migrateDatabaseFn: ((sqlite: unknown) => void) | undefined;
function makeTestDb() {
  if (!DatabaseCtor || !drizzleFn || !migrateDatabaseFn || !dbSchema) {
    throw new Error("Bun DB test dependencies are not loaded");
  }
  const sqlite = new DatabaseCtor(":memory:");
  migrateDatabaseFn(sqlite);
  const db = drizzleFn(sqlite, { schema: dbSchema });
  return { db, sqlite };
}
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
const __jait_hook_964 = async () => {
  if (!isBunRuntime) return;
  ({ Database: DatabaseCtor } = await import("bun:sqlite"));
  ({ drizzle: drizzleFn } = await import(Bun.resolveSync("drizzle-orm/bun-sqlite", __jait_original_dir)));
  dbSchema = await import("../../../../packages/gateway/src/db/schema.js");
  ({ migrateDatabase: migrateDatabaseFn } = await import("../../../../packages/gateway/src/db/connection.js"));
};
/*__jait_scope_open__*/{
await __jait_hook_964();
try {
await (async()=>{

    const { db, sqlite } = makeTestDb();
    const sessionSvc = new SessionService(db);
    const audit = new AuditWriter(db);

    const sessA = sessionSvc.create({ name: "Project A" });
    const sessB = sessionSvc.create({ name: "Project B" });

    // Log tool calls to session A
    audit.write({
      sessionId: sessA.id,
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "terminal.run",
      inputs: { command: "npm install" },
      status: "executed",
    });
    audit.write({
      sessionId: sessA.id,
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "file.write",
      inputs: { path: "index.ts" },
      status: "executed",
    });

    // Log tool call to session B
    audit.write({
      sessionId: sessB.id,
      actionId: uuidv7(),
      actionType: "tool_call",
      toolName: "browser.navigate",
      inputs: { url: "https://example.com" },
      status: "executed",
    });

    // Verify isolation
    const entriesA = audit.getBySession(sessA.id);
    const entriesB = audit.getBySession(sessB.id);

    __jait_capture(0, (entriesA.length));
    __jait_capture(1, (entriesB.length));

    // No cross-contamination
    __jait_capture(2, (entriesA.every((e) => e.sessionId === sessA.id)));
    __jait_capture(3, (entriesB.every((e) => e.sessionId === sessB.id)));
    __jait_capture(4, (entriesB[0]!.toolName));

    sqlite?.close();
  
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
