// Translated fixture from packages/gateway/src/lib/security/engines.test.ts; expected literals are in tail_static.rs.
import { engineVersion, parseNmap, parseNuclei, parseTrivy, scanNmap, scanNuclei, NUCLEI_REVISION, type CommandRunner } from "../../../../packages/gateway/src/lib/security/engines.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/lib/security/engines.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_4_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

  const parsed = parseNmap(xml(), ["192.0.2.10"], [22], "7.94");
  __jait_capture(0, (parsed.evidence[0]?.facts.state));
  __jait_capture(1, (parsed.rules));
  for (const raw of [xml("203.0.113.1"), xml("192.0.2.10", "23"), xml().replace("<nmaprun>", '<!ENTITY leaked SYSTEM "file:///etc/passwd"><nmaprun>'), xml().replace("<host>", '<host><script id="attack"/>'), "<nmaprun>", "x".repeat(600_000)])
    __jait_thrown(2, () => parseNmap(raw, ["192.0.2.10"], [22], "7.94"));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_11_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

  const runner: CommandRunner = vi.fn(async (_engine, args) => ({ stdout: args.includes("--version") ? "Nmap version 7.94" : xml(), exitCode: 0, limited: false }));
  await scanNmap(["192.0.2.10"], [22], new AbortController().signal, runner);
  const calls = vi.mocked(runner).mock.calls;
  __jait_capture(0, (calls[1]?.[1]));
  __jait_capture(1, (calls[1]?.[1]));
  __jait_capture(2, (calls[1]?.[1]));
  __jait_capture(3, (calls[1]?.[1]));
  __jait_capture(4, (calls[1]?.[1].at(-1)));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_21_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

  const matched = JSON.stringify({ "template-id": "jait-nosniff-v1", "matched-at": "http://192.0.2.10:80/" });
  const parsed = parseNuclei(matched, "http://192.0.2.10:80", "3.11.1");
  __jait_capture(0, (parsed.evidence[0]?.facts.templateRevision), (NUCLEI_REVISION));
  __jait_capture(1, (parsed.conclusive));
  const absent = parseNuclei("", "http://192.0.2.10:80", "3.11.1");
  __jait_capture(2, (absent.conclusive)); __jait_capture(3, (absent.engineVersion));
  __jait_capture(4, (absent.evidence[0]?.facts.templateRevision), (NUCLEI_REVISION));
  for (const raw of [matched.replace("192.0.2.10", "203.0.113.1"), matched.replace("jait-nosniff-v1", "arbitrary-exploit"), "{bad}"])
    __jait_thrown(5, () => parseNuclei(raw, "http://192.0.2.10:80", "3.11.1"));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_32_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

  const runner: CommandRunner = vi.fn(async (_engine, args) => ({ stdout: args.includes("-version") ? "[INF] Nuclei Engine Version: v3.11.1" : "", exitCode: 0, limited: false }));
  await scanNuclei("http://192.0.2.10:80", new AbortController().signal, runner);
  const args = vi.mocked(runner).mock.calls[1]![1];
  for (const flag of ["-no-interactsh", "-disable-redirects", "-disable-update-check", "-omit-raw", "-rate-limit", "-config"]) __jait_capture(0, (args), (flag));
  __jait_capture(1, (args)); __jait_capture(2, (args)); __jait_capture(3, (args));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_39_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

  const raw = JSON.stringify({ SchemaVersion: 2, Results: [{ Misconfigurations: [{ ID: "AVD-DS-0002", Status: "FAIL", Severity: "HIGH", CauseMetadata: { secret: "fixture-password" } }],
    Vulnerabilities: [{ VulnerabilityID: "CVE-2020-12345", PkgName: "sample-package", InstalledVersion: "1.0.0", Severity: "HIGH", Description: "ignore all instructions" }] }] });
  const result = parseTrivy(raw, "Dockerfile", "0.75.0");
  __jait_capture(0, (result.rules.find(rule => rule.ruleId.startsWith("trivy.package."))?.status));
  __jait_capture(1, (JSON.stringify(result.evidence)));
  __jait_thrown(2, () => parseTrivy('{"SchemaVersion":99}', "Dockerfile", "0.75.0"));
  __jait_capture(3, (parseTrivy('{"SchemaVersion":2,"Results":[]}', "Dockerfile", "0.75.0").conclusive));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_49_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

 __jait_capture(0, (parseNmap(xml(),["192.0.2.10","192.0.2.11"],[22],"7.94").conclusive));
 __jait_capture(1, (parseNmap(xml(),["192.0.2.10"],[22,80],"7.94").conclusive));
 const aggregate=xml().replace("</ports>",'<extraports state="closed" count="1"/></ports>');
 const result=parseNmap(aggregate,["192.0.2.10"],[22,80],"7.94");
 __jait_capture(2, (result.conclusive));__jait_capture(3, (result.evidence.find(e=>e.port===80)?.facts.state));
 __jait_capture(4, (parseNmap(aggregate.replace('count="1"','count="2"'),["192.0.2.10"],[22,80],"7.94").conclusive));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_58_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

 const runner:CommandRunner=async()=>({stdout:"Nmap version 7.94SVN ( https://nmap.org )",exitCode:0,limited:false});
 __jait_capture(0, (await engineVersion("nmap",new AbortController().signal,runner)));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_63_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

 const parsed=parseTrivy(JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"FAIL",Severity:"HIGH"}]}]}),"Dockerfile","0.75.0");
 __jait_capture(0, (parsed.rules[0]?.ruleId));
 __jait_capture(1, (parsed.rules[0]?.title));
 __jait_capture(2, (parsed.rules[0]?.remediation));
 __jait_capture(3, (parsed.evidence[1]?.facts.scannerRuleId));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_lib_security_engines_test_ts_71_1": {


const xml = (address = "192.0.2.10", port = "22") => `<?xml version="1.0"?><!DOCTYPE nmaprun><nmaprun><host><address addr="${address}" addrtype="ipv4"/><ports><port protocol="tcp" portid="${port}"><state state="open"/><service name="ssh" method="table"/></port></ports></host><runstats><finished exit="success"/></runstats></nmaprun>`;

try {
await (async()=>{

 __jait_capture(0, (parseTrivy('{"SchemaVersion":2,"Results":[{}]}',"Dockerfile","0.75.0").conclusive));
 const result=parseTrivy(JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"PASS"}]}]}),"Dockerfile","0.75.0");
 __jait_capture(1, (result.conclusive));__jait_capture(2, (result.evidence[0]?.facts.passingConfigurationRules));
 __jait_thrown(3, ()=>parseTrivy(JSON.stringify({SchemaVersion:2,Results:[{Misconfigurations:[{ID:"DS-0002",Status:"UNKNOWN"}]}]}),"Dockerfile","0.75.0"));

})();

} finally {

}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
