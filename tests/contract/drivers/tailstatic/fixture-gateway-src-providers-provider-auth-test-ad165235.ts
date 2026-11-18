// Translated fixture from packages/gateway/src/providers/provider-auth.test.ts; expected literals are in tail_static.rs.
import { delimiter } from "node:path";
import {
  SHADOWED_GITHUB_COPILOT_TOKEN_ENV_VARS,
  extractDeviceAuthDetails,
  buildProviderAuthEnv,
  parseCommandLine,
  stripAnsi,
  stripEnvVars,
} from "../../../../packages/gateway/src/providers/provider-auth.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/provider-auth.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_13_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommandLine(`"/Applications/Codex CLI/codex" login --profile "QA Team"`)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_20_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommandLine(`codex login --message "Use \\\"staging\\\" profile"`)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_27_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommandLine(`"C:\\Program Files\\Codex\\codex.exe" login`)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_34_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommandLine(`codex login --config C:\\Users\\Alice\\.codex\\auth.json`)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_41_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Open https://auth.openai.com/activate in your browser",
      "Your code is ABCD-EFGH",
    ].join("\n"));

    __jait_capture(0, (details));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_53_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = "\u001b[32mCode: WXYZ-1234\u001b[0m\nVisit https://github.com/login/device";

    __jait_capture(0, (stripAnsi(output)));
    __jait_capture(1, (extractDeviceAuthDetails(output)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_63_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "DEVICE AUTHORIZATION",
      "Open https://auth.openai.com/activate in your browser",
      "Code: AUTHORIZATION",
      "Use code AB12-CD34 to continue",
    ].join("\n"));

    __jait_capture(0, (details));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_77_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Open https://auth.openai.com/activate in your browser",
      "Enter THIS-ONE-TIME-CODE",
      "Use code XY12-ZZ90 to continue",
    ].join("\n"));

    __jait_capture(0, (details));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_90_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Welcome to Codex [v0.125.0]",
      "Follow these steps to sign in with ChatGPT using device code authorization:",
      "",
      "1. Open this link in your browser and sign in to your account",
      "   https://auth.openai.com/codex/device",
      "",
      "2. Enter this one-time code (expires in 15 minutes)",
      "   1URT-UU74B",
      "",
      "Device codes are a common phishing target. Never share this code.",
    ].join("\n"));

    __jait_capture(0, (details));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_110_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Opening https://claude.ai/oauth/authorize in your browser…",
      "Enter the authorization code from your browser:",
    ].join("\n"));

    __jait_capture(0, (details));
    __jait_captureType(1, (details.userCode));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_124_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Visit https://example.com/login",
      "Authorization code:",
    ].join("\n"));

    __jait_capture(0, (details.requiresCodeInput));
    __jait_capture(1, (details.inputPrompt));
    __jait_captureType(2, (details.userCode));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_135_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Open https://example.com/oauth",
      "Paste the auth code here:",
    ].join("\n"));

    __jait_capture(0, (details.requiresCodeInput));
    __jait_capture(1, (details.inputPrompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_145_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails([
      "Open https://auth.openai.com/activate",
      "Your code is AB12-CD34",
      "Enter the authorization code from your browser:",
    ].join("\n"));

    __jait_capture(0, (details.userCode));
    __jait_captureType(1, (details.requiresCodeInput));
    __jait_captureType(2, (details.inputPrompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_157_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails("Visit https://github.com/login/device. to continue");
    __jait_capture(0, (details.verificationUri));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_162_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const details = extractDeviceAuthDetails("Open the page (https://auth.example.com/path) in your browser");
    __jait_capture(0, (details.verificationUri));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_167_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (extractDeviceAuthDetails("")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_176_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommandLine("   \t  ")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_180_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommandLine("codex   login\t\t--profile  dev")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_187_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const env = buildProviderAuthEnv({
      PATH: "/usr/bin",
      NPM_CONFIG_PREFIX: "/tmp/jait-npm-global",
    });

    __jait_capture(0, (env.PATH?.split(delimiter)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_196_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (stripEnvVars({ KEEP: "1", DROP: "2" }, ["DROP"])));
    __jait_capture(1, (stripEnvVars({ KEEP: "1" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_201_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const previous = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "ghp_inherited";
    try {
      const env = buildProviderAuthEnv({ PATH: "/usr/bin" }, ["GH_TOKEN"]);
      __jait_captureType(0, (env.GH_TOKEN));
      __jait_capture(1, (env.PATH));
    } finally {
      if (previous === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = previous;
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_provider_auth_test_ts_214_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const env = buildProviderAuthEnv(
      { GH_TOKEN: "github_pat_explicit" },
      SHADOWED_GITHUB_COPILOT_TOKEN_ENV_VARS,
    );
    __jait_capture(0, (env.GH_TOKEN));
  
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
