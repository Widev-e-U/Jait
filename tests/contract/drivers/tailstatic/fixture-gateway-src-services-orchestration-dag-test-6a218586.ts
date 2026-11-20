// Translated fixture from packages/gateway/src/services/orchestration/dag.test.ts; expected literals are in tail_static.rs.
import { type PlanGraphIssueCode, validatePlanGraph } from "../../../../packages/gateway/src/services/orchestration/dag.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/dag.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_16_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = validatePlanGraph([
      task("A"),
      task("B", { dependsOn: ["A"] }),
      task("C", { dependsOn: ["A"] }),
      task("D", { dependsOn: ["B", "C"] }),
    ]);
    __jait_capture(0, (result.ok));
    if (!result.ok) return;
    __jait_capture(1, (result.order));
    __jait_capture(2, (result.tasks[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_34_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = validatePlanGraph([
      task("A", { resources: {} }),
      task("B", { resources: { reads: ["./docs/"], writes: ["src", "name:build"] } }),
    ]);
    __jait_capture(0, (result.ok));
    if (!result.ok) return;
    __jait_capture(1, (result.tasks[0]?.claims));
    __jait_capture(2, (result.tasks[1]?.claims));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_45_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([])));
    __jait_capture(1, (codesOf(Array.from({ length: 101 }, (_, index) => task(`T${index}`)))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_50_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([task("A"), task("A")])));
    __jait_capture(1, (codesOf([task("bad id")])));
    __jait_capture(2, (codesOf([task("A", { dependsOn: ["A"] })])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_56_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([task("A", { dependsOn: ["Z"] })])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_60_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = validatePlanGraph([task("A", { dependsOn: ["B"] }), task("B", { dependsOn: ["A"] })]);
    __jait_capture(0, (result.ok));
    if (result.ok) return;
    __jait_capture(1, (result.issues));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_67_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([task("A", { resources: { writes: ["/etc/passwd"] } })])));
    __jait_capture(1, (codesOf([task("A", { resources: { reads: ["../x"] } })])));
    __jait_capture(2, (codesOf([task("A", { resources: { writes: ["C:\\x"] } })])));
    __jait_capture(3, (codesOf([task("A", { resources: { reads: ["src"], writes: ["src"] } })])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_74_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = validatePlanGraph([
      task("A", { resources: { writes: ["src"], protects: ["./src/tests/", "**/*.test.ts", "src/tests"] } }),
      task("B", { resources: { writes: ["docs"] } }),
      task("C", { resources: { writes: ["docs"], protects: [] } }),
    ]);
    __jait_capture(0, (result.ok));
    if (!result.ok) return;
    __jait_capture(1, (result.tasks[0]?.claims));
    __jait_capture(2, (result.tasks[1]?.claims));
    __jait_capture(3, (result.tasks[2]?.claims));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_87_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const withProtects = (resources: Record<string, unknown>) => codesOf([task("A", { resources })]);
    __jait_capture(0, (withProtects({ writes: ["src"], protects: ["../x"] })));
    __jait_capture(1, (withProtects({ writes: ["src"], protects: ["/etc"] })));
    __jait_capture(2, (withProtects({ writes: ["src"], protects: ["name:db"] })));
    __jait_capture(3, (withProtects({ writes: ["src"], protects: ["tests", 7] })));
    __jait_capture(4, (withProtects({ writes: ["src"], protects: "tests" })));
    __jait_capture(5, (withProtects({ reads: ["src"], protects: ["src/tests"] })));
    __jait_capture(6, (withProtects({ writes: ["name:db"], protects: ["src/tests"] })));
    __jait_capture(7, (withProtects({ writes: ["src/tests"], protects: ["src"] })));
    __jait_capture(8, (withProtects({ writes: ["src"], protects: ["."] })));
    __jait_capture(9, (withProtects({ writes: ["src"], protects: Array.from({ length: 51 }, (_, index) => `t${index}`) })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_103_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([task("A", { resources: { writes: ["src"], protects: ["src/tests"] } })])));
    __jait_capture(1, (codesOf([task("A", { resources: { writes: ["src"], protects: ["**/*.test.ts"] } })])));
    __jait_capture(2, (codesOf([task("A", { resources: { writes: ["."], protects: ["tests", "**/*.snap"] } })])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_109_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([task("A", { verification: [] })])));
    const unknownKind = { id: "g", label: "x", check: { kind: "shell" } };
    __jait_capture(1, (codesOf([task("A", { verification: [unknownKind] })])));
    const command = { id: "g", label: "tests", check: { kind: "command", command: "bun test" } };
    __jait_capture(2, (validatePlanGraph([task("A", { verification: [command] })]).ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_117_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (codesOf([task("A", { maxAttempts: 9 })])));
    __jait_capture(1, (codesOf([task("A", { timeoutSeconds: 0 })])));
    __jait_capture(2, (codesOf([task("A", { priority: 11 })])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_123_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const plain = validatePlanGraph([task("A", { resources: { writes: ["src"] } })]);
    __jait_capture(0, (plain.ok && plain.tasks[0]?.worker));
    const acp = validatePlanGraph([
      task("A", { resources: { writes: ["src"] }, worker: { kind: "acp", providerId: "claude-code" } }),
    ]);
    __jait_capture(1, (acp.ok && acp.tasks[0]?.worker));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_132_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const worker = { kind: "acp", providerId: "codex" };
    __jait_capture(0, (codesOf([task("A", { resources: { reads: ["."] }, worker })])));
    __jait_capture(1, (codesOf([task("A", { resources: {}, worker })])));
    // Absent resources claim the whole project for writing, which is a write claim.
    __jait_capture(2, (codesOf([task("A", { worker })])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_dag_test_ts_140_3": {


const gate = { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, verification: [gate], ...extra };
}
function codesOf(tasks: unknown): PlanGraphIssueCode[] {
  const result = validatePlanGraph(tasks);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const writes = { writes: ["src"] };
    __jait_capture(0, (codesOf([task("A", { resources: writes, worker: { kind: "shell" } })])));
    __jait_capture(1, (codesOf([task("A", { resources: writes, worker: { kind: "acp", providerId: "../escape" } })])));
    __jait_capture(2, (codesOf([task("A", { resources: writes, worker: "acp" })])));
  
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
