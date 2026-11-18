// Translated fixture from packages/gateway/src/security/workbench.test.ts; expected literals are in tail_static.rs.
import { createServer } from "node:http";
import { getAssessmentService, setAssessmentDb } from "../../../../packages/gateway/src/security/assessment.js";
import { SecurityWorkbenchService } from "../../../../packages/gateway/src/security/workbench.js";
import { parseTrivy } from "../../../../packages/gateway/src/lib/security/engines.js";
import { openRawSqlite } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { migrations } from "../../../../packages/gateway/src/db/migrations.js";
import { evidence, rule, type AdapterResult } from "../../../../packages/gateway/src/lib/security/protocols.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/workbench.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_workbench_test_ts_19_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const s = scope(); const service = new SecurityWorkbenchService();
    const input = {scopeId: s.id, profile: "http" as const, target: "127.0.0.1", port: 80};
    for (const candidate of [
      {...input, target: "192.0.2.1"}, {...input, port: 443}, {...input, profile: "tls"},
      {...input, serverName: "unapproved.invalid"}, {...input, username: "root"},
      {...input, path: "../secret"},
    ]) __jait_thrown(0, () => service.start(candidate as typeof input, "owner"));
    __jait_thrown(1, () => service.start(input, "other"));
    __jait_thrown(2, () => service.start(input, "owner", "remote-node"));
    const host = scope(["host-audit"], [80]);
    __jait_thrown(3, () => service.start({scopeId:host.id, profile:"host-audit", target:"127.0.0.1", username:"root"}, "owner"));
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_workbench_test_ts_32_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    let fixed = false;
    const server = createServer((_request, response) => { if (fixed) response.setHeader("X-Content-Type-Options", "nosniff"); response.end("fixture"); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    cleanup.push(() => new Promise(resolve => server.close(() => resolve())));
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Expected port");
    const s = scope(["http"], [address.port]); const service = new SecurityWorkbenchService();
    const before = await service.wait(service.start({scopeId:s.id, profile:"http", target:"127.0.0.1", port:address.port}, "owner").id, "owner");
    const finding = service.history("owner").findings.find(f => f.ruleId === "http.nosniff")!;
    __jait_capture(0, (finding.evidenceIds.every(id => before.evidence.some(e => e.id === id))));
    __jait_capture(1, (service.plan(finding.id, "owner").rollback.length));
    service.decide(finding.id, "owner", "accepted-risk");
    const repeated = await service.wait(service.start(before.input, "owner").id, "owner");
    __jait_capture(2, (service.finding(finding.id, "owner").disposition));
    __jait_capture(3, (before.findings[0]?.evidenceIds), (repeated.findings[0]?.evidenceIds));
    fixed = true;
    const verified = await service.verify(finding.id, "owner");
    __jait_capture(4, (verified.status));
    __jait_capture(5, (service.finding(finding.id, "owner").disposition));
    const report = service.report(before.id, "owner");
    __jait_capture(6, (JSON.stringify(report)));
    __jait_capture(7, (report.findings.some(f => f.evidenceIds.some(id => before.evidence.some(e => e.id === id)))));
    __jait_capture(8, (service.history("other")));
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_workbench_test_ts_56_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    let output = fixture(); const service = new SecurityWorkbenchService(undefined, async () => output);
    const s = scope(); const first = await service.wait(service.start({scopeId:s.id, profile:"http", target:"127.0.0.1", port:80}, "owner").id, "owner");
    const id = first.findingIds[0]!;
    output = fixture(false, false);
    __jait_capture(0, ((await service.verify(id, "owner")).status));
    __jait_capture(1, (service.finding(id, "owner").disposition));
    output = {...fixture(false), engineVersion:"2"};
    __jait_capture(2, ((await service.verify(id, "owner")).status));
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_workbench_test_ts_66_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const adapter = vi.fn((_input, _scope, signal: AbortSignal): Promise<AdapterResult> => new Promise(resolve => signal.addEventListener("abort", () => resolve(fixture(false, false)), {once:true})));
    const service = new SecurityWorkbenchService(undefined, adapter); const s = scope(["http", "tcp"]);
    const run = service.start({scopeId:s.id, profile:"http", target:"127.0.0.1", port:80}, "owner");
    __jait_thrown(0, () => getAssessmentService().start(s.id,"owner"));
    __jait_thrown(1, () => service.cancel(run.id,"other"));
    service.cancel(run.id,"owner"); const result = await service.wait(run.id,"owner");
    __jait_capture(2, (result.status));
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_workbench_test_ts_75_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const s=getAssessmentService().createScope({targets:["127.0.0.1"],exclusions:[],ports:[1],methods:["trivy"],paths:["Dockerfile"],authorized:true,expiresAt:new Date(Date.now()+60_000).toISOString()},"owner",process.cwd());
    let raw=JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"FAIL",Severity:"HIGH"}]}]});
    const service=new SecurityWorkbenchService(undefined,async()=>parseTrivy(raw,"Dockerfile","0.75.0"));
    const input={scopeId:s.id,profile:"trivy" as const,path:"Dockerfile"};
    const before=await service.wait(service.start(input,"owner").id,"owner");
    const finding=before.findings[0]!;
    raw=JSON.stringify({SchemaVersion:2,Results:[{Class:"lang-pkgs",Type:"npm"}]});
    __jait_capture(0, ((await service.verify(finding.id,"owner")).status));
    __jait_capture(1, (service.finding(finding.id,"owner").disposition));
    raw=JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"PASS"}]}]});
    __jait_capture(2, ((await service.verify(finding.id,"owner")).status));
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_workbench_test_ts_88_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const clock=vi.spyOn(Date,"now").mockReturnValue(Date.now());
    try{
      const s=getAssessmentService().createScope({targets:["127.0.0.1"],exclusions:[],ports:[80],methods:["http"],authorized:true,expiresAt:new Date(Date.now()+20).toISOString()},"owner");
      const service=new SecurityWorkbenchService(undefined,(_input,_scope,signal)=>new Promise(resolve=>signal.addEventListener("abort",()=>resolve(fixture(false,false)),{once:true})));
      const run=await service.wait(service.start({scopeId:s.id,profile:"http",target:"127.0.0.1",port:80},"owner").id,"owner");
      __jait_capture(0, (run.status));
    }finally{clock.mockRestore();}
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_workbench_test_ts_97_3": {


const cleanup: Array<() => Promise<void>> = [];
function scope(methods: ("http" | "tls" | "nmap" | "host-audit" | "tcp")[] = ["http"], ports = [80]) {
  return getAssessmentService().createScope({ targets: ["127.0.0.1"], exclusions: [], ports, authorized: true, methods, expiresAt: new Date(Date.now() + 60_000).toISOString() }, "owner");
}
const fixture = (present = true, conclusive = true): AdapterResult => ({
  engine: "fixture-http", engineVersion: "1", evidence: [evidence("127.0.0.1", 80, "Header policy", {noSniff: !present})],
  rules: present ? [rule("http.nosniff", "Missing nosniff", "low", "Set the header")] : [], coverageGaps: ["Fixture"], conclusive,
});
const __jait_hook_528 = async () => { await Promise.all(cleanup.splice(0).map(fn => fn())); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const db = await openRawSqlite(":memory:");
    for (const id of [67,68]) migrations.find(m => m.id === id)!.run(db);
    setAssessmentDb(db);
    try {
      const s = scope(); const service = new SecurityWorkbenchService(db, async () => ({...fixture(), raw:"private artifact", contentType:"text/plain"}));
      const run = await service.wait(service.start({scopeId:s.id,profile:"http",target:"127.0.0.1",port:80},"owner").id,"owner");
      __jait_capture(0, (run.artifact?.sha256));
      const recovered = new SecurityWorkbenchService(db);
      __jait_capture(1, (recovered.get(run.id,"owner")), (run));
      __jait_capture(2, (recovered.history("other").findings));
      __jait_capture(3, (JSON.stringify(recovered.report(run.id,"owner"))));
      recovered.deleteRun(run.id,"owner");
      __jait_capture(4, ((db.prepare("SELECT count(*) AS n FROM security_artifacts").get() as {n:number}).n));
    } finally {
      const fresh = await openRawSqlite(":memory:"); migrations.find(m => m.id === 67)!.run(fresh); setAssessmentDb(fresh);
      cleanup.push(async () => fresh.close()); db.close();
    }
  
})();

} finally {
await __jait_hook_528();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
