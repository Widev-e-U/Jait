// Translated fixture from packages/gateway/src/services/node-permissions.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { JaitDB, SqliteDatabase } from "../../../../packages/gateway/src/db/index.js";
import { consentLog, nodePermissions, nodes } from "../../../../packages/gateway/src/db/schema.js";

import {
  NodePermissionsService,
  NODE_CAPABILITIES,
  isNodeCapability,
} from "../../../../packages/gateway/src/services/node-permissions.js";
import type { NodeHelloPayload } from "@jait/shared";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/node-permissions.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_43_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service();
    for (const cap of NODE_CAPABILITIES) {
      __jait_capture(0, (svc.isGranted("ghost-node", cap)));
    }
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_50_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service();
    svc.ensureNodeSeen(hello);

    // nodes row exists
    const nodeRows = db.select().from(nodes).where(eq(nodes.nodeId, hello.id)).all();
    __jait_capture(0, (nodeRows));

    // one deny-all row per capability
    const permRows = db
      .select()
      .from(nodePermissions)
      .where(eq(nodePermissions.nodeId, hello.id))
      .all();
    __jait_capture(1, (permRows), (NODE_CAPABILITIES.length));
    for (const cap of NODE_CAPABILITIES) {
      __jait_capture(2, (svc.isGranted(hello.id, cap)));
    }

    // second call must not throw and stays deny-all
    __jait_thrown(3, () => svc.ensureNodeSeen(hello));
    const permRowsAfter = db
      .select()
      .from(nodePermissions)
      .where(eq(nodePermissions.nodeId, hello.id))
      .all();
    __jait_capture(4, (permRowsAfter), (NODE_CAPABILITIES.length));
    for (const cap of NODE_CAPABILITIES) {
      __jait_capture(5, (svc.isGranted(hello.id, cap)));
    }
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_82_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service();
    svc.ensureNodeSeen(hello);

    __jait_capture(0, (svc.isGranted(hello.id, "terminal")));

    svc.updatePermissions(hello.id, { terminal: true });
    __jait_capture(1, (svc.isGranted(hello.id, "terminal")));

    svc.updatePermissions(hello.id, { terminal: false });
    __jait_capture(2, (svc.isGranted(hello.id, "terminal")));
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_95_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service();
    svc.ensureNodeSeen(hello);
    svc.updatePermissions(hello.id, { terminal: true, browser: true });

    const perms = svc.getPermissions(hello.id);
    __jait_capture(0, (Object.keys(perms).sort()), ([...NODE_CAPABILITIES].sort()));
    __jait_capture(1, (perms.terminal));
    __jait_capture(2, (perms.browser));
    __jait_capture(3, (perms.filesystem));

    const listed = svc.listNodePermissions();
    __jait_capture(4, (listed));
    __jait_capture(5, (listed[0]!.nodeId), (hello.id));
    __jait_capture(6, (listed[0]!.permissions.terminal));
    __jait_capture(7, (listed[0]!.permissions.browser));
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_113_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service();
    svc.ensureNodeSeen(hello);
    svc.updatePermissions(hello.id, { terminal: true });

    __jait_capture(0, (svc.forgetNode(hello.id)));
    __jait_capture(1, (svc.forgetNode(hello.id)));
    __jait_capture(2, (db.select().from(nodes).where(eq(nodes.nodeId, hello.id)).all()));
    __jait_capture(3, (db.select().from(nodePermissions).where(eq(nodePermissions.nodeId, hello.id)).all()));
    __jait_capture(4, (svc.isGranted(hello.id, "terminal")));
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_125_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service();
    svc.logDenied(hello.id, "terminal", "terminal denied by policy");

    const rows = db.select().from(consentLog).all();
    __jait_capture(0, (rows));
    __jait_capture(1, (rows[0]!.decision));
    __jait_capture(2, (rows[0]!.actionId), (`node-permission:${hello.id}:terminal`));
    __jait_capture(3, (rows[0]!.toolName));
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_136_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    const svc = service(null);
    __jait_capture(0, (svc.isGranted("n", "terminal")));
    __jait_capture(1, (svc.listNodePermissions()));
    __jait_thrown(2, () => svc.ensureNodeSeen(hello));
    __jait_thrown(3, () => svc.updatePermissions("n", { terminal: true }));
    __jait_thrown(4, () => svc.logDenied("n", "terminal", "detail"));
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_node_permissions_test_ts_145_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
let sqlite: SqliteDatabase;
let db: JaitDB;
async function freshDb(): Promise<void> {
  const result = await openDatabase(":memory:");
  sqlite = result.sqlite;
  db = result.db;
  migrateDatabase(sqlite);
}
const hello: NodeHelloPayload = {
  id: "node-1",
  name: "test-node",
  platform: "linux",
  role: "remote",
};
function service(d: JaitDB | null = db): NodePermissionsService {
  return new NodePermissionsService(d);
}
const __jait_hook_673 = async () => {
  await freshDb();
};
const __jait_hook_722 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_673();
try {
await (async()=>{

    __jait_capture(0, (isNodeCapability("terminal")));
    __jait_capture(1, (isNodeCapability("filesystem")));
    __jait_capture(2, (isNodeCapability("not-a-capability")));
    __jait_capture(3, (isNodeCapability(42)));
  
})();

} finally {
await __jait_hook_722();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
