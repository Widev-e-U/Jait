// Translated fixture from packages/gateway/src/sprint6.test.ts; expected literals are in tail_static.rs.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SqliteMemoryBackend } from "../../../../packages/gateway/src/memory/sqlite-backend.js";
import { MemoryEngine } from "../../../../packages/gateway/src/memory/service.js";
import { createMemorySaveTool, createMemorySearchTool, createMemoryForgetTool } from "../../../../packages/gateway/src/tools/memory-tools.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint6.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint6_test_ts_14_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });

    await memory.save({
      scope: "project",
      content: "Use pnpm install for this monorepo.",
      source: { type: "chat", id: "msg-1", surface: "web" },
    });

    await memory.save({
      scope: "contact",
      content: "Payment API retries failed webhooks 3 times.",
      source: { type: "doc", id: "doc-1", surface: "filesystem" },
    });

    const projectOnly = await memory.search("install dependencies", 5, "project");
    const contactOnly = await memory.search("webhook retries", 5, "contact");

    __jait_capture(0, (projectOnly));
    __jait_capture(1, (projectOnly[0]?.content));
    __jait_capture(2, (contactOnly));
    __jait_capture(3, (contactOnly[0]?.source.type));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint6_test_ts_43_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const expired = await memory.save({
      scope: "project",
      content: "Old note to expire",
      source: { type: "chat", id: "msg-old", surface: "web" },
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const alive = await memory.save({
      scope: "project",
      content: "Important permanent note",
      source: { type: "chat", id: "msg-new", surface: "web" },
    });

    const deleted = await memory.forgetExpired();
    __jait_capture(0, (deleted));

    const results = await memory.search("note", 10, "project");
    __jait_capture(1, (results.map((r) => r.id)), (expired.id));

    const forgotten = await memory.forget(alive.id);
    __jait_capture(2, (forgotten));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint6_test_ts_72_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-memory-"));
    const memoryDir = join(root, "memory");
    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db), memoryDir });

    await memory.save({
      scope: "contact",
      content: "Alice prefers PR updates in Slack.",
      source: { type: "contact", id: "alice", surface: "slack" },
    });

    const day = new Date().toISOString().slice(0, 10);
    const daily = readFileSync(join(memoryDir, `${day}.md`), "utf-8");
    const curated = readFileSync(join(root, "MEMORY.md"), "utf-8");

    __jait_capture(0, (daily));
    __jait_capture(1, (curated));

    rmSync(root, { recursive: true, force: true });
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint6_test_ts_98_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const saved = await memory.flushPreCompaction("session-42", [
      "[user] Remember that the release checklist lives in docs/release.md.",
      "[assistant] ok",
      "[user] Can you run tests?",
    ]);

    __jait_capture(0, (saved));

    const results = await memory.search("release checklist", 5, "project");
    __jait_capture(1, (results));
    __jait_capture(2, (results[0]?.content));
    __jait_capture(3, (results[0]?.source.type));
    __jait_capture(4, (results[0]?.source.id));

    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint6_test_ts_120_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const memory = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });
    const saveTool = createMemorySaveTool(memory);
    const searchTool = createMemorySearchTool(memory);
    const forgetTool = createMemoryForgetTool(memory);

    const context = {
      sessionId: "s1",
      actionId: "a1",
      projectRoot: "/tmp",
      requestedBy: "test",
    };

    const saveResult = await saveTool.execute({
      scope: "project",
      content: "Release branch is cut every Thursday.",
      sourceType: "chat",
      sourceId: "m1",
      sourceSurface: "web",
    }, context);

    __jait_capture(0, (saveResult.ok));
    const id = (saveResult.data as { id: string }).id;

    const searchResult = await searchTool.execute({ query: "release branch" }, context);
    __jait_capture(1, (searchResult.ok));
    __jait_capture(2, ((searchResult.data as { memories: unknown[] }).memories.length));

    const forgetResult = await forgetTool.execute({ id }, context);
    __jait_capture(3, (forgetResult.ok));

    sqlite.close();
  
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
