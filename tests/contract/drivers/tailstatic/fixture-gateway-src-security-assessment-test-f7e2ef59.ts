// Translated fixture from packages/gateway/src/security/assessment.test.ts; expected literals are in tail_static.rs.
import { createServer } from "node:net";
import { AssessmentService, validateScope } from "../../../../packages/gateway/src/security/assessment.js";
import type { SecurityScopeInput, SecurityProbeState } from "@jait/shared";
import { openRawSqlite } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { migrations } from "../../../../packages/gateway/src/db/migrations.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/assessment.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each0": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "--script=attack";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each1": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "127.0.0.1;id";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each2": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "router.local";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "http://127.0.0.1";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each4": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "::1";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each5": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "192.0.2.0/24";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each6": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "224.0.0.1";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each7": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "0.0.0.0";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each8": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "127.1";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_14_3_each9": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const target = "0177.0.0.1";

try {
await (async()=>{

    __jait_thrown(0, () => validateScope(input({ targets: [target] })));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_17_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const bad of [
      { authorized: false }, { targets: [] }, { ports: [] }, { ports: [0] }, { ports: [65536] }, { ports: [1.5] },
      { ports: Array(17).fill(22) }, { targets: Array(17).fill("127.0.0.1") },
      { expiresAt: new Date(Date.now() - 1).toISOString() }, { expiresAt: new Date(Date.now() + 3_700_000).toISOString() },
      { exclusions: ["not-an-ip"] }, { exclusions: ["192.0.2.10", "192.0.2.11"] },
    ]) __jait_thrown(0, () => validateScope(input(bad)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_25_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const probe = vi.fn(async (): Promise<SecurityProbeState> => "open");
    const service = new AssessmentService(undefined, probe, 0);
    const scope = service.createScope(input({ exclusions: ["192.0.2.11"], targets: ["192.0.2.10", "192.0.2.11", "192.0.2.10"] }), "owner");
    scope.targets.push("203.0.113.5"); // caller mutations cannot expand stored scope
    const run = service.start(scope.id, "owner");
    const result = await service.wait(run.id, "owner");
    __jait_capture(0, (probe.mock.calls.map(c => c.slice(0, 2))));
    __jait_capture(1, (result.plannedChecks));
    __jait_capture(2, (result.status));
    __jait_capture(3, (result.observations.every(o => o.evidenceId && o.observedAt)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_37_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = new AssessmentService(undefined, async () => "open", 0);
    const scope = service.createScope(input(), "owner");
    __jait_thrown(0, () => service.start(scope.id, "other"));
    __jait_thrown(1, () => service.start(scope.id, "owner", "remote-node"));
    const run = service.start(scope.id, "owner");
    __jait_thrown(2, () => service.start(scope.id, "owner"));
    __jait_thrown(3, () => service.cancel(run.id, "other"));
    __jait_capture(4, (service.history("other").runs));
    await service.wait(run.id, "owner");
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_48_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = new AssessmentService(undefined, async () => "open", 0);
    const scope = service.createScope(input({ expiresAt: new Date(Date.now() + 40).toISOString() }), "owner");
    await new Promise(resolve => setTimeout(resolve, 60));
    __jait_thrown(0, () => service.start(scope.id, "owner"));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_54_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const probe = vi.fn(async (): Promise<SecurityProbeState> => "open");
    const service = new AssessmentService(undefined, probe, 100);
    const scope = service.createScope(input({ expiresAt: new Date(Date.now() + 45).toISOString() }), "owner");
    const result = await service.wait(service.start(scope.id, "owner").id, "owner");
    __jait_capture(0, (result.status));
    __jait_capture(1, (probe.mock.calls));
    __jait_capture(2, (result.coverageGaps.some(g => g.includes("not performed"))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_63_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const probe = vi.fn((_target: string, _port: number, signal: AbortSignal): Promise<SecurityProbeState> =>
      new Promise(resolve => signal.addEventListener("abort", () => resolve("error"), { once: true })));
    const service = new AssessmentService(undefined, probe, 0);
    const scope = service.createScope(input(), "owner");
    const run = service.start(scope.id, "owner");
    service.cancel(run.id, "owner");
    const result = await service.wait(run.id, "owner");
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.observations));
    __jait_capture(2, (probe.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_75_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now());
    try {
      const service=new AssessmentService(undefined,(_target,_port,signal)=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve("error"),{once:true})),0,10);
      const s=service.createScope(input(),"owner");
      __jait_capture(0, ((await service.wait(service.start(s.id,"owner").id,"owner")).status));
    } finally {clock.mockRestore();}
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_83_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service=new AssessmentService(undefined,(_target,_port,signal)=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve("error"),{once:true})),0);
    const s=service.createScope(input(),"owner"),run=service.start(s.id,"owner");
    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now()+3600_000);
    try { service.cancel(run.id,"owner");__jait_capture(0, ((await service.wait(run.id,"owner")).status)); }
    finally {clock.mockRestore();}
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_90_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = new AssessmentService(undefined, (_target, _port, signal) => new Promise(resolve =>
      signal.addEventListener("abort", () => resolve("error"), { once: true })), 0, 30);
    const scope = service.createScope(input(), "owner");
    const result = await service.wait(service.start(scope.id, "owner").id, "owner");
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.observations));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_98_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    let count = 0;
    const service = new AssessmentService(undefined, async () => {
      count++;
      if (count === 1) return "timeout";
      if (count === 2) return "error";
      throw new Error("untrusted scanner output");
    }, 0);
    const scope = service.createScope(input(), "owner");
    const result = await service.wait(service.start(scope.id, "owner").id, "owner");
    __jait_capture(0, (result.observations.map(o => o.state)));
    __jait_capture(1, (result.status));
    __jait_capture(2, (JSON.stringify(result)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_112_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const db = await openRawSqlite(":memory:");
    migrations.find(m => m.id === 67)!.run(db);
    try {
      const service = new AssessmentService(db, async () => "refused", 0);
      const scope = service.createScope(input(), "owner");
      const result = await service.wait(service.start(scope.id, "owner").id, "owner");
      const reopened = new AssessmentService(db);
      __jait_capture(0, (reopened.getRun(result.id, "owner")), (result));
      __jait_capture(1, (reopened.history("owner").scopes[0]), (scope));
      __jait_capture(2, (reopened.history("other")));
    } finally { db.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_125_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const db = await openRawSqlite(":memory:");
    migrations.find(m => m.id === 67)!.run(db);
    try {
      const realPrepare = db.prepare.bind(db);
      let writes = 0;
      vi.spyOn(db, "prepare").mockImplementation(sql => {
        const statement = realPrepare(sql);
        if (sql.startsWith("INSERT INTO security_assessment_runs")) {
          const realRun = statement.run.bind(statement);
          statement.run = (...params: unknown[]) => {
            if (++writes > 1) throw new Error("private storage details");
            return realRun(...params);
          };
        }
        return statement;
      });
      const service = new AssessmentService(db, async () => "open", 0);
      const scope = service.createScope(input(), "owner");
      const result = await service.wait(service.start(scope.id, "owner").id, "owner");
      __jait_capture(0, (result.status));
      __jait_capture(1, (result.observations));
      __jait_capture(2, (result.coverageGaps.some(g => g.includes("could not be persisted"))));
      __jait_capture(3, (JSON.stringify(result)));
    } finally { db.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_151_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const db = await openRawSqlite(":memory:");
    migrations.find(m => m.id === 67)!.run(db);
    try {
      const service = new AssessmentService(db, (_target, _port, signal) => new Promise(resolve =>
        signal.addEventListener("abort", () => resolve("error"), { once: true })), 0);
      const scope = service.createScope(input(), "owner");
      const run = service.start(scope.id, "owner");
      const reopened = new AssessmentService(db);
      __jait_capture(0, (reopened.getRun(run.id, "owner").status));
      service.cancel(run.id, "owner");
      await service.wait(run.id, "owner");
    } finally { db.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_assessment_test_ts_168_3": {


const input = (overrides: Partial<SecurityScopeInput> = {}): SecurityScopeInput => ({
  targets: ["192.0.2.10", "192.0.2.11"], exclusions: [], ports: [22, 80],
  authorized: true, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides,
});
/*__jait_scope_open__*/{

try {
await (async()=>{

    const server = createServer(socket => socket.end());
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected listening address");
    const service = new AssessmentService();
    const scope = service.createScope(input({ targets: ["127.0.0.1"], ports: [address.port] }), "fixture-owner");
    try {
      const before = await service.wait(service.start(scope.id, "fixture-owner").id, "fixture-owner");
      __jait_capture(0, (before.observations[0]?.state));
      await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
      const after = await service.wait(service.start(scope.id, "fixture-owner").id, "fixture-owner");
      __jait_capture(1, (after.observations[0]?.state));
      __jait_capture(2, (after.scope.vantagePoint), (before.scope.vantagePoint));
      __jait_capture(3, (after.scopeId), (before.scopeId));
      __jait_capture(4, (after.status));
    } finally { if (server.listening) server.close(); }
  
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
