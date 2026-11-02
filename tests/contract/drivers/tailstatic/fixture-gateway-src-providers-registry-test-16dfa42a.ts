// Translated fixture from packages/gateway/src/providers/registry.test.ts; expected literals are in tail_static.rs.
import { buildOmniRouteMcpServerRef, ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/registry.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_registry_test_ts_18_3_each0": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const runtimeMode = "full-access";

try {
await (async()=>{

    delete process.env.JAIT_OMNIROUTE_MCP;
    const refs = new ProviderRegistry().buildJaitMcpServerRefs(
      { host: "127.0.0.1", port: 8000 },
      undefined,
      { sessionId: "thread-1", projectRoot: "/workspace/project", runtimeMode },
    );
    __jait_capture(0, (refs));
    for (const ref of refs) {
      __jait_capture(1, (new URL(ref.url!).searchParams.get("runtimeMode")));
    }
  
})();

} finally {
await __jait_hook_553();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_18_3_each1": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const runtimeMode = "supervised";

try {
await (async()=>{

    delete process.env.JAIT_OMNIROUTE_MCP;
    const refs = new ProviderRegistry().buildJaitMcpServerRefs(
      { host: "127.0.0.1", port: 8000 },
      undefined,
      { sessionId: "thread-1", projectRoot: "/workspace/project", runtimeMode },
    );
    __jait_capture(0, (refs));
    for (const ref of refs) {
      __jait_capture(1, (new URL(ref.url!).searchParams.get("runtimeMode")));
    }
  
})();

} finally {
await __jait_hook_553();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_31_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    delete process.env.JAIT_OMNIROUTE_MCP;
    const registry = new ProviderRegistry();
    const personal = registry.buildJaitMcpServerRefs({ host: "127.0.0.1", port: 8000 }, undefined, { sessionId: "personal-chat" });
    registry.buildJaitMcpServerRefs({ host: "127.0.0.1", port: 8000 }, undefined, { sessionId: "other-chat", projectRoot: "/project" });
    __jait_capture(0, (personal));
    for (const ref of personal) {
      const url = new URL(ref.url!);
      __jait_capture(1, (url.searchParams.get("sessionId")));
      __jait_capture(2, (url.searchParams.has("projectRoot")));
    }
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_44_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ref = new ProviderRegistry().buildJaitMcpServerRef({ host: "127.0.0.1", port: 8000 });
    __jait_capture(0, (new URL(ref.url!).searchParams.has("runtimeMode")));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_49_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const refs = new ProviderRegistry().buildJaitMcpServerRefs(
      { host: "127.0.0.1", port: 8000 },
      "https://gateway.example.test",
      { sessionId: "session-1", projectRoot: "/workspace/project" },
    );

    __jait_capture(0, (refs.map((ref) => ref.name)));
    __jait_capture(1, (refs.map((ref) => {
      const url = new URL(ref.url!);
      return {
        origin: url.origin,
        pathname: url.pathname,
        sessionId: url.searchParams.get("sessionId"),
        projectRoot: url.searchParams.get("projectRoot"),
        toolSet: url.searchParams.get("toolSet"),
      };
    })));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_72_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    delete process.env.JAIT_OMNIROUTE_MCP;
    const refs = new ProviderRegistry().buildJaitMcpServerRefs({ host: "127.0.0.1", port: 8000 });
    __jait_capture(0, (refs.map((ref) => ref.name)));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_78_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    process.env.JAIT_OMNIROUTE_MCP = "1";
    process.env.OMNIROUTE_API_KEY = "sk-omni";
    const refs = new ProviderRegistry().buildJaitMcpServerRefs({ host: "127.0.0.1", port: 8000 });
    __jait_capture(0, (refs.map((ref) => ref.name)));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_87_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (buildOmniRouteMcpServerRef({ OMNIROUTE_API_KEY: "sk-omni" })));
    __jait_captureType(1, (buildOmniRouteMcpServerRef({ JAIT_OMNIROUTE_MCP: "0", OMNIROUTE_API_KEY: "sk-omni" })));
    __jait_captureType(2, (buildOmniRouteMcpServerRef({ JAIT_OMNIROUTE_MCP: "true", OMNIROUTE_API_KEY: "sk-omni" })));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_93_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The inference API serves keyless free-tier providers; the MCP endpoint
    // does not. Handing an agent a ref that can only fail is worse than none.
    __jait_captureType(0, (buildOmniRouteMcpServerRef({ JAIT_OMNIROUTE_MCP: "1" })));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_99_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // OMNIROUTE_BASE_URL names the OpenAI-compatible surface; the MCP stream
    // lives one level up. Naively appending would give /v1/api/mcp/stream.
    const ref = buildOmniRouteMcpServerRef({
      JAIT_OMNIROUTE_MCP: "1",
      OMNIROUTE_BASE_URL: "http://nas:20128/v1/",
      OMNIROUTE_API_KEY: "sk-omni",
    });

    __jait_capture(0, (ref));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_registry_test_ts_116_3": {


const ENV_KEYS = ["JAIT_OMNIROUTE_MCP", "OMNIROUTE_API_KEY", "OMNIROUTE_BASE_URL"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const __jait_hook_553 = () => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ref = buildOmniRouteMcpServerRef({
      JAIT_OMNIROUTE_MCP: "1",
      OMNIROUTE_API_KEY: "sk-omni",
    });

    __jait_capture(0, (ref?.url));
    __jait_capture(1, (ref?.headers));
    __jait_captureType(2, (ref?.env));
  
})();

} finally {
await __jait_hook_553();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
