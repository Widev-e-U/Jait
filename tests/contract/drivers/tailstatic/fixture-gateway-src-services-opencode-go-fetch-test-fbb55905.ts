// Translated fixture from packages/gateway/src/services/opencode-go-fetch.test.ts; expected literals are in tail_static.rs.
import { fetchJaitLlm, goRequest } from "../../../../packages/gateway/src/services/opencode-go-fetch.js";
import { callJaitLlmCompletion } from "../../../../packages/gateway/src/services/jait-llm.js";
import { runAgentLoop } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/opencode-go-fetch.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_opencode_go_fetch_test_ts_9_3_for0": {


const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
const __jait_hook_228 = () => vi.unstubAllGlobals();
const family = "claude";

try {
await (async()=>{

    const native = {...llm, openaiModel: family === "claude" ? "claude-sonnet-4-6" : "gpt-5.4"};
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => fetcher.mock.calls.length === 1
      ? events(family === "claude" ? [
        {type:"message_start",message:{usage:{input_tokens:4}}},
        {type:"content_block_start",index:0,content_block:{type:"tool_use",id:"call_1",name:"file_read",input:{}}},
        {type:"content_block_delta",index:0,delta:{type:"input_json_delta",partial_json:'{"path":"test.ts"}'}},
        {type:"message_delta",delta:{stop_reason:"tool_use"},usage:{output_tokens:3}}, {type:"message_stop"},
      ] : [
        {type:"response.output_item.added",output_index:1,item:{type:"function_call",call_id:"call_1",name:"file_read",arguments:""}},
        {type:"response.function_call_arguments.delta",output_index:1,delta:'{"path":"test.ts"}'},
        {type:"response.completed",response:{usage:{input_tokens:4,output_tokens:3}}},
      ])
      : events(family === "claude" ? [
        {type:"message_start",message:{usage:{input_tokens:8}}},
        {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"Reviewed code."}},
        {type:"message_delta",delta:{stop_reason:"end_turn"},usage:{output_tokens:4}}, {type:"message_stop"},
      ] : [
        {type:"response.output_text.delta",delta:"Reviewed code."},
        {type:"response.completed",response:{usage:{input_tokens:8,output_tokens:4}}},
      ]));
    vi.stubGlobal("fetch",fetcher);
    const execute = vi.fn(async () => ({ok:true,message:"Source contents"}));
    const result = await runAgentLoop({llm:native,sessionId:"coding-session",history:[{role:"user",content:"Review test.ts"}],hasTools:true,toolSchemas:[{type:"function",function:{name:"file_read",description:"Read a file",parameters:{type:"object",properties:{path:{type:"string"}},required:["path"]}}}],abort:new AbortController()}, execute);
    __jait_capture(0, (result.content));
    __jait_capture(1, (execute.mock.calls));
    __jait_capture(2, (fetcher.mock.calls));
    __jait_capture(3, (fetcher.mock.calls[0]![0]), (`${llm.openaiBaseUrl}/${family === "claude" ? "messages" : "responses"}`));
    const next = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
    __jait_capture(4, (JSON.stringify(next)));
    __jait_capture(5, (JSON.stringify(next)));
    __jait_capture(6, (new Headers(fetcher.mock.calls[1]![1]!.headers).get("x-opencode-session")));
  
})();

} finally {
await __jait_hook_228();
}


break;
}
case "tailstatic_packages_gateway_src_services_opencode_go_fetch_test_ts_9_3_for1": {


const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
const __jait_hook_228 = () => vi.unstubAllGlobals();
const family = "gpt";

try {
await (async()=>{

    const native = {...llm, openaiModel: family === "claude" ? "claude-sonnet-4-6" : "gpt-5.4"};
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => fetcher.mock.calls.length === 1
      ? events(family === "claude" ? [
        {type:"message_start",message:{usage:{input_tokens:4}}},
        {type:"content_block_start",index:0,content_block:{type:"tool_use",id:"call_1",name:"file_read",input:{}}},
        {type:"content_block_delta",index:0,delta:{type:"input_json_delta",partial_json:'{"path":"test.ts"}'}},
        {type:"message_delta",delta:{stop_reason:"tool_use"},usage:{output_tokens:3}}, {type:"message_stop"},
      ] : [
        {type:"response.output_item.added",output_index:1,item:{type:"function_call",call_id:"call_1",name:"file_read",arguments:""}},
        {type:"response.function_call_arguments.delta",output_index:1,delta:'{"path":"test.ts"}'},
        {type:"response.completed",response:{usage:{input_tokens:4,output_tokens:3}}},
      ])
      : events(family === "claude" ? [
        {type:"message_start",message:{usage:{input_tokens:8}}},
        {type:"content_block_delta",index:0,delta:{type:"text_delta",text:"Reviewed code."}},
        {type:"message_delta",delta:{stop_reason:"end_turn"},usage:{output_tokens:4}}, {type:"message_stop"},
      ] : [
        {type:"response.output_text.delta",delta:"Reviewed code."},
        {type:"response.completed",response:{usage:{input_tokens:8,output_tokens:4}}},
      ]));
    vi.stubGlobal("fetch",fetcher);
    const execute = vi.fn(async () => ({ok:true,message:"Source contents"}));
    const result = await runAgentLoop({llm:native,sessionId:"coding-session",history:[{role:"user",content:"Review test.ts"}],hasTools:true,toolSchemas:[{type:"function",function:{name:"file_read",description:"Read a file",parameters:{type:"object",properties:{path:{type:"string"}},required:["path"]}}}],abort:new AbortController()}, execute);
    __jait_capture(0, (result.content));
    __jait_capture(1, (execute.mock.calls));
    __jait_capture(2, (fetcher.mock.calls));
    __jait_capture(3, (fetcher.mock.calls[0]![0]), (`${llm.openaiBaseUrl}/${family === "claude" ? "messages" : "responses"}`));
    const next = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
    __jait_capture(4, (JSON.stringify(next)));
    __jait_capture(5, (JSON.stringify(next)));
    __jait_capture(6, (new Headers(fetcher.mock.calls[1]![1]!.headers).get("x-opencode-session")));
  
})();

} finally {
await __jait_hook_228();
}


break;
}
case "tailstatic_packages_gateway_src_services_opencode_go_fetch_test_ts_43_1": {


const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
const __jait_hook_228 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  vi.stubGlobal("fetch",vi.fn(async () => Response.json({content:[{type:"text",text:"Title"}],stop_reason:"end_turn",usage:{input_tokens:2,output_tokens:1}})));
  __jait_capture(0, (await callJaitLlmCompletion(llm,[{role:"user",content:"Name the change"}])));

})();

} finally {
await __jait_hook_228();
}


break;
}
case "tailstatic_packages_gateway_src_services_opencode_go_fetch_test_ts_47_1": {


const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
const __jait_hook_228 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const abort = new AbortController(); abort.abort();
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { __jait_capture(0, (init?.signal), (abort.signal)); return Response.json({error:{message:"Invalid API key"}},{status:401}); });
  vi.stubGlobal("fetch",fetcher);
  const response = await fetchJaitLlm(llm,"unused",{body:JSON.stringify({model:llm.openaiModel,messages:[],stream:false}),signal:abort.signal});
  __jait_capture(1, (response.status));
  __jait_capture(2, (await response.json()));

})();

} finally {
await __jait_hook_228();
}


break;
}
case "tailstatic_packages_gateway_src_services_opencode_go_fetch_test_ts_55_1": {


const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
const __jait_hook_228 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const body = {model:"test",messages:[{role:"system",content:"Review"},{role:"user",content:[{type:"image_url",image_url:{url:"data:image/png;base64,YQ=="}}]},{role:"assistant",content:"",tool_calls:[{id:"t1",function:{name:"read",arguments:'{"a":1}'}}]},{role:"tool",tool_call_id:"t1",content:"Found"}]};
  __jait_capture(0, (goRequest(body,"messages").messages[0].content[0].source));
  __jait_capture(1, (goRequest(body,"responses").input.at(-1)));

})();

} finally {
await __jait_hook_228();
}


break;
}
case "tailstatic_packages_gateway_src_services_opencode_go_fetch_test_ts_61_1": {


const llm = { backend: "opencode-go" as const, openaiBaseUrl: "https://opencode.ai/zen/go/v1", openaiApiKey: "go-key", openaiModel: "claude-sonnet-4-6", contextWindow: 128000 };
const events = (items: unknown[]) => new Response(items.map(item => `data: ${JSON.stringify(item)}\n\n`).join(""), {headers:{"content-type":"text/event-stream"}});
const __jait_hook_228 = () => vi.unstubAllGlobals();

try {
await (async()=>{

  const native = { ...llm, openaiModel: "kimi-k2.5" };
  const thinking = "Read the source before answering.";
  const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => fetcher.mock.calls.length === 1
    ? events([
      { choices: [{ delta: { reasoning_content: thinking } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "file_read", arguments: '{"path":"test.ts"}' } }] }, finish_reason: "tool_calls" }] },
    ])
    : events([{ choices: [{ delta: { content: "Reviewed code." }, finish_reason: "stop" }] }]));
  vi.stubGlobal("fetch", fetcher);
  const execute = vi.fn(async () => ({ ok: true, message: "Source contents" }));
  const result = await runAgentLoop({
    llm: native, sessionId: "coding-session", history: [{ role: "user", content: "Review test.ts" }],
    hasTools: true, toolSchemas: [{ type: "function", function: { name: "file_read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } } }],
    abort: new AbortController(),
  }, execute);
  __jait_capture(0, (result.content));
  __jait_capture(1, (execute.mock.calls));
  __jait_capture(2, (fetcher.mock.calls));
  __jait_capture(3, (fetcher.mock.calls[1]![0]), (`${llm.openaiBaseUrl}/chat/completions`));
  const next = JSON.parse(String(fetcher.mock.calls[1]![1]!.body));
  const assistant = next.messages.find((m: { role: string }) => m.role === "assistant");
  __jait_capture(4, (assistant.reasoning_content), (thinking));
  __jait_capture(5, (assistant));
  const tool = next.messages.find((m: { role: string }) => m.role === "tool");
  __jait_capture(6, (tool.tool_call_id));
  __jait_capture(7, (tool));

})();

} finally {
await __jait_hook_228();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
