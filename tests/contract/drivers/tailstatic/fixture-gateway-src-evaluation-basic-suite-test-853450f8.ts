// Translated fixture from packages/gateway/src/evaluation/basic-suite.test.ts; expected literals are in tail_static.rs.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { suiteSchema, verifyTask } from "../../../../packages/gateway/src/evaluation/agent-eval.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/evaluation/basic-suite.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_evaluation_basic_suite_test_ts_59_1": {


const roots: string[] = [];
const solutions: Record<string, Record<string, string>> = {
  "read-and-report": { "result.json": '{"service":"fixture-web","port":8087}' },
  "discover-file-tool": { "result.json": '{"bytes":17}' },
  "recover-missing-file": { "result.txt": "recovered from fixture\n" },
  "patch-and-verify": { "math.mjs": "export function sumPositive(values) { return values.filter(v=>v>0).reduce((a,b)=>a+b,0); }" },
  "search-live-config": { "result.json": '{"service":"fixture-api","port":8093}' },
  "preserve-exact-bytes": { "result.txt": "Grüße 🌍\r\n\tvalue = 7  \r\n\r\n" },
  "merge-config": { "merge.mjs": `export function mergeConfig(base, override) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!object(base) || !object(override)) return structuredClone(override);
    const result = structuredClone(base);
    for (const [k,v] of Object.entries(override)) result[k] = k in base ? mergeConfig(base[k],v) : structuredClone(v);
    return result;
  }` },
  "repair-pagination": {
    "pagination.mjs": `export function paginate(rows,{offset=0,limit=2}={}) {
      if (!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<0) throw new RangeError('bounds');
      return rows.slice(offset,offset+limit);
    }`,
    "service.mjs": `import {paginate} from './pagination.mjs'; export function listServices(records,options={}) {
      const rows=records.filter(r=>options.status===undefined||r.status===options.status).sort((a,b)=>a.id-b.id);
      return {items:paginate(rows,options),total:rows.length};
    }`,
  },
  "bounded-async-map": { "queue.mjs": `export async function mapConcurrent(items, concurrency, worker) {
    if (!Number.isInteger(concurrency)||concurrency<1) throw new RangeError('concurrency');
    let next=0, failed=false; const results=new Array(items.length);
    await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
      while(!failed && next<items.length) { const index=next++;
        try {results[index]=await worker(items[index],index);} catch(error) {failed=true;throw error;}
      }
    })); return results;
  }` },
  "inventory-pipeline": {
    "normalize.mjs": `export function normalize(v) { return v && typeof v.host==='string' && Number.isInteger(v.port) && v.port>=1 && v.port<=65535 ? {host:v.host,port:v.port} : null; }`,
    "report.mjs": `import {normalize} from './normalize.mjs'; export function report(lines,scope) {
      const counts={invalid:0,excluded:0,duplicates:0}, endpoints=[], seen=new Set();
      for(const line of lines) {if(!line.trim())continue;let item;
        try {item=normalize(JSON.parse(line));} catch {counts.invalid++;continue;}
        if(!item){counts.invalid++;continue;}
        if(!scope.targets.includes(item.host)||scope.exclusions.includes(item.host)){counts.excluded++;continue;}
        const key=JSON.stringify([item.host,item.port]);if(seen.has(key)){counts.duplicates++;continue;}
        seen.add(key);endpoints.push(item);
      }
      endpoints.sort((a,b)=>a.host<b.host?-1:a.host>b.host?1:a.port-b.port);
      return {endpoints,counts};
    }`,
    "result.json": '{"endpoints":[{"host":"fixture-a","port":80},{"host":"fixture-a","port":8080},{"host":"fixture-b","port":443}],"counts":{"invalid":4,"excluded":2,"duplicates":1}}',
  },
};
const __jait_hook_276 = async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); };

try {
await (async()=>{

  const suite = suiteSchema.parse(JSON.parse(await readFile(new URL("../../../../evaluations/basic.json", __jait_original_url), "utf8")));
  const task = suite.tasks.find(task => task.id === "bounded-async-map")!;
  const root = await mkdtemp(path.join(__jait_fixture_dir, "jait-suite-")); roots.push(root);
  const implementation = solutions[task.id]!["queue.mjs"]!.replace("export async function mapConcurrent", "async function run");
  await writeFile(path.join(root, "queue.mjs"), implementation + `
    export function mapConcurrent(items, concurrency, worker) {
      if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency');
      return run(items, concurrency, worker);
    }`);
  __jait_capture(0, ((await verifyTask(task, root)).every(check => check.passed)));

})();

} finally {
await __jait_hook_276();
}


break;
}
case "tailstatic_packages_gateway_src_evaluation_basic_suite_test_ts_71_1": {


const roots: string[] = [];
const solutions: Record<string, Record<string, string>> = {
  "read-and-report": { "result.json": '{"service":"fixture-web","port":8087}' },
  "discover-file-tool": { "result.json": '{"bytes":17}' },
  "recover-missing-file": { "result.txt": "recovered from fixture\n" },
  "patch-and-verify": { "math.mjs": "export function sumPositive(values) { return values.filter(v=>v>0).reduce((a,b)=>a+b,0); }" },
  "search-live-config": { "result.json": '{"service":"fixture-api","port":8093}' },
  "preserve-exact-bytes": { "result.txt": "Grüße 🌍\r\n\tvalue = 7  \r\n\r\n" },
  "merge-config": { "merge.mjs": `export function mergeConfig(base, override) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!object(base) || !object(override)) return structuredClone(override);
    const result = structuredClone(base);
    for (const [k,v] of Object.entries(override)) result[k] = k in base ? mergeConfig(base[k],v) : structuredClone(v);
    return result;
  }` },
  "repair-pagination": {
    "pagination.mjs": `export function paginate(rows,{offset=0,limit=2}={}) {
      if (!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<0) throw new RangeError('bounds');
      return rows.slice(offset,offset+limit);
    }`,
    "service.mjs": `import {paginate} from './pagination.mjs'; export function listServices(records,options={}) {
      const rows=records.filter(r=>options.status===undefined||r.status===options.status).sort((a,b)=>a.id-b.id);
      return {items:paginate(rows,options),total:rows.length};
    }`,
  },
  "bounded-async-map": { "queue.mjs": `export async function mapConcurrent(items, concurrency, worker) {
    if (!Number.isInteger(concurrency)||concurrency<1) throw new RangeError('concurrency');
    let next=0, failed=false; const results=new Array(items.length);
    await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{
      while(!failed && next<items.length) { const index=next++;
        try {results[index]=await worker(items[index],index);} catch(error) {failed=true;throw error;}
      }
    })); return results;
  }` },
  "inventory-pipeline": {
    "normalize.mjs": `export function normalize(v) { return v && typeof v.host==='string' && Number.isInteger(v.port) && v.port>=1 && v.port<=65535 ? {host:v.host,port:v.port} : null; }`,
    "report.mjs": `import {normalize} from './normalize.mjs'; export function report(lines,scope) {
      const counts={invalid:0,excluded:0,duplicates:0}, endpoints=[], seen=new Set();
      for(const line of lines) {if(!line.trim())continue;let item;
        try {item=normalize(JSON.parse(line));} catch {counts.invalid++;continue;}
        if(!item){counts.invalid++;continue;}
        if(!scope.targets.includes(item.host)||scope.exclusions.includes(item.host)){counts.excluded++;continue;}
        const key=JSON.stringify([item.host,item.port]);if(seen.has(key)){counts.duplicates++;continue;}
        seen.add(key);endpoints.push(item);
      }
      endpoints.sort((a,b)=>a.host<b.host?-1:a.host>b.host?1:a.port-b.port);
      return {endpoints,counts};
    }`,
    "result.json": '{"endpoints":[{"host":"fixture-a","port":80},{"host":"fixture-a","port":8080},{"host":"fixture-b","port":443}],"counts":{"invalid":4,"excluded":2,"duplicates":1}}',
  },
};
const __jait_hook_276 = async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); };

try {
await (async()=>{

  const suite = suiteSchema.parse(JSON.parse(await readFile(new URL("../../../../evaluations/basic.json", __jait_original_url), "utf8")));
  __jait_capture(0, (suite.tasks));
  __jait_capture(1, (suite.tasks.map(t=>t.id)), (Object.keys(solutions)));
  for (const task of suite.tasks) {
    const root = await mkdtemp(path.join(__jait_fixture_dir, "jait-suite-")); roots.push(root);
    for (const [name,content] of Object.entries(task.fixtures)) {
      const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,content);
    }
    __jait_capture(2, ((await verifyTask(task,root)).some(c=>!c.passed)));
    for (const [name,content] of Object.entries(solutions[task.id]!)) await writeFile(path.join(root,name),content);
    const checks=await verifyTask(task,root);
    __jait_capture(3, (checks.every(c=>c.passed)));
  }

})();

} finally {
await __jait_hook_276();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
