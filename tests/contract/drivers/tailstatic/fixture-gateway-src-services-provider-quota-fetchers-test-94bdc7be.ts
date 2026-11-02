// Translated fixture from packages/gateway/src/services/provider-quota-fetchers.test.ts; expected literals are in tail_static.rs.
import {
  fetchOllamaUsageFrom,
  isOllamaUsageResponse,
  probeOllamaAccount,
  describeOllamaUsageGap,
  isCodexRateLimitsResponse,
  normalizeCodexRateLimits,
} from "../../../../packages/gateway/src/services/provider-quota-fetchers.js";
import type { CodexRateLimitsResponse, CodexRateLimitSnapshot } from "../../../../packages/gateway/src/services/provider-quota-fetchers.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/provider-quota-fetchers.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_16_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    __jait_capture(0, (isOllamaUsageResponse({ limits: { session: { usage: 0.42, models: [] } }, totals: { request_count: 50 } })));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_19_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    __jait_capture(0, (isOllamaUsageResponse({
        limits: {
          session: { usage: 0.2, models: [] },
          weekly: { usage: 0.4, models: [] },
        },
      })));
    __jait_capture(1, (isOllamaUsageResponse({
        limits: { monthly: { usage: 0.6, models: [] } },
      })));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_35_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    const activity = {
      range: "7d", scope: "self", granularity: "day",
      from: "2026-09-30T00:00:00Z", until: "2026-10-07T11:29:42Z",
      totals: { request_count: 10388 },
      buckets: [{ from: "2026-09-30T00:00:00Z", until: "2026-10-01T00:00:00Z", request_count: 81 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(activity)));
    await __jait_captureResolved(0, (fetchOllamaUsageFrom("https://ollama.com", "test-key")), (activity));
    __jait_capture(1, (isOllamaUsageResponse(activity)));
    for (const count of [-1, "10388", null, Infinity]) {
      __jait_capture(2, (isOllamaUsageResponse({ ...activity, totals: { request_count: count } })));
    }
    __jait_capture(3, (isOllamaUsageResponse({ ...activity, from: "invalid" })));
    __jait_capture(4, (isOllamaUsageResponse({ ...activity, buckets: [{}] })));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_52_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    __jait_capture(0, (isOllamaUsageResponse({ limits: {} })));
    __jait_capture(1, (isOllamaUsageResponse({
        limits: { monthly: { usage: "60%", models: [] } },
      })));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_61_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      __jait_capture(0, (url));
      __jait_capture(1, ((init?.headers as Record<string, string> | undefined)?.Authorization));
      return new Response(
        JSON.stringify({ email: "me@example.com", name: "Me", plan: "pro" }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const probe = await probeOllamaAccount({ baseUrl: "https://ollama.com/", apiKey: "key-1" });
    __jait_capture(2, (probe));
    __jait_capture(3, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_80_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ Email: "me@example.com", Name: "Me", Plan: "pro" }),
    )));
    await __jait_captureResolved(0, (probeOllamaAccount({ baseUrl: "http://localhost:11434" })));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_90_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));

    const probe = await probeOllamaAccount({ apiKey: "bad" });
    __jait_capture(0, (probe));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_97_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const probe = await probeOllamaAccount({ baseUrl: "http://127.0.0.1:11434" });
    __jait_capture(0, (probe));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_109_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    const fetchMock = vi.fn(async (url: string) => {
      __jait_capture(0, (url));
      return new Response(
        JSON.stringify({ limits: { weekly: { usage: 0.3, models: [{ name: "llama3", requestCount: 2 }] } } }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const usage = await fetchOllamaUsageFrom("http://127.0.0.1:11434/");
    __jait_capture(1, (usage.limits.weekly?.usage));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_123_3": {


/*__jait_scope_open__*/{
const __jait_hook_412 = () => {
    vi.unstubAllGlobals();
  };

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    await __jait_captureRejected(0, (fetchOllamaUsageFrom("https://ollama.com", "bad")));
  
})();

} finally {
await __jait_hook_412();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_133_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: { reachable: false, account: null },
    });
    __jait_capture(0, (hint));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_144_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const hint = describeOllamaUsageGap({
      baseUrl: "https://ollama.com",
      cloud: true,
      probe: { reachable: true, account: null },
    });
    __jait_capture(0, (hint));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_153_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: { reachable: true, account: null },
    });
    __jait_capture(0, (hint));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_164_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: {
        reachable: true,
        account: { email: "jakob@example.com", name: "Jakob", plan: "pro" },
      },
    });
    __jait_capture(0, (hint));
    __jait_capture(1, (hint));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_179_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const hint = describeOllamaUsageGap({
      baseUrl: "http://127.0.0.1:11434",
      cloud: false,
      probe: { reachable: true, account: { email: null, name: "Jakob", plan: null } },
    });
    __jait_capture(0, (hint));
    __jait_capture(1, (hint));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_193_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    __jait_capture(0, (isCodexRateLimitsResponse({ rateLimits: { primary: window, secondary: null } })));
    __jait_capture(1, (isCodexRateLimitsResponse({ rateLimits: { primary: null, secondary: window } })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_198_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    __jait_capture(0, (isCodexRateLimitsResponse(null)));
    __jait_capture(1, (isCodexRateLimitsResponse("rateLimits")));
    __jait_capture(2, (isCodexRateLimitsResponse({})));
    __jait_capture(3, (isCodexRateLimitsResponse({ rateLimits: { primary: { usedPercent: "50" } } })));
    __jait_capture(4, (isCodexRateLimitsResponse({ rateLimits: { primary: { usedPercent: 50, resetsAt: "soon" } } })));
    __jait_capture(5, (isCodexRateLimitsResponse({ rateLimits: { primary: { usedPercent: 50, windowDurationMins: "300" } } })));
    __jait_capture(6, (isCodexRateLimitsResponse({ rateLimits: { secondary: {} } })));
    __jait_capture(7, (isCodexRateLimitsResponse({ rateLimits: "none" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_209_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    const response = {
      rateLimits: { primary: window, secondary: null },
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [
          { id: "c1", resetType: "codexRateLimits", status: "available", grantedAt: 1_770_000_000, expiresAt: 1_772_000_000, title: "Full reset (Weekly + 5 hr)", description: "…" },
          { id: "c2", grantedAt: null, expiresAt: null },
        ],
      },
    };
    __jait_capture(0, (isCodexRateLimitsResponse(response)));
    __jait_capture(1, (isCodexRateLimitsResponse({ rateLimits: { primary: window }, rateLimitResetCredits: {} })));
    __jait_capture(2, (isCodexRateLimitsResponse({ rateLimits: { primary: window }, rateLimitResetCredits: { availableCount: 0, credits: [] } })));
    __jait_capture(3, (isCodexRateLimitsResponse({ rateLimits: { primary: window }, rateLimitResetCredits: null })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_226_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    const base = { rateLimits: { primary: window, secondary: null } };
    __jait_capture(0, (isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { availableCount: "2" } })));
    __jait_capture(1, (isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { credits: "many" } })));
    __jait_capture(2, (isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { credits: [{ grantedAt: "yesterday" }] } })));
    __jait_capture(3, (isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: { credits: [null] } })));
    __jait_capture(4, (isCodexRateLimitsResponse({ ...base, rateLimitResetCredits: 7 })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_235_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    const base = { rateLimits: { primary: window, secondary: null } };
    __jait_capture(0, (isCodexRateLimitsResponse({ ...base, ordinaryUsageAllowed: false })));
    __jait_capture(1, (isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: { codex: { primary: window }, extra: { secondary: window } } })));
    __jait_capture(2, (isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: {} })));
    __jait_capture(3, (isCodexRateLimitsResponse({ ...base, ordinaryUsageAllowed: "false" })));
    __jait_capture(4, (isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: { codex: { primary: { usedPercent: "?" } } } })));
    __jait_capture(5, (isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: 3 })));
    __jait_capture(6, (isCodexRateLimitsResponse({ ...base, rateLimitsByLimitId: { codex: null } })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_250_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    const response: CodexRateLimitsResponse = {
      rateLimits: { primary: window, secondary: null, planType: "plus" },
      rateLimitsByLimitId: { codex: { primary: { usedPercent: 1, windowDurationMins: null, resetsAt: null } } },
    };
    __jait_capture(0, (normalizeCodexRateLimits(response)), (response));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_258_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    const response: CodexRateLimitsResponse = {
      rateLimits: { primary: null, secondary: null, planType: "team" },
      rateLimitsByLimitId: {
        other: { primary: null, secondary: { usedPercent: 1, windowDurationMins: null, resetsAt: null }, planType: "other" },
        codex: { primary: window, secondary: null, planType: "codex-plan", credits: { balance: "5" }, rateLimitReachedType: "primary", spendControlReached: true },
      },
    };
    const normalized = normalizeCodexRateLimits(response);
    __jait_capture(0, (normalized), (response));
    __jait_capture(1, (normalized.rateLimits.primary), (window));
    // Root-level account flags win over the promoted snapshot's.
    __jait_capture(2, (normalized.rateLimits.planType));
    __jait_capture(3, (normalized.rateLimits.credits));
    __jait_capture(4, (normalized.rateLimits.rateLimitReachedType));
    __jait_capture(5, (normalized.rateLimits.spendControlReached));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_quota_fetchers_test_ts_276_3": {


/*__jait_scope_open__*/{
const window = { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1_770_000_000 };

try {
await (async()=>{

    const only: CodexRateLimitSnapshot = { secondary: window };
    const normalized = normalizeCodexRateLimits({
      rateLimits: { primary: null, secondary: null },
      rateLimitsByLimitId: { first: only },
    });
    __jait_capture(0, (normalized.rateLimits.secondary), (window));

    const empty: CodexRateLimitsResponse = {
      rateLimits: { primary: null, secondary: null },
      rateLimitsByLimitId: { first: { primary: null, secondary: null } },
    };
    __jait_capture(1, (normalizeCodexRateLimits(empty)), (empty));
    const bare: CodexRateLimitsResponse = { rateLimits: { primary: null, secondary: null } };
    __jait_capture(2, (normalizeCodexRateLimits(bare)), (bare));
  
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
