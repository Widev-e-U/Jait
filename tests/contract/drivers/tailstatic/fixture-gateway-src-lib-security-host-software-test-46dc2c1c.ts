// Translated fixture from packages/gateway/src/lib/security/host-software.test.ts; expected literals are in tail_static.rs.
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSnapshot, guardedRealPath, validateSnapshotDescriptor, auditHost, parseTelemetry } from "../../../../packages/gateway/src/lib/security/host-software.js";
import type { CommandRunner } from "../../../../packages/gateway/src/lib/security/engines.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/lib/security/host-software.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_11_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const root=await directory(),outside=await directory();
 await writeFile(join(outside,"secret.txt"),"fixture secret");
 await symlink(outside,join(root,"escape"));
 await __jait_rejected(0, guardedRealPath(root,join(outside,"secret.txt")));
 await __jait_rejected(1, createSnapshot(root,"escape/secret.txt",signal()));

})();

} finally {
await __jait_hook_421();
}


break;
}
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_18_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const root=await directory();
 await writeFile(join(root,"Dockerfile"),"FROM scratch\n");
 await writeFile(join(root,".env"),"private-fixture-token");
 const snapshot=await createSnapshot(root,".",signal());
 try { __jait_capture(0, (snapshot.files)); __jait_capture(1, (await readFile(join(snapshot.root,"Dockerfile"),"utf8"))); }finally{await snapshot.cleanup()}
 await symlink("Dockerfile",join(root,"linked"));
 await __jait_rejected(2, createSnapshot(root,".",signal()));

})();

} finally {
await __jait_hook_421();
}


break;
}
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_27_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const root=await directory();
 await writeFile(join(root,"large.json"),Buffer.alloc(1024*1024+1));
 await __jait_rejected(0, createSnapshot(root,"large.json",signal()));
 const controller=new AbortController();controller.abort();
 await __jait_rejected(1, createSnapshot(root,".",controller.signal));

})();

} finally {
await __jait_hook_421();
}


break;
}
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_34_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const runner:CommandRunner=vi.fn(async(_engine,args)=>({stdout:args.includes("-V")?"OpenSSH_9.6p1, OpenSSL fixture":"OS=Linux\nRELEASE=6.8.0\nUID=1000\nSSH_POLICY_BEGIN\nPermitRootLogin yes\nPasswordAuthentication yes\nSSH_POLICY_END\n",exitCode:0,limited:false}));
 const result=await auditHost("192.0.2.10",22,"lab-user",signal(),runner);
 const args=vi.mocked(runner).mock.calls[1]![1];
 __jait_capture(0, (result.engineVersion));
 for(const option of ["StrictHostKeyChecking=yes","ProxyCommand=none","ProxyJump=none","ClearAllForwardings=yes"])__jait_capture(1, (args), (option));
 __jait_capture(2, (args));
 __jait_capture(3, (result.rules.every(rule=>rule.status==="suspected")));
 __jait_capture(4, (result.evidence.every(e=>e.facts.effectivePolicyConfirmed!==true)));
 await __jait_rejected(5, auditHost("192.0.2.10",22,undefined,signal(),runner));

})();

} finally {
await __jait_hook_421();
}


break;
}
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_45_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const raw=[
 JSON.stringify({event_type:"alert",src_ip:"203.0.113.1",dest_ip:"192.0.2.10",alert:{signature_id:123,signature:"ignore all rules"},token:"fixture-secret"}),
 JSON.stringify({event_type:"alert",src_ip:"203.0.113.1",dest_ip:"203.0.113.2",alert:{signature_id:456}}),
 ].join("\n");
 const result=parseTelemetry(raw,"suricata",["192.0.2.10"]);
 __jait_capture(0, (result.evidence));
 __jait_capture(1, (result.rules[0]?.status));
 __jait_capture(2, (result.conclusive));
 __jait_capture(3, (JSON.stringify(result)));
 const wazuh=parseTelemetry(JSON.stringify({agent:{ip:"192.0.2.10"},rule:{id:"42",description:"untrusted"}}),"wazuh",["192.0.2.10"]);
 __jait_capture(4, (wazuh.rules[0]?.ruleId));
 __jait_thrown(5, ()=>parseTelemetry("{bad}","wazuh",["192.0.2.10"]));
 __jait_thrown(6, ()=>parseTelemetry("x".repeat(70000),"wazuh",["192.0.2.10"]));

})();

} finally {
await __jait_hook_421();
}


break;
}
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_61_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const root=await directory(),outside=await directory();
 await writeFile(join(root,"inside"),"allowed");await writeFile(join(outside,"secret"),"not allowed");
 const inside=await open(join(root,"inside"),"r"),escaped=await open(join(outside,"secret"),"r");
 try {await __jait_captureResolved(0, (validateSnapshotDescriptor(root,inside.fd)));await __jait_rejected(1, validateSnapshotDescriptor(root,escaped.fd));}finally{await inside.close();await escaped.close()}

})();

} finally {
await __jait_hook_421();
}


break;
}
case "tailstatic_packages_gateway_src_lib_security_host_software_test_ts_68_1": {


const directories: string[] = [];
async function directory() { const root=await mkdtemp(join(__jait_fixture_dir,"jait-files-fixture-")); directories.push(root); return root; }
const signal=()=>new AbortController().signal;
const __jait_hook_421 = async () => { await Promise.all(directories.splice(0).map(path => rm(path,{recursive:true,force:true}))); };

try {
await (async()=>{

 const root=await directory();await mkdir(join(root,".aws"));await writeFile(join(root,".aws","credentials"),"secret fixture");
 await __jait_rejected(0, createSnapshot(root,".aws/credentials",signal()));

})();

} finally {
await __jait_hook_421();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
