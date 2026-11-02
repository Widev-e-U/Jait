// Translated fixture from packages/gateway/src/services/thread-title.test.ts; expected literals are in tail_static.rs.
import type { ProviderEvent } from "../../../../packages/gateway/src/providers/contracts.js";
import {
  THREAD_TITLE_PROMPT,
  generateTitleViaApi,
  generateTitleViaTurn,
  normalizeGeneratedThreadTitle,
} from "../../../../packages/gateway/src/services/thread-title.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/thread-title.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_18_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (THREAD_TITLE_PROMPT));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_22_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle('Title: "Fix manager thread selection"\n\nExtra text', "Fallback")));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_28_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle("3D viewer crash fix", "Fallback")));
    __jait_capture(1, (normalizeGeneratedThreadTitle("1. Fix project reload loop", "Fallback")));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_33_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(" \n ", "Fallback title")));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each0": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = "<tool_call>";

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each1": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = '<tool_call>\n{"name":"terminal","arguments":{}}\n</tool_call>';

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each2": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = "</tool_call>";

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = "<tool_calls />";

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each4": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = '<function_call name="terminal">';

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each5": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = 'Title: "<TOOL_CALL>"';

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each6": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = "- `<tool_call>`";

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each7": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = "<|tool_call|>";

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_37_3_each8": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const raw = "[TOOL_CALLS]";

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle(raw, "Fallback title")));
    __jait_capture(1, (normalizeGeneratedThreadTitle(raw, "")));
  
})();

} finally {
await __jait_hook_308();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_52_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeGeneratedThreadTitle("Fix <tool_call> chat titles", "Fallback")));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_58_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      __jait_capture(0, (String(input)));
      __jait_capture(1, ((init?.headers as Record<string, string>)["Authorization"]));
      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
      __jait_capture(2, (body.model));
      __jait_capture(3, (body.messages[0]?.content));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Fix mimo backend selection" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const title = await generateTitleViaApi({
      task: "Make sure Jait threads respect the configured backend",
      config: {
        port: 0,
        wsPort: 0,
        host: "127.0.0.1",
        logLevel: "silent",
        corsOrigin: "*",
        nodeEnv: "test",
        jwtSecret: "test",
        llmProvider: "ollama",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "dummy",
        openaiApiKey: "",
        openaiModel: "gpt-4o",
        openaiBaseUrl: "https://api.openai.com/v1",
        contextWindow: 128000,
        hookSecret: "test",
        heartbeatCron: "* * * * *",
        whisperUrl: "http://localhost:8178",
      },
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
      model: "xiaomi/mimo-v2-pro",
      jaitBackend: "openrouter",
    });

    __jait_capture(4, (title));
    __jait_capture(5, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_104_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression: GLM thinking models via Ollama spend part of the completion
    // budget on internal reasoning before writing the title. With the old
    // budget of 24 tokens the visible answer never arrived — `content` came
    // back empty (finish_reason "length") and every new chat silently kept
    // its truncated first-message name.
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      __jait_capture(0, (String(input)));
      const body = JSON.parse(String(init?.body)) as {
        model: string;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      };
      __jait_capture(1, (body.model));
      __jait_capture(2, (body.max_tokens));
      __jait_capture(3, (body.messages[0]?.content));
      // Response shape produced by reasoning models: the answer is present
      // once the budget allows the model to finish thinking.
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: { content: "Fix chat naming bug", reasoning: "the user wants... ok" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const title = await generateTitleViaApi({
      task: "some longer opening message that should become a chat title",
      config: {
        port: 0,
        wsPort: 0,
        host: "127.0.0.1",
        logLevel: "silent",
        corsOrigin: "*",
        nodeEnv: "test",
        jwtSecret: "test",
        llmProvider: "ollama",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "dummy",
        openaiApiKey: "",
        openaiModel: "gpt-4o",
        openaiBaseUrl: "https://api.openai.com/v1",
        contextWindow: 128000,
        hookSecret: "test",
        heartbeatCron: "* * * * *",
        whisperUrl: "http://localhost:8178",
      },
      model: "glm-5.3-flash:cloud",
      jaitBackend: "ollama",
    });

    __jait_capture(4, (title));
    __jait_capture(5, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_165_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // If a reasoning model still burns the whole budget, the helper must fail
    // loudly (so the route logs it) rather than return "" which the route
    // silently turns into a first-message-derived title.
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "length",
              message: { content: "", reasoning: "let me think about a good title for..." },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ) as unknown as typeof fetch;

    await __jait_rejected(0, generateTitleViaApi({
        task: "some longer opening message",
        config: {
          port: 0,
          wsPort: 0,
          host: "127.0.0.1",
          logLevel: "silent",
          corsOrigin: "*",
          nodeEnv: "test",
          jwtSecret: "test",
          llmProvider: "ollama",
          ollamaUrl: "http://localhost:11434",
          ollamaModel: "dummy",
          openaiApiKey: "",
          openaiModel: "gpt-4o",
          openaiBaseUrl: "https://api.openai.com/v1",
          contextWindow: 128000,
          hookSecret: "test",
          heartbeatCron: "* * * * *",
          whisperUrl: "http://localhost:8178",
        },
        model: "glm-5.3-flash:cloud",
        jaitBackend: "ollama",
      }));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_214_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const provider = { onEvent: vi.fn(() => { throw new Error("subscribe failed"); }), sendTurn: vi.fn() };
      await __jait_rejected(0, generateTitleViaTurn(provider as unknown as Parameters<typeof generateTitleViaTurn>[0], "s", "task"));
      __jait_capture(1, (provider.sendTurn.mock.calls));
      __jait_capture(2, (vi.getTimerCount()));
    } finally { vi.useRealTimers(); }
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_224_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const unsubscribe = vi.fn();
      const provider = { onEvent: vi.fn(() => unsubscribe), sendTurn: vi.fn(() => { throw new Error("send failed"); }) };
      await __jait_rejected(0, generateTitleViaTurn(provider as unknown as Parameters<typeof generateTitleViaTurn>[0], "s", "task"));
      __jait_capture(1, (unsubscribe.mock.calls));
      __jait_capture(2, (vi.getTimerCount()));
    } finally { vi.useRealTimers(); }
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_thread_title_test_ts_235_3": {


const originalFetch = globalThis.fetch;
const __jait_hook_308 = () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const unsubscribe = vi.fn();
    let listener: (event: ProviderEvent) => void = () => {};
    const provider = {
      onEvent: vi.fn((fn: (event: ProviderEvent) => void) => { listener = fn; return unsubscribe; }),
      sendTurn: vi.fn(async () => { listener({ type: "turn.completed", sessionId: "s" } as ProviderEvent); throw new Error("late rejection"); }),
    };
    await __jait_captureResolved(0, (generateTitleViaTurn(provider as unknown as Parameters<typeof generateTitleViaTurn>[0], "s", "task")));
    await Promise.resolve();
    __jait_capture(1, (unsubscribe.mock.calls));
  
})();

} finally {
await __jait_hook_308();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
