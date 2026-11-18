// Translated fixture from packages/gateway/src/lib/security/engines.integration.test.ts; expected literals are in tail_static.rs.
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineStatus, scanNmap, scanNuclei, runCommand } from "../../../../packages/gateway/src/lib/security/engines.js";
import { scanSoftware } from "../../../../packages/gateway/src/lib/security/host-software.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/lib/security/engines.integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_12_2": {


const cleanup:Array<()=>Promise<void>>=[];
const signal=()=>new AbortController().signal;
const __jait_hook_400 = async()=>{await Promise.all(cleanup.splice(0).map(fn=>fn()))};
/*__jait_source_gate__ skipIf process.env.JAIT_TEST_SECURITY_ENGINES!=="1" */
/*__jait_scope_open__*/{

try {
await (async()=>{

  const status=await engineStatus(signal());__jait_capture(0, (status.every(engine=>engine.available)));
  const server=createServer((_request,response)=>response.end("fixture"));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));cleanup.push(()=>new Promise(resolve=>server.close(()=>resolve())));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Expected port");
  const result=await scanNmap(["127.0.0.1"],[address.port],signal());
  __jait_capture(1, (result.conclusive));__jait_capture(2, (result.evidence[0]?.facts.state));
 
})();

} finally {
await __jait_hook_400();
}
}

break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_20_2": {


const cleanup:Array<()=>Promise<void>>=[];
const signal=()=>new AbortController().signal;
const __jait_hook_400 = async()=>{await Promise.all(cleanup.splice(0).map(fn=>fn()))};
/*__jait_source_gate__ skipIf process.env.JAIT_TEST_SECURITY_ENGINES!=="1" */
/*__jait_scope_open__*/{

try {
await (async()=>{

  let fixed=false,requests=0;
  const server=createServer((_request,response)=>{requests++;if(fixed)response.setHeader("X-Content-Type-Options","nosniff");response.end("fixture")});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));cleanup.push(()=>new Promise(resolve=>server.close(()=>resolve())));
  const address=server.address();if(!address||typeof address==="string")throw new Error("Expected port");
  const url="http://127.0.0.1:"+address.port;
  const before=await scanNuclei(url,signal());__jait_capture(0, (before.rules.some(rule=>rule.ruleId==="http.nosniff")));
  fixed=true;const after=await scanNuclei(url,signal());__jait_capture(1, (after.rules));
  __jait_capture(2, (requests));__jait_capture(3, (requests));
 
})();

} finally {
await __jait_hook_400();
}
}

break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_30_2": {


const cleanup:Array<()=>Promise<void>>=[];
const signal=()=>new AbortController().signal;
const __jait_hook_400 = async()=>{await Promise.all(cleanup.splice(0).map(fn=>fn()))};
/*__jait_source_gate__ skipIf process.env.JAIT_TEST_SECURITY_ENGINES!=="1" */
/*__jait_scope_open__*/{

try {
await (async()=>{

  const root=await mkdtemp(join(__jait_fixture_dir,"jait-trivy-fixture-"));cleanup.push(()=>rm(root,{recursive:true,force:true}));
  await writeFile(join(root,"Dockerfile"),'FROM alpine:3.20\nCMD ["sleep","3600"]\n');
  const before=await scanSoftware(root,"Dockerfile",signal());
  __jait_capture(0, (before.conclusive));__jait_capture(1, (before.rules.some(rule=>rule.ruleId.startsWith("trivy.config."))));
  await writeFile(join(root,"Dockerfile"),'FROM alpine:3.20\nRUN adduser -D app\nUSER app\nHEALTHCHECK NONE\nCMD ["sleep","3600"]\n');
  const after=await scanSoftware(root,"Dockerfile",signal());
  __jait_capture(2, (after.conclusive));
  __jait_capture(3, (after.rules.length), (before.rules.length));
 
})();

} finally {
await __jait_hook_400();
}
}

break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_integration_test_ts_40_2": {


const cleanup:Array<()=>Promise<void>>=[];
const signal=()=>new AbortController().signal;
const __jait_hook_400 = async()=>{await Promise.all(cleanup.splice(0).map(fn=>fn()))};
/*__jait_source_gate__ skipIf process.env.JAIT_TEST_SECURITY_ENGINES!=="1" */
/*__jait_scope_open__*/{
/*__jait_source_gate__ skipIf !process.env.JAIT_TEST_TRIVY_CACHE */

try {
await (async()=>{

  const root=await mkdtemp(join(__jait_fixture_dir,"jait-packages-fixture-"));cleanup.push(()=>rm(root,{recursive:true,force:true}));
  const manifest=(version:string)=>JSON.stringify({name:"fixture",lockfileVersion:3,packages:{"":{name:"fixture",dependencies:{lodash:version}},"node_modules/lodash":{version,resolved:"https://registry.npmjs.org/lodash/-/lodash-"+version+".tgz"}}});
  await writeFile(join(root,"package-lock.json"),manifest("4.17.20"));
  const before=await scanSoftware(root,"package-lock.json",signal(),runCommand,true,process.env.JAIT_TEST_TRIVY_CACHE);
  __jait_capture(0, (before.conclusive));__jait_capture(1, (before.engineVersion));
  const correlations=before.rules.filter(rule=>rule.ruleId.startsWith("trivy.package."));__jait_capture(2, (correlations.length));__jait_capture(3, (correlations.every(rule=>rule.status==="suspected")));
  // The database may contain newer advisories against 4.17.21; verify this historical fix specifically.
  __jait_capture(4, (correlations.some(rule=>rule.ruleId==="trivy.package.CVE-2021-23337.lodash")));
  await writeFile(join(root,"package-lock.json"),manifest("4.17.21"));
  const after=await scanSoftware(root,"package-lock.json",signal(),runCommand,true,process.env.JAIT_TEST_TRIVY_CACHE);
  __jait_capture(5, (after.conclusive));__jait_capture(6, (after.rules.some(rule=>rule.ruleId==="trivy.package.CVE-2021-23337.lodash")));
 
})();

} finally {
await __jait_hook_400();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
