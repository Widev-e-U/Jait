// Translated fixture from packages/gateway/src/tools/agent-loop.test.ts; expected literals are in tail_static.rs.
import {
  __testUtils,
  applyProviderPromptCaching,
  formatLLMError,
  parseOpenAIStream,
  parseOllamaStream,
  serializeMessages,
  serializeMessagesForOllama,
  buildTieredToolSchemas,
  toolDefsToSchemas,
  fromOpenAIName,
  registerOpenAINameMappings,
  listAmbiguousOpenAINames,
  runAgentLoop,
  serializeToolResultForModel,
  SteeringController,
  retryToolCall,
  ToolCallPriority,
  ToolCallQueue,
  MIN_REPETITION_SPAN_CHARS,
  type AgentLoopEvent,
  type AgentMessage,
  type ExecutedToolCall,
  type OpenAIToolCall,
} from "../../../../packages/gateway/src/tools/agent-loop.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { getReminderInstructions } from "../../../../packages/gateway/src/tools/prompts/index.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/agent-loop.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_64_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (serializeMessages([
      { role: "tool", content: "Found", tool_call_id: "c1", name: "file_read" },
    ])));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_70_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls = [toolCall("c1")];
    __jait_capture(0, (serializeMessages([
      { role: "assistant", content: "", thinking: "Read the file first.", tool_calls: calls },
    ])), ([{
      role: "assistant", content: "", reasoning_content: "Read the file first.", tool_calls: calls,
    }]));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_79_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const call = toolCall("empty-reasoning");
    __jait_capture(0, (serializeMessages([
      { role: "assistant", content: "", thinking: "", tool_calls: [call] },
      { role: "assistant", content: "", tool_calls: [call] },
    ]).map(m => m.reasoning_content)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_87_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (serializeMessages([
      { role: "user", content: "Review", name: "reviewer", thinking: "internal metadata" },
      { role: "assistant", content: "Done" },
    ])));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_99_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "get_weather", arguments: '{"city":"Vienna"}' } }],
      },
      { role: "tool", content: '{"temp_c":24}', tool_call_id: "c1", name: "get_weather" },
    ];
    const out = serializeMessagesForOllama(history) as any[];
    // assistant tool_calls: no id/type, arguments parsed to object
    __jait_capture(0, (out[1].tool_calls));
    __jait_captureType(1, (out[1].tool_calls[0].id));
    // tool result: uses tool_name, no tool_call_id
    __jait_capture(2, (out[2]));
    __jait_captureType(3, (out[2].tool_call_id));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_118_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const out = serializeMessagesForOllama([
      { role: "assistant", content: "", tool_calls: [{ id: "x", type: "function", function: { name: "f", arguments: "not json" } }] },
    ]) as any[];
    __jait_capture(0, (out[0].tool_calls[0].function.arguments));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_125_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const message = {
      role: "user",
      content: [
        { type: "text", text: "What color is this?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
      ],
    } as unknown as AgentMessage;

    __jait_capture(0, (serializeMessagesForOllama([message])));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_141_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const message = {
      role: "user",
      content: [{ type: "image_url", image_url: { url: "aGVsbG8=" } }],
    } as unknown as AgentMessage;

    __jait_capture(0, (serializeMessagesForOllama([message])));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_156_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (formatLLMError(400, '{"error":"model does not support images"}')));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_161_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (formatLLMError(400, '{"error":{"message":"invalid image"}}')));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_168_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", thinking: "let me think" } }) + "\n",
      JSON.stringify({ message: { role: "assistant", content: "Hello " } }) + "\n",
      JSON.stringify({ message: { role: "assistant", content: "world" } }) + "\n",
      JSON.stringify({ message: { role: "assistant", tool_calls: [{ id: "t1", function: { name: "get_weather", arguments: { city: "Vienna" } } }] } }) + "\n",
      JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 100, eval_count: 20 }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader);
    __jait_capture(0, (parsed.thinkingText));
    __jait_capture(1, (parsed.contentText));
    // tool calls normalized to internal OpenAI shape (arguments stringified)
    __jait_capture(2, (parsed.toolCalls));
    // done_reason normalized to tool_calls when calls present
    __jait_capture(3, (parsed.finishReason));
    __jait_capture(4, (parsed.usage));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_188_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reader = streamReader([
      JSON.stringify({ message: { content: "partial" } }) + "\n",
      JSON.stringify({ done: true, done_reason: "length", prompt_eval_count: 5, eval_count: 5 }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader);
    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.finishReason));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_198_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", content: "<thinking>pondering</thinking>Hi" } }) + "\n",
      JSON.stringify({ done: true, done_reason: "stop" }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader, (event) => events.push(event));
    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
    __jait_capture(2, (events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content)));
    __jait_capture(3, (events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_211_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", content: "Use <thinking>this</thinking> tags" } }) + "\n",
      JSON.stringify({ done: true, done_reason: "stop" }) + "\n",
    ]);
    const parsed = await parseOllamaStream(reader);
    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_221_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reader = streamReader([
      JSON.stringify({ error: "model runner disconnected" }) + "\n",
    ]);

    await __jait_rejected(0, parseOllamaStream(reader));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_229_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reader = streamReader([
      JSON.stringify({ message: { role: "assistant", content: "partial" } }) + "\n",
    ]);

    await __jait_rejected(0, parseOllamaStream(reader));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_237_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const failure = new Error("socket reset");
    const reader = {
      read: vi.fn().mockRejectedValue(failure),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    await __jait_rejected(0, parseOllamaStream(reader));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_246_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const controller = new AbortController();
    const encoder = new TextEncoder();
    let reads = 0;
    const reader = {
      read: vi.fn(async () => {
        if (reads++ === 0) {
          return {
            done: false,
            value: encoder.encode(
              JSON.stringify({ message: { role: "assistant", content: "partial" }, done: false }) + "\n",
            ),
          };
        }
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      }),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    const parsed = await parseOllamaStream(reader, undefined, controller.signal);

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.interrupted));
    __jait_captureType(2, (parsed.finishReason));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_274_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (fromOpenAIName("ssh_session_start")));
    __jait_capture(1, (fromOpenAIName("ssh_session_run")));
    __jait_capture(2, (fromOpenAIName("ssh_session_close")));
    __jait_capture(3, (fromOpenAIName("browser_sandbox_start")));
    __jait_capture(4, (fromOpenAIName("windows_sandbox_start")));
    __jait_capture(5, (fromOpenAIName("windows_sandbox_stop")));
    __jait_capture(6, (fromOpenAIName("linux_desktop_sandbox_start")));
    __jait_capture(7, (fromOpenAIName("linux_desktop_sandbox_stop")));
    __jait_capture(8, (fromOpenAIName("project_create")));
    __jait_capture(9, (fromOpenAIName("project_assign_repository")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_287_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const register = (name: string) => registry.register({
      name,
      description: `${name} description`,
      tier: "standard",
      category: "external",
      source: "builtin",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => ({ ok: true, message: "ok" }),
    });
    register("agent.github.token");
    register("security.assessments.list");
    register("os.sandbox.list");
    register("mobile.alarm.schedule");

    // Discovery path: tools.search activates non-core tools, which the builder
    // then advertises — this is how `agent.github.token` reaches a model.
    const advertised = buildTieredToolSchemas(registry, undefined, {
      activatedToolNames: ["agent.github.token", "security.assessments.list", "os.sandbox.list", "mobile.alarm.schedule"],
    }).map((schema) => schema.function.name);
    __jait_capture(0, (advertised));

    const resolved = advertised.map((name) => fromOpenAIName(name));
    __jait_capture(1, (resolved));
    for (const [index, name] of resolved.entries()) {
      __jait_capture(2, (registry.isExecutable(name)));
    }
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_322_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const advertised = toolDefsToSchemas([
      { name: "security.findings.list", description: "list findings", parameters: { type: "object", properties: {} } },
    ]).map((schema) => schema.function.name);

    __jait_capture(0, (advertised));
    __jait_capture(1, (fromOpenAIName(advertised[0]!)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_331_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const register = (name: string) => registry.register({
      name,
      description: `${name} description`,
      tier: "standard",
      category: "external",
      source: "builtin",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => ({ ok: true, message: "ok" }),
    });
    // Both collapse to the same provider-safe name. Registration must never fail:
    // the registry legitimately exposes legacy alias pairs such as os.tool/os_tool.
    register("a.b_c");
    register("a_b.c");
    register("preview.open");

    const advertised = buildTieredToolSchemas(registry, undefined, {
      activatedToolNames: ["a.b_c", "a_b.c", "preview.open"],
    }).map((schema) => schema.function.name);

    // One schema per provider name, so a provider never receives a duplicate function.
    __jait_capture(0, (advertised.filter((name) => name === "a_b_c")));
    // Unambiguous neighbours keep round-tripping.
    __jait_capture(1, (advertised));
    __jait_capture(2, (fromOpenAIName("preview_open")));

    // The advertised alias resolves to a registered, executable tool — never to an
    // invented name — and stays deterministic across repeated resolution.
    const winner = fromOpenAIName("a_b_c");
    __jait_capture(3, (["a.b_c", "a_b.c"]), (winner));
    __jait_capture(4, (registry.isExecutable(winner)));
    __jait_capture(5, (fromOpenAIName("a_b_c")), (winner));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_366_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The inverse is derived only from names that were actually advertised. An
    // alias nobody advertised stays unresolved, so the agent gets an actionable
    // "Unknown tool" error instead of silently executing a different tool.
    __jait_capture(0, (fromOpenAIName("never_advertised_tool")));
    __jait_capture(1, (fromOpenAIName("totally_unknown_tool")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_376_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const register = (name: string, tier: "core" | "standard") => registry.register({
      name,
      description: `${name} description`,
      tier,
      category: tier === "core" ? "meta" : "filesystem",
      source: "builtin",
      parameters: { type: "object", properties: {}, required: [] },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    register("read", "core");
    register("edit", "core");
    register("todo", "core");
    register("user.ask", "core");
    register("tools.list", "core");
    register("tools.search", "core");
    register("file.read", "standard");

    const names = buildTieredToolSchemas(registry, undefined, { ollamaEssentials: true })
      .map((schema) => fromOpenAIName(schema.function.name));

    __jait_capture(0, (names));
    __jait_capture(1, (names));
    __jait_capture(2, (names));
    __jait_capture(3, (names));
    __jait_capture(4, (names));
    __jait_capture(5, (names));
    __jait_capture(6, (names));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_409_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const register = (name: string, description: string, tier: "core" | "standard") => registry.register({
      name,
      description,
      tier,
      category: tier === "core" ? "meta" : "browser",
      source: "builtin",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => ({ ok: true, message: "completed" }),
    });
    register("todo", "Track multi-step work", "core");
    register("user.ask", "Ask the user for a real decision", "core");
    register("tools.search", "Search deferred tools", "core");
    register("preview.open", "Open a live preview of the web application", "standard");
    register("browser.click", "Click an element in an existing browser session", "standard");

    const firstTurnNames = buildTieredToolSchemas(registry, undefined, { query: "show me the app", selectionLimit: 1 })
      .map((schema) => fromOpenAIName(schema.function.name));
    __jait_capture(0, (firstTurnNames));

    const nextTurnNames = buildTieredToolSchemas(registry, undefined, {
      activatedToolNames: new Set(["preview.open"]),
      query: "continue with the work",
      selectionLimit: 1,
    }).map((schema) => fromOpenAIName(schema.function.name));
    __jait_capture(1, (nextTurnNames));

    const disabledNames = buildTieredToolSchemas(registry, new Set(["preview.open"]), {
      activatedToolNames: new Set(["preview.open"]),
    }).map((schema) => fromOpenAIName(schema.function.name));
    __jait_capture(2, (disabledNames));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_445_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);

    const batch = queue.dequeueBatch(true);

    __jait_capture(0, (batch.map((item) => item.toolCall.id)));
    __jait_capture(1, (queue.isEmpty));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_456_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a", "terminal_exec"), ToolCallPriority.Normal, false);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);

    const batch = queue.dequeueBatch(true);

    __jait_capture(0, (batch.map((item) => item.toolCall.id)));
    __jait_capture(1, (queue.length));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_467_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("c"), ToolCallPriority.Normal, true);

    const batch = queue.dequeueBatch(true);

    __jait_capture(0, (batch.map((item) => item.toolCall.id)));
    __jait_capture(1, (queue.isEmpty));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_479_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const queue = new ToolCallQueue();
    queue.enqueue(toolCall("a"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("b"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("c"), ToolCallPriority.Normal, true);
    queue.enqueue(toolCall("d", "terminal_exec"), ToolCallPriority.Normal, false);

    const batch = queue.dequeueBatch(true);

    __jait_capture(0, (batch.map((item) => item.toolCall.id)));
    __jait_capture(1, (queue.length));
    __jait_capture(2, (queue.dequeueBatch(true).map((item) => item.toolCall.id)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_495_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (JSON.parse(serializeToolResultForModel({
      ok: true,
      message: "command output",
      data: { output: "command output", exitCode: 0 },
    }))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_503_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (JSON.parse(serializeToolResultForModel({
      ok: true,
      message: "2 results",
      data: { items: ["a", "b"] },
    }))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_513_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const openAI: Record<string, unknown> = {};
    applyProviderPromptCaching(openAI, { backend: "openai" });
    __jait_capture(0, (openAI.prompt_cache_key));

    const compatible: Record<string, unknown> = {};
    applyProviderPromptCaching(compatible, { backend: "openrouter" });
    __jait_capture(1, (compatible));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_525_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"tail"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}',
    ]));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.finishReason));
    __jait_capture(2, (parsed.usage));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_540_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n',
      'data: {"choices":[],"usage":{"prompt_tokens":120,"completion_tokens":8,"total_tokens":128,"prompt_tokens_details":{"cached_tokens":96}}}\n',
    ]));

    __jait_capture(0, (parsed.usage));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_554_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"file","arguments":"{\\"path\\":\\""}}]}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":".read","arguments":"a.ts\\"}"}}]}}]}',
    ]));

    __jait_capture(0, (parsed.toolCalls));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_572_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<thinking>step one reasoning</thinking>Hello "}}]}\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n',
    ]), (event) => events.push(event));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
    __jait_capture(2, (events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content).join("")));
    __jait_capture(3, (events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content).join("")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_585_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<th"}}]}\n',
      'data: {"choices":[{"delta":{"content":"inking>reasoning</thinking>answer"}}]}\n',
    ]), (event) => events.push(event));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
    __jait_capture(2, (events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content).join("")));
    __jait_capture(3, (events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content).join("")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_598_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"Use `<thinking>` tags like "}}]}\n',
      'data: {"choices":[{"delta":{"content":"<thinking>this</thinking>` in HTML."}}]}\n',
    ]), (event) => events.push(event));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
    __jait_capture(2, (events.filter((event) => event.type === "thinking")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_610_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<think>quick check</think>Done."}}]}\n',
    ]), (event) => events.push(event));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_620_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"<reasoning>step one reasoning</reasoning>Hello "}}]}\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n',
    ]), (event) => events.push(event));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
    __jait_capture(2, (events.filter((event) => event.type === "token").map((event) => (event as { content: string }).content).join("")));
    __jait_capture(3, (events.filter((event) => event.type === "thinking").map((event) => (event as { content: string }).content).join("")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_633_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const parsed = await parseOpenAIStream(streamReader([
      'data: {"choices":[{"delta":{"content":"Use `<reasoning>` tags like "}}]}\n',
      'data: {"choices":[{"delta":{"content":"<reasoning>this</reasoning>` in HTML."}}]}\n',
    ]), (event) => events.push(event));

    __jait_capture(0, (parsed.contentText));
    __jait_capture(1, (parsed.thinkingText));
    __jait_capture(2, (events.filter((event) => event.type === "thinking")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_645_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    await __jait_rejected(0, parseOpenAIStream(streamReader([
      'data: {"error":{"message":"upstream overloaded"}}\n\n',
    ])));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_651_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reader = {
      read: vi.fn().mockRejectedValue(new Error("connection closed")),
    } as unknown as ReadableStreamDefaultReader<Uint8Array>;

    await __jait_rejected(0, parseOpenAIStream(reader));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_665_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const text = "Checked the selector.\n".repeat(4)
      + "Here is what actually changed in the provider panel and why it matters. ".repeat(6);
    __jait_captureType(0, (__testUtils.findDegenerateRepetition(text)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_671_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (__testUtils.findDegenerateRepetition("no. ".repeat(20))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_675_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const repetition = __testUtils.findDegenerateRepetition("Let me re-read it.\n" + LOOP_UNIT.repeat(40));

    __jait_captureType(0, (repetition));
    __jait_capture(1, (repetition!.unit), (LOOP_UNIT));
    __jait_capture(2, (repetition!.copies));
    __jait_capture(3, (repetition!.startIndex));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_684_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // 20k characters of loop — more than the 16k window the scan inspects.
    const copies = Math.ceil(20_000 / LOOP_UNIT.length);
    const repetition = __testUtils.findDegenerateRepetition(LOOP_UNIT.repeat(copies));

    __jait_capture(0, (repetition!.copies), (copies));
    __jait_capture(1, (repetition!.startIndex));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_693_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const trimmed = __testUtils.trimDegenerateRepetition("Preamble.\n" + LOOP_UNIT.repeat(40));

    __jait_capture(0, (trimmed.startsWith("Preamble.\n" + LOOP_UNIT.repeat(2))));
    __jait_capture(1, (trimmed));
    __jait_capture(2, (trimmed.length), (LOOP_UNIT.length * 5));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_701_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Observed in chat 01a04cbe: same short sentence re-emitted with drifting
    // tab/space runs. Space runs grow monotonically, so no exact period can
    // match and only the near-verbatim (pooled) detector can catch it.
    const sentence = "what went wrong here then";
    let churned = "the assistant starts answering normally. ";
    for (let i = 0; i < 40; i++) {
      churned += sentence.replace(/ /g, " ".repeat(2 + Math.floor(i / 3))) + (i % 3 === 0 ? "\n" : "\t");
    }
    __jait_capture(0, (churned.length), (MIN_REPETITION_SPAN_CHARS));

    const repetition = __testUtils.findDegenerateRepetition(churned);
    __jait_captureType(1, (repetition));
    __jait_capture(2, (repetition!.approximate));
    __jait_capture(3, (repetition!.copies));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_718_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const honest = [
      "- Checked anthropic selector: pinned via JAIT_PROVIDER in config.",
      "- Inspected gateway logs: no 5xx bursts, stream throttling only.",
      "- Traced session 01a04cbe: provider loop repeated after restart.",
      "- Compared normalized payloads: identical up to whitespace drift.",
      "- Verified round budget: three recovery resamples were available.",
      "- Reviewed strategy prompt: instructs a different tool structure.",
      "- Measured window density: seed occurrences stayed under floor.",
      "- Confirmed tail bounds: final phrase sat near the raw end only.",
      "- Recomputed pooled span: cohort gaps exceeded cohesion bound.",
      "- Re-read moderation skip: unrelated to the repetition mistake.",
    ].join("\n");
    __jait_capture(0, (honest.length), (MIN_REPETITION_SPAN_CHARS));
    __jait_captureType(1, (__testUtils.findDegenerateRepetition(honest)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_735_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const sentence = "let me check the output now";
    let churned = "Preamble kept for context.\n";
    for (let i = 0; i < 40; i++) {
      churned += sentence.replace(/ /g, " ".repeat(2 + Math.floor(i / 3)));
    }

    const trimmed = __testUtils.trimDegenerateRepetition(churned);
    __jait_capture(0, (trimmed.startsWith("Preamble kept for context.\n")));
    __jait_capture(1, (trimmed));
    __jait_capture(2, (trimmed.length), (churned.length));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_750_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const chunks = [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{"content":"NEVER-REACHED"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
    ];
    const parsed = await parseOpenAIStream(streamReader(chunks));

    __jait_capture(0, (parsed.repetition?.source));
    __jait_capture(1, (parsed.finishReason));
    __jait_capture(2, (parsed.contentText));
    // Cut off well before the 60 copies the provider was still sending.
    __jait_capture(3, (parsed.contentText.length), (LOOP_UNIT.length * 40));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_768_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const chunks = [
      ...Array.from(
        { length: 60 },
        () => `${JSON.stringify({ message: { thinking: LOOP_UNIT } })}\n`,
      ),
      `${JSON.stringify({ message: { thinking: "NEVER-REACHED" }, done: true, done_reason: "stop" })}\n`,
    ];
    const parsed = await parseOllamaStream(streamReader(chunks));

    __jait_capture(0, (parsed.repetition?.source));
    __jait_capture(1, (parsed.finishReason));
    __jait_capture(2, (parsed.thinkingText));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_783_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const repeatedLine = "Let me now move on to a new translation\n\n";
    const variantLine = "I should now move on to a new translation\n\n";
    const preamble = "Useful evidence collected before the model drifted. ".padEnd(200, "x");
    const malformed = preamble
      + repeatedLine.repeat(15)
      + variantLine.repeat(2)
      + repeatedLine
      + variantLine.repeat(2)
      + repeatedLine
      + "Let me now move on to a";
    const chunks = [
      ...Array.from(
        malformed,
        (content) => `${JSON.stringify({ message: { content } })}\n`,
      ),
      `${JSON.stringify({ done: true, done_reason: "stop" })}\n`,
    ];

    const parsed = await parseOllamaStream(streamReader(chunks));

    __jait_capture(0, (parsed.repetition?.source));
    __jait_capture(1, (parsed.finishReason));
    __jait_capture(2, (parsed.contentText.length), (malformed.length));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_809_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const parsed = await parseOllamaStream(streamReader([
      `${JSON.stringify({ message: { content: "All done." } })}\n`,
      `${JSON.stringify({ done: true, done_reason: "stop" })}\n`,
    ]));

    __jait_captureType(0, (parsed.repetition));
    __jait_capture(1, (parsed.finishReason));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_832_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function loopingResponse(): string[] {
    return [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n\n",
    ];
  }

try {
await (async()=>{

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 2) {
        return new Response([
          'data: {"choices":[{"delta":{"content":"Provider selector fixed."}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ].join(""));
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of loopingResponse()) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Fix the provider selector." },
    ];
    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-repetition",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "unused" }),
    );

    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.aborted));
    __jait_capture(2, (result.hitMaxRounds));
    __jait_capture(3, (result.content));
    __jait_capture(4, (result.content));
    __jait_capture(5, (events.some((event) =>
      event.type === "steering" && event.message.includes("repeating its text")
    )));

    // The malformed wall is never replayed into provider history.
    __jait_capture(6, (history.some((message) => message.content.includes(LOOP_UNIT.repeat(8)))));
    const assistantTurn = history.at(-1)!;
    __jait_capture(7, (assistantTurn.role));
    __jait_capture(8, (assistantTurn.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_893_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function loopingResponse(): string[] {
    return [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n\n",
    ];
  }

try {
await (async()=>{

    // Round 1 streams a preamble then a runaway wall; the loop discards it and
    // resamples. The rollback event lets the chat route truncate its
    // accumulator to the pre-discard content length instead of persisting the
    // streamed garbage.
    const preamble = "Let me check the selector.\n";
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 2) {
        return new Response([
          'data: {"choices":[{"delta":{"content":"Provider selector fixed."}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ].join(""));
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(preamble)}}}]}\n\n`));
          for (const chunk of loopingResponse()) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Fix the provider selector." },
    ];
    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-rollback",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "unused" }),
    );

    const rollbacks = events.filter((event): event is Extract<AgentLoopEvent, { type: "content_rollback" }> =>
      event.type === "content_rollback");
    // The first (discarded) generation must have signaled a rollback; the
    // clean resample must not add another one.
    __jait_capture(0, (rollbacks.length));
    // The rollback happened before any clean content existed.
    __jait_capture(1, (rollbacks[0]!.contentLength));
    __jait_capture(2, (result.content));
    // The streamed preamble never reaches the final transcript.
    __jait_capture(3, (result.content), (preamble.trim()));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_956_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function loopingResponse(): string[] {
    return [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n\n",
    ];
  }

try {
await (async()=>{

    // The prefix the model wrote on its way into the loop is the context it was
    // following when it fell in, so a discarded attempt must contribute nothing
    // to history or to the rendered transcript.
    const preamble = "Let me re-read the selector one more time.\n";
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 2) {
        return new Response([
          'data: {"choices":[{"delta":{"content":"Provider selector fixed."}}]}\n\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
          "data: [DONE]\n\n",
        ].join(""));
      }
      return new Response([
        `data: {"choices":[{"delta":{"content":${JSON.stringify(preamble)}}}]}\n`,
        ...loopingResponse(),
      ].join(""), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Fix the provider selector." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-repetition-runup",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "unused" }),
    );

    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.segments.some((segment) => segment.content.includes(preamble))));
    __jait_capture(3, (history.some((message) => (message.content ?? "").includes(preamble))));
    __jait_capture(4, (history.some((message) => message.role === "assistant" && !message.content)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1007_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function loopingResponse(): string[] {
    return [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n\n",
    ];
  }

try {
await (async()=>{

    // Each round stays one copy under the streaming guard, so only the
    // accumulated reasoning reveals the loop. Without that check the
    // "resume where you left off" recovery feeds the loop back in.
    const round = (visible: string) => [
      `data: {"choices":[{"delta":{"reasoning_content":${JSON.stringify(LOOP_UNIT.repeat(10))}}}]}\n\n`,
      `data: {"choices":[{"delta":{"content":${JSON.stringify(visible)}}}]}\n\n`,
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      return new Response(round(fetchCalls === 1 ? "A" : "B"));
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the provider selector." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-repetition-length",
        abort: new AbortController(),
        maxRounds: 8,
        mode: "agent",
      },
      async () => ({ ok: true, message: "unused" }),
    );

    // One continuation, then the accumulated reasoning trips the guard.
    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1051_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function loopingResponse(): string[] {
    return [
      ...Array.from(
        { length: 60 },
        () => `data: {"choices":[{"delta":{"content":${JSON.stringify(LOOP_UNIT)}}}]}\n`,
      ),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n',
      "data: [DONE]\n\n",
    ];
  }

try {
await (async()=>{

    const bodies: any[] = [];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init: any) => {
      fetchCalls++;
      bodies.push(JSON.parse(init.body));
      if (fetchCalls === 2) {
        return new Response(
          `{"message":{"content":"Provider selector fixed."},"done":true,"done_reason":"stop"}\n`,
        );
      }
      return new Response([
        ...Array.from(
          { length: 60 },
          () => `{"message":{"content":${JSON.stringify(LOOP_UNIT)}},"done":false}\n`,
        ),
        `{"done":true,"done_reason":"stop"}\n`,
      ].join(""), { status: 200 });
    });

    await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "http://localhost:11434/v1",
          openaiModel: "test-model",
          contextWindow: 100_000,
          backend: "ollama",
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the provider selector." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-repetition-ollama",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "unused" }),
    );

    __jait_capture(0, (fetchCalls));
    __jait_captureType(1, (bodies[0].options.temperature));
    __jait_captureType(2, (bodies[0].options.seed));
    __jait_capture(3, (bodies[1].options.temperature));
    __jait_capture(4, (typeof bodies[1].options.seed));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1103_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "assistant", content: "Checking", tool_calls: [toolCall("call-1", "execute")] },
      { role: "user", content: "continue" },
    ];

    __testUtils.repairToolCallHistory(history);

    __jait_capture(0, (history.map((message) => message.role)));
    __jait_capture(1, (history[2]));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1120_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "execute")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "deployed" }),
        tool_call_id: "call-1",
        name: "execute",
      },
    ];
    const original = structuredClone(history);

    __testUtils.repairToolCallHistory(history);

    __jait_capture(0, (history), (original));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1138_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "tool", content: "{\"ok\":true}", tool_call_id: "orphan", name: "execute" },
      { role: "user", content: "next" },
    ];

    __testUtils.repairToolCallHistory(history);

    __jait_capture(0, (history));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1155_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      {
        role: "user",
        content: "Goal: replace placeholder pruning. Keep implementation minimal and avoid changing unrelated files.",
      },
      {
        role: "assistant",
        content: "Decision: use deterministic structured summaries that preserve goal, constraints, decisions, files, progress, and next steps.",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [toolCall("call-1", "file_read")],
      },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/tools/agent-loop.ts" }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      {
        role: "assistant",
        content: "Progress: the pruning helper is ready. Run the focused agent-loop tests next.",
      },
      { role: "user", content: "Please continue with the current implementation." },
    ];

    const pruned = await __testUtils.pruneHistory(history, 40, []);
    const summary = history[1]?.content ?? "";

    __jait_capture(0, (pruned));
    __jait_capture(1, (summary));
    __jait_capture(2, (summary));
    __jait_capture(3, (summary));
    __jait_capture(4, (summary));
    __jait_capture(5, (summary));
    __jait_capture(6, (summary));
    __jait_capture(7, (summary));
    __jait_capture(8, (summary));
    __jait_capture(9, (summary));
    __jait_capture(10, (summary));
    __jait_capture(11, (summary));
    __jait_capture(12, (summary));
    __jait_capture(13, (history.at(-1)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1203_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const task =
      "generating commit messages with Jait provider selected gives me LLM returned an empty response please fix that at last then push";
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: task },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/services/thread-title.ts (unrelated tangent)" }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      { role: "assistant", content: "", tool_calls: [toolCall("call-2", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/routes/threads.ts (unrelated tangent)" }),
        tool_call_id: "call-2",
        name: "file_read",
      },
      { role: "user", content: "continue?" },
    ];

    const pruned = await __testUtils.pruneHistory(history, 40, []);

    __jait_capture(0, (pruned));
    // The bulk was collapsed into a summary at the top.
    __jait_capture(1, (history[1]?.content ?? ""));
    // The bare continuation is still preserved verbatim as the final turn.
    __jait_capture(2, (history.at(-1)));
    // The real task survives as a live (non-tail) user turn — not only in the summary.
    const reinjected = history
      .slice(0, -1)
      .find((m) => m.role === "user" && m.content.includes(task));
    __jait_captureType(3, (reinjected));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1240_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // A single large tool result inside the active turn (after the last user
    // message). Codex-style compaction never truncates results into stubs: it
    // only fires at the high token-budget trigger and then summarizes whole
    // turns, so this content must survive byte-for-byte.
    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "Inspect the repository and finish the task." },
      { role: "assistant", content: "", tool_calls: [toolCall("call-old", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "a".repeat(50_000) }),
        tool_call_id: "call-old",
        name: "file_read",
      },
    ];
    const before = history.map((m) => m.content);
    const contextWindow = 100_000; // ratio stays far below the 0.85 trigger

    // pruneHistory only removes completed turns before the last user message,
    // so the oversized active-turn result survives untouched.
    __jait_capture(0, (await __testUtils.pruneHistory(history, contextWindow, [])));
    __jait_capture(1, (history.map((m) => m.content)), (before));
    __jait_capture(2, (history.some((m) => m.content.includes("compacted for context"))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1266_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "First task: refactor the pruning helper and keep it minimal." },
      { role: "assistant", content: "Working on it with a deterministic structured summary approach." },
      { role: "assistant", content: "", tool_calls: [toolCall("call-1", "file_read")] },
      {
        role: "tool",
        content: JSON.stringify({ ok: true, message: "Read packages/gateway/src/tools/agent-loop.ts" }),
        tool_call_id: "call-1",
        name: "file_read",
      },
      { role: "user", content: "now run the focused tests and report the results please" },
    ];

    await __testUtils.pruneHistory(history, 40, []);

    // Only one user turn should follow the summary: the substantive tail itself.
    const userTurns = history.filter((m) => m.role === "user");
    __jait_capture(0, (userTurns));
    __jait_capture(1, (history.at(-1)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1294_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: string[] = [];
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("retry-case", "terminal_exec"),
      sessionId: "session-1",
      maxRetries: 2,
      onEvent: (event) => events.push(event.type),
      executeTool: async () => ({ ok: false, message: "503 service unavailable" }),
    });

    __jait_capture(0, (result.result));
    __jait_capture(1, (result.executed.retryCount));
    __jait_capture(2, (events.filter((type) => type === "tool_retry")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1309_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    let calls = 0;
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("no-retry-case", "terminal_exec"),
      sessionId: "session-1",
      maxRetries: 2,
      executeTool: async () => {
        calls += 1;
        return { ok: false, message: "permission denied" };
      },
    });

    __jait_capture(0, (calls));
    __jait_capture(1, (result.executed.retryCount));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1327_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const events: AgentLoopEvent[] = [];
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("throwing-case", "file_read"),
      sessionId: "session-1",
      maxRetries: 0,
      onEvent: (event) => events.push(event),
      executeTool: async () => {
        throw new Error("ENOENT: no such file or directory");
      },
    });

    __jait_capture(0, (result.result.ok));
    __jait_capture(1, (result.result.message));
    // The model still receives a tool message for this call id.
    __jait_capture(2, (result.historyEntry));
    __jait_capture(3, (JSON.parse(result.historyEntry.content)));
    __jait_capture(4, (events.some((event) => event.type === "tool_result")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1347_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    let calls = 0;
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("throwing-transient", "file_read"),
      sessionId: "session-1",
      maxRetries: 2,
      executeTool: async () => {
        calls += 1;
        if (calls < 2) throw new Error("socket hang up");
        return { ok: true, message: "recovered" };
      },
    });

    __jait_capture(0, (calls));
    __jait_capture(1, (result.result));
    __jait_capture(2, (result.executed.retryCount));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1365_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("malformed-case", "file_read"),
      sessionId: "session-1",
      maxRetries: 0,
      // A plugin/MCP tool that resolves without a message field.
      executeTool: async () => ({ ok: true } as never),
    });

    __jait_capture(0, (result.result));
    __jait_thrown(1, () => JSON.parse(result.historyEntry.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1378_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const controller = new AbortController();
    let calls = 0;
    const started = Date.now();
    const result = await __testUtils.executeOneToolCall({
      tc: toolCall("abort-case", "file_read"),
      sessionId: "session-1",
      maxRetries: 3,
      signal: controller.signal,
      executeTool: async () => {
        calls += 1;
        controller.abort();
        return { ok: false, message: "request timeout" };
      },
    });

    __jait_capture(0, (calls));
    __jait_capture(1, (result.result));
    // Would have been ~500ms of un-abortable backoff before the fix.
    __jait_capture(2, (Date.now() - started));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1402_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const message of [
      "503 service unavailable",
      "Error: socket hang up",
      "request timed out after 30s",
      "connect ECONNREFUSED 127.0.0.1:11434",
      "429 Too Many Requests",
      "upstream model is temporarily unavailable",
      "rate-limited by provider",
      "502 Bad Gateway",
    ]) {
      __jait_capture(0, (__testUtils.isTransientFailure(message)));
    }
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1417_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const message of [
      "permission denied",
      "wrote 1429 bytes to disk",
      "assertion failed at line 5030",
      "the network topology diagram is missing a node",
      "exit code 1: 2 tests failed",
    ]) {
      __jait_capture(0, (__testUtils.isTransientFailure(message)));
    }
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1429_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const noise = `${"stdout line\n".repeat(400)}connection timeout`;
    __jait_capture(0, (__testUtils.isTransientFailure(noise)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1434_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (__testUtils.isTransientFailure(undefined)));
    __jait_capture(1, (__testUtils.isTransientFailure("")));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1441_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-a","type":"function","function":{"name":"file_read","arguments":"{}"}},{"index":1,"id":"call-b","type":"function","function":{"name":"web_search","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Look things up." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          { type: "function", function: { name: "file_read", description: "Read a file", parameters: { type: "object", properties: {} } } },
          { type: "function", function: { name: "web_search", description: "Search", parameters: { type: "object", properties: {} } } },
        ],
        hasTools: true,
        sessionId: "session-parallel-throw",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
        parallel: true,
        maxRetries: 0,
      },
      async (name) => {
        if (name === "web.search") throw new Error("provider exploded");
        return { ok: true, message: "file contents" };
      },
    );

    __jait_capture(0, (result.content));
    // Every tool_call gets exactly one tool message — the throw must not eat the sibling.
    const toolMessages = history.filter((message) => message.role === "tool");
    __jait_capture(1, (toolMessages.map((message) => message.tool_call_id).sort()));
    const byId = Object.fromEntries(
      result.executedToolCalls.map((executed) => [executed.callId, executed]),
    );
    __jait_capture(2, (byId["call-a"]));
    __jait_capture(3, (byId["call-b"]!.ok));
    __jait_capture(4, (byId["call-b"]!.message));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1511_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Deployment finished and verified."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Deploy and verify the change." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-empty-after-tool",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "Tool completed" }),
    );

    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.content));
    __jait_capture(2, (history.some((message) => message.role === "tool" && message.tool_call_id === "call-1")));
    __jait_capture(3, (history.at(-1)));
    __jait_capture(4, (history.some((message) =>
      message.role === "system" && message.content.includes("previous response ended without a final answer")
    )));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1582_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolResponse = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const emptyResponse = [
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of toolResponse) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }))
      .mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of emptyResponse) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }));
    const persist = vi.fn();
    let toolExecutions = 0;
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Finish the task." },
    ];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-empty-exhausted",
        abort: new AbortController(),
        maxRounds: 5,
        mode: "agent",
        onPersist: persist,
      },
      async () => {
        toolExecutions++;
        return { ok: true, message: "Tool completed" };
      },
    );

    __jait_capture(0, (fetchSpy.mock.calls));
    __jait_capture(1, (toolExecutions));
    // Instead of throwing (which left the turn stuck on a thinking bubble), the
    // loop now finishes with a persisted, user-visible answer.
    __jait_capture(2, (persist.mock.calls));
    __jait_capture(3, (persist.mock.calls[0]![0]));
    __jait_capture(4, (persist.mock.calls[0]![1]));
    __jait_capture(5, (persist.mock.calls[0]![2]));
    __jait_capture(6, (result.persisted));
    __jait_capture(7, (result.content));
    __jait_capture(8, (result.content));
    __jait_capture(9, (history.some((message) => message.role === "tool" && message.tool_call_id === "call-1")));
    // The fallback message is appended to history so the turn is not empty.
    __jait_capture(10, (history.at(-1)));
    __jait_capture(11, (String(history.at(-1)?.content)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1661_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const responses = [
      [
        'data: {"choices":[{"delta":{"content":"Initial answer."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":" Steered follow-up."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    const steering = new SteeringController();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Say hello." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-steer-final",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "agent",
        onEvent: (event) => {
          events.push(event);
          if (event.type === "token" && event.content === "Initial answer.") {
            steering.steer("Adjust the answer now");
          }
        },
      },
      async () => ({ ok: true, message: "" }),
      steering,
    );

    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.segments));
    // The steer arrived mid-response, so it is only injected at the round
    // boundary; the event is marked deferred and carries no queuedMessageId
    // because it was not submitted through the HTTP steer route.
    __jait_capture(3, (events));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1734_3_each0": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const timing = "before model call";

try {
await (async()=>{

    const notification = "[system-notification: background command finished]\nprivate command output";
    const steering = new SteeringController();
    if (timing === "before model call") steering.steer(notification, { hidden: true });
    const history: AgentMessage[] = [{ role: "user", content: "Verify the fix." }];
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      requests.push(String(init?.body));
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Verified."}}]}\n\n' +
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
          ));
          controller.close();
        },
      }), { status: 200 });
    });
    const events: AgentLoopEvent[] = [];
    const persisted = vi.fn();
    const result = await runAgentLoop({
      llm: { openaiApiKey: "test-key", openaiBaseUrl: "https://llm.test", openaiModel: "test-model", contextWindow: 100_000 },
      history, toolSchemas: [], hasTools: false, sessionId: "hidden-background-steering", abort: new AbortController(),
      maxRounds: 2, mode: "agent", onPersist: persisted,
      onEvent: event => {
        events.push(event);
        if (timing === "during final response" && event.type === "token" && requests.length === 1) {
          steering.steer(notification, { hidden: true });
        }
      },
    }, async () => ({ ok: true, message: "" }), steering);

    __jait_capture(0, (requests), (timing === "before model call" ? 1 : 2));
    __jait_capture(1, (requests.at(-1)));
    __jait_capture(2, (history.some(message => String(message.content).includes(notification))));
    __jait_capture(3, (result.segments?.some(segment => segment.type === "steering")));
    __jait_capture(4, (JSON.stringify(result)));
    __jait_capture(5, (JSON.stringify(persisted.mock.calls)));
    // The event is still emitted so trajectory/debug views can show it, but it is
    // flagged hidden so chat surfaces never render it.
    const steers = events.filter(event => event.type === "steering");
    __jait_capture(6, (steers.length));
    for (const steer of steers) __jait_capture(7, (steer));
  
})();

} finally {
await __jait_hook_1191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1734_3_each1": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const timing = "during final response";

try {
await (async()=>{

    const notification = "[system-notification: background command finished]\nprivate command output";
    const steering = new SteeringController();
    if (timing === "before model call") steering.steer(notification, { hidden: true });
    const history: AgentMessage[] = [{ role: "user", content: "Verify the fix." }];
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      requests.push(String(init?.body));
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Verified."}}]}\n\n' +
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n' +
            'data: [DONE]\n\n',
          ));
          controller.close();
        },
      }), { status: 200 });
    });
    const events: AgentLoopEvent[] = [];
    const persisted = vi.fn();
    const result = await runAgentLoop({
      llm: { openaiApiKey: "test-key", openaiBaseUrl: "https://llm.test", openaiModel: "test-model", contextWindow: 100_000 },
      history, toolSchemas: [], hasTools: false, sessionId: "hidden-background-steering", abort: new AbortController(),
      maxRounds: 2, mode: "agent", onPersist: persisted,
      onEvent: event => {
        events.push(event);
        if (timing === "during final response" && event.type === "token" && requests.length === 1) {
          steering.steer(notification, { hidden: true });
        }
      },
    }, async () => ({ ok: true, message: "" }), steering);

    __jait_capture(0, (requests), (timing === "before model call" ? 1 : 2));
    __jait_capture(1, (requests.at(-1)));
    __jait_capture(2, (history.some(message => String(message.content).includes(notification))));
    __jait_capture(3, (result.segments?.some(segment => segment.type === "steering")));
    __jait_capture(4, (JSON.stringify(result)));
    __jait_capture(5, (JSON.stringify(persisted.mock.calls)));
    // The event is still emitted so trajectory/debug views can show it, but it is
    // flagged hidden so chat surfaces never render it.
    const steers = events.filter(event => event.type === "steering");
    __jait_capture(6, (steers.length));
    for (const steer of steers) __jait_capture(7, (steer));
  
})();

} finally {
await __jait_hook_1191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1780_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }),
    );

    const persistCalls: Array<{ role: string; content: string }> = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Say hello." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-persist-1",
        abort: new AbortController(),
        maxRounds: 1,
        mode: "agent",
        onPersist: (_sid, role, content) => persistCalls.push({ role, content }),
      },
      async () => ({ ok: true, message: "" }),
    );

    __jait_capture(0, (result.content));
    __jait_capture(1, (result.persisted));
    __jait_capture(2, (persistCalls));
    __jait_capture(3, (persistCalls[0]));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1828_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const chunks = [
      'data: {"choices":[{"delta":{"content":"No specialists needed for this."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }),
    );
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Just say hi." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 1,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "unused" }),
    );

    __jait_capture(0, (fetchSpy.mock.calls));
    __jait_capture(1, (events[0]));
    __jait_capture(2, (result.content));
    __jait_capture(3, (result.executedToolCalls));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1874_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const responses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Implement the fix\\",\\"description\\":\\"Implementation Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call-2","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Verify the fix\\",\\"description\\":\\"Verification Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Swarm complete."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the broken mobile notification UI and verify it." },
        ],
        toolSchemas: [{
          type: "function",
          function: {
            name: "agent_spawn",
            description: "Spawn a sub-agent",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args) => {
        toolCalls.push({ name, args });
        return { ok: true, message: "Sub-agent completed", data: { content: "done" } };
      },
    );

    __jait_capture(0, (events[0]));
    __jait_capture(1, (toolCalls));
    __jait_capture(2, (toolCalls.every((call) => call.name === "agent.spawn")));
    __jait_capture(3, (result.content));
    __jait_capture(4, (result.executedToolCalls));
    for (const executed of result.executedToolCalls) {
      __jait_capture(5, (executed));
    }
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_1946_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"edit","arguments":"{\\"path\\":\\"src/a.ts\\",\\"content\\":\\"x\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
      'data: {"choices":[{"delta":{"content":"Delegating to Implementation Specialist."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const batch = chunks.slice(fetchCalls * 3, fetchCalls * 3 + 3);
      fetchCalls++;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of batch) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the bug." },
        ],
        toolSchemas: [{
          type: "function",
          function: {
            name: "edit",
            description: "Edit a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args) => {
        toolCalls.push({ name, args });
        return { ok: true, message: "unused" };
      },
    );

    // The edit tool must NOT have been executed by the coordinator.
    __jait_capture(0, (toolCalls));
    __jait_capture(1, (result.executedToolCalls));
    __jait_capture(2, (result.executedToolCalls[0]));
    __jait_capture(3, (result.executedToolCalls[0]!.message));
    __jait_capture(4, (result.executedToolCalls[0]!.message));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2012_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const concurrentResponses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Implement the fix\\",\\"description\\":\\"Implementation Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call-2","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Verify the fix\\",\\"description\\":\\"Verification Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Swarm complete."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = concurrentResponses[fetchCalls++] ?? concurrentResponses[concurrentResponses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const receivedArgs: Array<Record<string, unknown>> = [];

    await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the broken mobile notification UI and verify it." },
        ],
        toolSchemas: [{
          type: "function",
          function: {
            name: "agent_spawn",
            description: "Spawn a sub-agent",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
      },
      async (name, args) => {
        receivedArgs.push(args as Record<string, unknown>);
        return { ok: true, message: "Sub-agent completed", data: { content: "done" } };
      },
    );

    __jait_capture(0, (receivedArgs));
    const roundIds = receivedArgs.map((a) => a.__swarmRoundId);
    __jait_captureType(1, (roundIds[0]));
    __jait_capture(2, (roundIds[0]), (roundIds[1]));

    // A solo agent.spawn call (no sibling in the same batch) must not get a round id.
    let fetchCalls2 = 0;
    const soloResponses = [
      [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"Do it\\",\\"description\\":\\"Solo Specialist\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = soloResponses[fetchCalls2++] ?? soloResponses[soloResponses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const soloArgs: Array<Record<string, unknown>> = [];
    await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Do one thing." },
        ],
        toolSchemas: [{
          type: "function",
          function: {
            name: "agent_spawn",
            description: "Spawn a sub-agent",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-2",
        abort: new AbortController(),
        maxRounds: 2,
      },
      async (name, args) => {
        soloArgs.push(args as Record<string, unknown>);
        return { ok: true, message: "Sub-agent completed", data: { content: "done" } };
      },
    );

    __jait_capture(3, (soloArgs));
    __jait_captureType(4, (soloArgs[0]!.__swarmRoundId));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2138_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The orchestration allowlist lets the coordinator call "read" directly —
    // only mutating tools are blocked — so a coordinator that only reads and
    // never delegates stays technically "compliant" while doing none of the
    // team work Swarm mode promises. Reproduces the real incident where a
    // coordinator read files repeatedly and never once called agent.spawn.
    function readChunk(id: string, path: string): string {
      return `data: ${JSON.stringify({
        choices: [{ delta: { tool_calls: [{ index: 0, id, type: "function", function: { name: "read", arguments: JSON.stringify({ path }) } }] } }],
      })}\n\n`;
    }
    const finishToolCalls = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n';
    const done = "data: [DONE]\n\n";

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls <= 7) {
        const chunks = [readChunk(`call-${fetchCalls}`, `file-${fetchCalls}.ts`), finishToolCalls, done];
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }), { status: 200 });
      }
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Investigation done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        done,
      ];
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Investigate playback errors across the codebase." },
    ];
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          {
            type: "function",
            function: { name: "read", description: "Read", parameters: { type: "object", properties: { path: { type: "string" } } } },
          },
          {
            type: "function",
            function: { name: "agent_spawn", description: "Spawn a sub-agent", parameters: { type: "object", properties: {} } },
          },
        ],
        hasTools: true,
        sessionId: "session-undelegated-reads",
        abort: new AbortController(),
        maxRounds: 10,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "read ok" }),
    );

    __jait_capture(0, (result.content));
    // A forced-delegation nudge landed in history once the coordinator crossed
    // the undelegated-read threshold, and was surfaced as a steering event.
    __jait_capture(1, (history.some((m) => m.role === "system" && /without delegating any work/.test(String(m.content)))));
    __jait_capture(2, (events.some((e) => e.type === "steering" && /hasn't delegated/.test(e.message ?? ""))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2240_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }

try {
await (async()=>{

    const truncated = [
      'data: {"choices":[{"delta":{"content":"Part one"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    const completed = [
      'data: {"choices":[{"delta":{"content":" and part two."}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(sseResponse(truncated))
      .mockResolvedValueOnce(sseResponse(completed));

    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "gpt-5",
          contextWindow: 400_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Write something long." },
        ],
        toolSchemas: [],
        hasTools: false,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 5,
        onEvent: (event) => events.push(event),
      },
      async () => ({ ok: true, message: "ok" }),
    );

    // Two calls: the truncated one, then the continuation.
    __jait_capture(0, (fetchSpy.mock.calls));
    // Final content is the seamless concatenation of both rounds.
    __jait_capture(1, (result.content));
    // A steering event signals the continuation to the user/UI.
    __jait_capture(2, (events.some(
        (e) => e.type === "steering" && /output token limit/i.test(e.message),
      )));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2389_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    let sawQuarantinedRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const toolNames = new Set((body.tools ?? []).map((tool) => tool.function?.name));
      const round = fetchCalls++;
      if (!toolNames.has("file_read") || !toolNames.has("file_write")) {
        sawQuarantinedRound = true;
        return textResponse("Recovered from the ping-pong loop.");
      }
      const name = round % 2 === 0 ? "file_read" : "file_write";
      return toolCallSSE(`call-${round}`, name, {});
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Iterate until done." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "file_read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "file_write",
              description: "Write",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-ping-pong",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
        onEvent: () => {},
      },
      async () => ({ ok: true, message: "ok" }),
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (fetchCalls));
    __jait_capture(2, (result.content));
    __jait_capture(3, (result.content));
    __jait_capture(4, (sawQuarantinedRound));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2454_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Mirrors the observed loop: `search` failed with the same message every
    // time (ripgrep missing + an unusable root), and the model kept retrying it
    // interleaved with other calls, so neither the round-signature streak nor
    // the 6-per-turn counter stopped it.
    let executions = 0;
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      if (round > 12) return textResponse("Giving up on search.");
      // Vary the surrounding calls so the whole-round signature never repeats.
      return toolCallsSSE([
        { id: `search-${round}`, name: "search", args: { pattern: "x", path: "apps/web/src" } },
        { id: `read-${round}`, name: "file_read", args: { path: `file-${round % 3}` } },
      ]);
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Find it." },
    ];
    await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          {
            type: "function",
            function: { name: "search", description: "Search", parameters: { type: "object", properties: {} } },
          },
          {
            type: "function",
            function: { name: "file_read", description: "Read", parameters: { type: "object", properties: {} } },
          },
        ],
        hasTools: true,
        sessionId: "session-repeated-failure",
        abort: new AbortController(),
        maxRounds: 20,
        mode: "agent",
      },
      async (name) => {
        if (name === "search") {
          executions++;
          return { ok: false, message: "ripgrep is unavailable and Git is required for a privacy-safe fallback search." };
        }
        return { ok: true, message: "ok" };
      },
    );

    // Two identical failures are enough evidence; the third attempt is skipped.
    __jait_capture(0, (executions));
    const steer = history.filter(
      (entry) => entry.role === "system" && String(entry.content).includes("kept failing with the same error"),
    );
    __jait_capture(1, (steer.length));
    // The model is told what actually broke, not "you already have that result".
    __jait_capture(2, (String(steer[0]?.content)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2519_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // The per-turn counter is zeroed by each intervention, which handed the
    // model a fresh budget every cycle — one call was seen 17 times in a single
    // turn. The lifetime cap is what terminates that.
    let executions = 0;
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      if (round > 60) return textResponse("Done.");
      return toolCallsSSE([
        { id: `alpha-${round}`, name: "alpha", args: { path: "same-file.ts" } },
        // Rotating companion call keeps the whole-round signature changing, so
        // the consecutive-streak guard never fires.
        { id: `beta-${round}`, name: "beta", args: { pattern: `p-${round % 5}` } },
      ]);
    });

    await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Go." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: { name: "alpha", description: "Alpha", parameters: { type: "object", properties: {} } },
          },
          {
            type: "function",
            function: { name: "beta", description: "Beta", parameters: { type: "object", properties: {} } },
          },
        ],
        hasTools: true,
        sessionId: "session-lifetime-cap",
        abort: new AbortController(),
        maxRounds: 60,
        mode: "agent",
      },
      async (name) => {
        if (name === "alpha") executions++;
        return { ok: true, message: "ok" };
      },
    );

    __jait_capture(0, (executions));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2573_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    const calls = ["file_read", "file_write"];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < calls.length) {
        const name = calls[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, name, {});
        callIdx++;
        return response;
      }
      return textResponse("All done.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Go." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "file_read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "file_write",
              description: "Write",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-no-cap-data-driven",
        abort: new AbortController(),
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    __jait_capture(0, (result.hitMaxRounds));
    // Ran both scripted tool rounds, then the model's final answer ended it.
    __jait_capture(1, (callIdx));
    __jait_capture(2, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2630_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Model reads four different files in a row (different args) then answers.
    const reads = ["file-a", "file-b", "file-c", "file-d"];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < reads.length) {
        const file = reads[callIdx];
        const response = toolCallSSE(`call-${callIdx + 1}`, "file_read", { path: file });
        callIdx++;
        return response;
      }
      return textResponse("Read all files.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Read all four files." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "file_read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-multi-read",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2680_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    const ranges: Array<[number, number]> = [
      [1, 200],
      [50, 60], [55, 62], [52, 58], [51, 61], [53, 59], [50, 60], [54, 60],
      [56, 61], [50, 59], [52, 60], [55, 60], [51, 58], [53, 61], [50, 62],
    ];
    let callIdx = 0;
    let sawQuarantinedRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      if (!readAvailable) {
        sawQuarantinedRound = true;
        return textResponse("Recovered after the redundant reads were blocked.");
      }
      if (callIdx < ranges.length) {
        const [startLine, endLine] = ranges[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, "read", { path: "big.ts", startLine, endLine });
        callIdx++;
        return response;
      }
      return textResponse("Guard failed to detect the loop.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Find the thing in big.ts." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-narrow-read",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async (name, args) => {
        if (name === "read") {
          const { startLine, endLine } = args as { startLine: number; endLine: number };
          return { ok: true, message: "read ok", data: { startLine, endLine } };
        }
        return { ok: true, message: "ok" };
      },
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (sawQuarantinedRound));
    __jait_capture(2, (callIdx), (ranges.length));
    __jait_capture(3, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2749_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Mirrors a real incident: an agent verifying which of two byte-identical
    // code blocks an edit landed in re-read the same file 7 times (1 broad +
    // 6 narrow) and was cut off before it could finish. With the behavioral
    // guardrails removed (pi-style), this runs to completion untouched.
    const ranges: Array<[number, number]> = [
      [1, 613], // broad first read
      [300, 360], [335, 349], [140, 160], [154, 163], [335, 350], [336, 351],
    ];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < ranges.length) {
        const [startLine, endLine] = ranges[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, "read", { path: "app-header.tsx", startLine, endLine });
        callIdx++;
        return response;
      }
      return textResponse("Verified both handlers are patched.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the manager-mode switch and verify both handlers." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-defensive-reread",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async (name, args) => {
        if (name === "read") {
          const { startLine, endLine } = args as { startLine: number; endLine: number };
          return { ok: true, message: "read ok", data: { startLine, endLine } };
        }
        return { ok: true, message: "ok" };
      },
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (callIdx), (ranges.length));
    __jait_capture(2, (result.content));
    __jait_capture(3, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2812_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Each read covers a fresh, non-overlapping chunk of the same file —
    // genuine progress, must not be mistaken for narrow-read thrash.
    const ranges: Array<[number, number]> = [[1, 100], [101, 200], [201, 300], [301, 400]];
    let callIdx = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (callIdx < ranges.length) {
        const [startLine, endLine] = ranges[callIdx]!;
        const response = toolCallSSE(`call-${callIdx + 1}`, "read", { path: "big.ts", startLine, endLine });
        callIdx++;
        return response;
      }
      return textResponse("Read the whole file.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Read all of big.ts." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-growing-read",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async (name, args) => {
        if (name === "read") {
          const { startLine, endLine } = args as { startLine: number; endLine: number };
          return { ok: true, message: "read ok", data: { startLine, endLine } };
        }
        return { ok: true, message: "ok" };
      },
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (callIdx), (ranges.length));
    __jait_capture(2, (result.content));
    __jait_capture(3, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2870_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Reproduces the stuck chat: the provider keeps requesting the exact same
    // read even after the loop guard redirects it. Recovery must not execute
    // that read again or end the turn.
    let fetchCalls = 0;
    let sawQuarantinedRound = false;
    let sawRestoredRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      const round = fetchCalls++;

      if (round < 5) {
        return toolCallSSE(`call-stuck-${round}`, "read", {
          path: "server.js",
          startLine: 1600,
          endLine: 1944,
        });
      }
      if (round === 5) {
        sawQuarantinedRound = !readAvailable;
        return toolCallSSE("call-search", "search", { pattern: "approval_required" });
      }
      sawRestoredRound = readAvailable;
      return textResponse("Recovered with a different approach.");
    });

    const executedTools: string[] = [];
    let repeatedReadExecutedAfterRedirect = false;
    const events: AgentLoopEvent[] = [];

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Investigate server.js." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: { pattern: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-stuck-loop",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async (name) => {
        if (
          name === "read" &&
          events.some((event) => event.type === "steering" && /repeated tool call/.test(event.message ?? ""))
        ) {
          repeatedReadExecutedAfterRedirect = true;
        }
        executedTools.push(name);
        return { ok: true, message: `${name} ok` };
      },
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.content));
    __jait_capture(3, (repeatedReadExecutedAfterRedirect));
    __jait_capture(4, (executedTools));
    __jait_capture(5, (sawQuarantinedRound));
    __jait_capture(6, (sawRestoredRound));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_2961_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    let quarantinedRounds = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      const round = fetchCalls++;
      const args = { path: "tool-call-card.tsx", startLine: 3490, endLine: 3560 };
      if (readAvailable) return toolCallSSE(`call-read-${round}`, "read", args);

      quarantinedRounds++;
      if (quarantinedRounds > 1) {
        return textResponse("Recovered after the unavailable call was rejected.");
      }
      return toolCallWithContentSSE(
        `call-forbidden-read-${round}`,
        "read",
        args,
        "rth</｜DSML｜tool_calls>",
      );
    });

    let executedReads = 0;
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "deepseek-v4-flash:0731-cloud",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the tool card stacking issue." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: { path: { type: "string" } } },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-provider-ignores-quarantine",
        abort: new AbortController(),
        maxRounds: 20,
        mode: "agent",
      },
      async () => {
        executedReads++;
        return { ok: true, message: "read ok" };
      },
    );

    __jait_capture(0, (quarantinedRounds));
    __jait_capture(1, (fetchCalls));
    __jait_capture(2, (executedReads));
    __jait_capture(3, (result.hitMaxRounds));
    __jait_capture(4, (result.content));
    __jait_capture(5, (result.content));
    __jait_capture(6, (result.content));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3029_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Regression for the deepseek-v4-flash degeneration (2026-08-16): the model
    // re-emitted the exact same reasoning block and the exact same (quarantined)
    // tool call on every round. No guard fired because the thinking repeat was
    // *across* rounds (tool groups sit between the thinking segments, so
    // isVerbatimThinkingRepeat never sees them back-to-back) and there was a
    // tool call each round (so the empty-response recovery never ran). The turn
    // burned all 14 rounds and persisted a wall of "cripplenope...nope" garbage.
    const THINKING = [
      "The user is describing a chat streaming issue. They mention \"after updating chat\" they got ",
      "loading stuckness again, and it didn't stream in new tool cards and content. They thought since ",
      "they made their SSH connection the same as DeepSeek Harness, it worked pretty good, so they ",
      "expected it to now be fixed. This is a Jait project. The user is talking about the Jait chat app ",
      "itself. Let me understand the context better.\n",
    ].join("");
    let fetchCalls = 0;
    let executedExecutes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      // Every round: identical thinking + identical (already-rejected) call.
      const thinkingPayload = JSON.stringify({ choices: [{ delta: { reasoning_content: THINKING } }] });
      const toolPayload = JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: `call-exec-${round}`,
                  type: "function",
                  function: {
                    name: "execute",
                    arguments: JSON.stringify({ command: "cd /home/jakob/jait && git log --oneline -30", explanation: "Check git history" }),
                  },
                },
              ],
            },
          },
        ],
      });
      const finish = JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] });
      return sseResponse([
        `data: ${thinkingPayload}\n\n`,
        `data: ${toolPayload}\n\n`,
        `data: ${finish}\n\n`,
        "data: [DONE]\n\n",
      ]);
    });

    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "deepseek-v4-flash:0731-cloud",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the chat streaming issue." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "execute",
              description: "Run a shell command",
              parameters: {
                type: "object",
                properties: { command: { type: "string" }, explanation: { type: "string" } },
              },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-replayed-thinking-loop",
        abort: new AbortController(),
        maxRounds: 12,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => {
        executedExecutes++;
        // Simulate the quarantine: the call keeps failing identically.
        return { ok: false, message: "Provider repeated an unavailable tool call (execute); rejected it" };
      },
    );

    // It must not stop on the first violation: it steers once, gives the model
    // a couple more rounds, and then falls back to stopping — never burning the
    // whole 12-round budget on the same reasoning + same rejected call.
    __jait_capture(0, (result.rounds));
    __jait_capture(1, (result.rounds));
    // The call returns an identical failure every round, so the identical-failure
    // cap (MAX_IDENTICAL_FAILURES_PER_CALL=2) limits actual executions to 2. The
    // point is the turn was not stopped after the very first round.
    __jait_capture(2, (executedExecutes));
    __jait_capture(3, (executedExecutes));
    // The persisted content must not be the degenerate wall.
    __jait_capture(4, (result.content));
    __jait_capture(5, (result.content));
    // And a steering event should explain the stop.
    __jait_capture(6, (events.some(
        (event) =>
          event.type === "steering" &&
          /repeating the same reasoning/i.test(event.message ?? ""),
      )));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3141_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // A provider that replays the same reasoning + same tool call for a few
    // rounds is steered back on track (the turn continues), and if it then
    // answers the turn completes normally. Stopping should be the backstop,
    // not the first response.
    const THINKING = [
      "The user is describing a chat streaming issue. They mention \\\"after updating chat\\\" they got ",
      "loading stuckness again. This is a Jait project.\\n",
    ].join("");
    let fetchCalls = 0;
    let executedExecutes = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      if (fetchCalls <= 4) {
        const thinkingPayload = JSON.stringify({ choices: [{ delta: { reasoning_content: THINKING } }] });
        const toolPayload = JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: `call-exec-${round}`,
                    type: "function",
                    function: {
                      name: "execute",
                      arguments: JSON.stringify({ command: "git status", explanation: "Check state" }),
                    },
                  },
                ],
              },
            },
          ],
        });
        const finish = JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] });
        return sseResponse([
          `data: ${thinkingPayload}\n\n`,
          `data: ${toolPayload}\n\n`,
          `data: ${finish}\n\n`,
          "data: [DONE]\n\n",
        ]);
      }
      return textResponse("Fixed the streaming issue by reverting the change.");
    });

    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "deepseek-v4-flash:0731-cloud",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Fix the chat streaming issue." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "execute",
              description: "Run a shell command",
              parameters: {
                type: "object",
                properties: { command: { type: "string" }, explanation: { type: "string" } },
              },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-replayed-thinking-recovered",
        abort: new AbortController(),
        maxRounds: 12,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => {
        executedExecutes++;
        return { ok: false, message: "Provider repeated an unavailable tool call (execute); rejected it" };
      },
    );

    // It was steered (not stopped) once, and the model then recovered with a
    // final answer instead of the turn being killed. The steer message says the
    // model *repeated* the same reasoning — distinct from the backstop message,
    // which says it kept *repeating* even after being steered.
    __jait_capture(0, (events.some(
        (event) =>
          event.type === "steering" &&
          /repeated the same reasoning/i.test(event.message ?? ""),
      )));
    // Steering must hand control back, never kill the turn: no "Stopped" event.
    __jait_capture(1, (events.some(
        (event) =>
          event.type === "steering" && /^Stopped:/i.test(event.message ?? ""),
      )));
    __jait_capture(2, (executedExecutes));
    __jait_capture(3, (result.content));
    __jait_capture(4, (result.rounds));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3248_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 1) {
        return toolCallsSSE(
          Array.from({ length: 20 }, (_, index) => ({
            id: `call-batch-${index}`,
            name: "read",
            args: { path: "chat-queue.test.ts", startLine: 100, endLine: 260 },
          })),
        );
      }
      return textResponse("Done.");
    });

    let executedCount = 0;
    const events: AgentLoopEvent[] = [];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Inspect the queue test." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-duplicate-batch",
        abort: new AbortController(),
        maxRounds: 10,
        mode: "agent",
        onEvent: (event) => events.push(event),
      },
      async () => {
        executedCount++;
        return { ok: true, message: "read ok" };
      },
    );

    __jait_capture(0, (result.content));
    __jait_capture(1, (executedCount));
    __jait_capture(2, (result.executedToolCalls));
    __jait_capture(3, (events.some((event) => event.type === "steering" && /duplicate tool calls/i.test(event.message ?? ""))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3307_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    let sawQuarantinedRound = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tools?: Array<{ function?: { name?: string } }>;
      };
      const readAvailable = (body.tools ?? []).some((tool) => tool.function?.name === "read");
      const round = fetchCalls++;
      if (!readAvailable) {
        sawQuarantinedRound = true;
        return textResponse("Recovered from the changing batch loop.");
      }
      return toolCallsSSE([
        {
          id: `call-repeated-${round}`,
          name: "read",
          args: { path: "message-queue.tsx", startLine: 139, endLine: 499 },
        },
        {
          id: `call-changing-${round}`,
          name: "search",
          args: { pattern: `queue-${round}` },
        },
      ]);
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Inspect the queue implementation." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-changing-batch-loop",
        abort: new AbortController(),
        maxRounds: 40,
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.hitMaxRounds));
    __jait_capture(2, (result.content));
    __jait_capture(3, (result.content));
    __jait_capture(4, (sawQuarantinedRound));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3380_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Keep searching." },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      if (round < 80) {
        return toolCallSSE(`call-${round}`, "search", { pattern: `unique-${round}` });
      }
      return textResponse("Finished too late.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-default-round-backstop",
        abort: new AbortController(),
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.content));
    __jait_capture(3, (fetchCalls));
    __jait_capture(4, (history.some((message) =>
      message.role === "system" &&
      typeof message.content === "string" &&
      message.content.includes("[AUTONOMOUS CHECKPOINT]")
    )));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3432_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    let preservedRecentEvidence = false;
    let maxCompletedToolRounds = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: AgentMessage[] };
      preservedRecentEvidence ||= (body.messages ?? []).some(
        (message) => message.role === "system" &&
          message.content.includes("[active-turn-summary]") &&
          message.content.includes("evidence:unique-"),
      );
      const compacted = (body.messages ?? []).some(
        (message) => message.role === "system" && message.content.includes("[active-turn-summary]"),
      );
      maxCompletedToolRounds = Math.max(
        maxCompletedToolRounds,
        (body.messages ?? []).filter(
          (message) => message.role === "assistant" && message.tool_calls?.length,
        ).length,
      );
      const round = fetchCalls++;

      if (round < 10) {
        return toolCallSSE(`call-${round}`, "search", { pattern: `unique-${round}` });
      }
      // Keep pushing until the active turn has actually been collapsed. Gating
      // on a specific surviving round count instead would silently encode
      // ACTIVE_TURN_TOOL_ROUNDS_TO_KEEP, and the run would never terminate if
      // that window were ever widened.
      if (!compacted) {
        return toolCallSSE(`call-stuck-${round}`, "execute", { command: "check the same logs" });
      }
      return textResponse("Recovered from the long investigation.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 4_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Investigate until you can explain the failure." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "execute",
              description: "Execute",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-active-turn-compaction",
        abort: new AbortController(),
        maxRounds: 40,
        continuous: true,
        mode: "agent",
      },
      async (name, args) => ({
        ok: true,
        message: name === "execute" ? "no matching logs" : "search complete",
        data: name === "search"
          ? { output: `evidence:${(args as { pattern: string }).pattern} ${"x".repeat(2_000)}` }
          : { output: "" },
      }),
    );

    __jait_capture(0, (result.content));
    __jait_capture(1, (result.content));
    __jait_capture(2, (preservedRecentEvidence));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3518_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Observed in a real session: across a long investigation the model re-read
    // the same file every few rounds. Each read's result was summarised away by
    // active-turn compaction long before the next read, so the model was never
    // circling content it could still see — yet the per-turn duplicate counter
    // kept the old occurrences, hit its limit, and answered the read with
    // "Skipped repeated tool call (read); temporarily quarantining read".
    // Repeating a call whose earlier result is no longer in the window is a
    // re-read, not a loop.
    let executedReads = 0;
    let fetchCalls = 0;
    const events: Array<{ type: string; message?: string; pruned?: boolean }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      if (round % 10 === 0 && round <= 50) {
        return toolCallSSE(`read-${round}`, "read", { path: "big.ts" });
      }
      if (round > 50) return textResponse("Done.");
      // Distinct filler calls so the *filler* never trips the duplicate guard —
      // only the read repeats, and it repeats with an identical signature.
      return toolCallSSE(`search-${round}`, "search", { pattern: `filler-${round}` });
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 4_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Keep reading big.ts until you can explain it." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read a file",
              parameters: { type: "object", properties: {} },
            },
          },
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-compacted-reread",
        abort: new AbortController(),
        maxRounds: 60,
        continuous: true,
        mode: "agent",
        onEvent: (event) => {
          events.push(event as { type: string; message?: string; pruned?: boolean });
        },
      },
      async (name) => {
        if (name === "read") {
          executedReads++;
          return {
            ok: true,
            message: "read complete",
            data: { output: `contents ${"x".repeat(2_000)}` },
          };
        }
        return {
          ok: true,
          message: "search complete",
          data: { output: `filler ${"y".repeat(2_000)}` },
        };
      },
    );

    // Compaction must actually have run, otherwise the test proves nothing.
    __jait_capture(0, (events.some((event) => event.type === "context_usage" && event.pruned)));
    __jait_capture(1, (result.content));
    __jait_capture(2, (executedReads));
    __jait_capture(3, (events.some(
        (event) =>
          event.type === "steering" && /Skipped repeated tool call/i.test(event.message ?? ""),
      )));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3610_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // This usage band (~60-65% of the window) is exactly where the old scheme
    // fired: it truncated older tool results into head/tail stubs. Codex-style
    // compaction keeps everything verbatim until the 0.85 trigger, so none of
    // the request bodies may contain truncation markers or summaries.
    const bodies: Array<{ messages?: AgentMessage[] }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: AgentMessage[] };
      bodies.push(body);
      const round = bodies.length - 1;
      if (round < 8) {
        return toolCallSSE(`call-${round}`, "read", { path: `file-${round}.ts` });
      }
      return textResponse("Done.");
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 10_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Read the files and finish the task." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read a file",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-verbatim-context",
        abort: new AbortController(),
        maxRounds: 10,
        continuous: true,
        mode: "agent",
      },
      async (name, args) => {
        const contents = "x".repeat(3_000);
        return {
          ok: true,
          message: `contents of ${(args as { path: string }).path} ${contents}`,
          data: { path: (args as { path: string }).path },
        };
      },
    );

    __jait_capture(0, (result.content));
    __jait_capture(1, (bodies.length));
    for (const body of bodies) {
      const content = JSON.stringify(body.messages ?? []);
      __jait_capture(2, (content));
      __jait_capture(3, (content));
      __jait_capture(4, (content));
    }
    // The final request still carries every read result byte-for-byte.
    const lastBody = bodies[bodies.length - 1]!;
    const readResults = (lastBody.messages ?? []).filter((m) => m.role === "tool");
    __jait_capture(5, (readResults)); // all 8 reads survive, none pruned
    for (let i = 0; i < 8; i++) {
      __jait_capture(6, (JSON.stringify(readResults[i]!.content)), (`file-${i}.ts`));
    }
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3682_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const round = fetchCalls++;
      return toolCallSSE(`call-${round}`, "search", { pattern: `unique-${round}` });
    });

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "Search within this bounded specialist run." },
        ],
        toolSchemas: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        hasTools: true,
        sessionId: "session-explicit-round-budget",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "agent",
      },
      async () => ({ ok: true, message: "ok" }),
    );

    __jait_capture(0, (result.hitMaxRounds));
    __jait_capture(1, (result.content));
    __jait_capture(2, (fetchCalls));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3725_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Filler that is long but not a verbatim loop — `"x".repeat(5000)` would
    // (correctly) trip the runaway-repetition guard instead of exercising the cap.
    const longThinking = Array.from(
      { length: 250 },
      (_, step) => `Step ${step}: inspect branch ${step % 7} of the call graph.`,
    ).join(" ");
    const responses = [
      [
        `data: {"choices":[{"delta":{"content":"<thinking>${longThinking}</thinking>"}}]}\n\n`,
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Do the task." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-thinking-cap",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "Tool completed" }),
    );

    __jait_capture(0, (result.content));
    const assistantWithTools = history.find((m) => m.role === "assistant" && m.tool_calls);
    __jait_captureType(1, (assistantWithTools?.thinking));
    // 1 ellipsis + 4000 tail chars — capped, not the full reasoning block.
    __jait_capture(2, (longThinking.length));
    __jait_capture(3, (assistantWithTools!.thinking!.length));
    // The tail is preserved (reasoning continuity), not the head.
    __jait_capture(4, (assistantWithTools!.thinking!.endsWith(longThinking.slice(-4_000))));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3797_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    const reasoning = "Continue from the partial response without repeating it.";
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning, content: "Partial " } }] })}\n\n`,
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
        "data: [DONE]\n\n",
      ]))
      .mockResolvedValueOnce(textResponse("answer."));
    await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "deepseek-v4.1-flash", contextWindow: 100_000 },
      history: [{ role: "system", content: "system" }, { role: "user", content: "Task" }],
      toolSchemas: [], hasTools: true, sessionId: "length-replay", abort: new AbortController(), maxRounds: 4, mode: "agent",
    }, async () => ({ ok: true, message: "unused" }));
    const sent = JSON.parse((fetch.mock.calls[1]![1] as RequestInit).body as string);
    __jait_capture(0, (sent.messages.find((m: any) => m.role === "assistant")?.reasoning_content), (reasoning));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3815_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Filler that is long but not a verbatim loop — `"x".repeat(5000)` would
    // (correctly) trip the runaway-repetition guard instead of exercising the cap.
    const longThinking = Array.from(
      { length: 250 },
      (_, step) => `Step ${step}: inspect branch ${step % 7} of the call graph.`,
    ).join(" ");
    const responses = [
      [
        `data: {"choices":[{"delta":{"content":"<thinking>${longThinking}</thinking>"}}]}\n\n`,
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Done."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Do the task." },
    ];
    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "deepseek-v4.1-flash",
          contextWindow: 100_000,
        },
        history,
        toolSchemas: [{
          type: "function",
          function: {
            name: "file_read",
            description: "Read a file",
            parameters: { type: "object", properties: {} },
          },
        }],
        hasTools: true,
        sessionId: "session-thinking-cap",
        abort: new AbortController(),
        maxRounds: 4,
        mode: "agent",
      },
      async () => ({ ok: true, message: "Tool completed" }),
    );

    __jait_capture(0, (result.content));
    const assistantWithTools = history.find((m) => m.role === "assistant" && m.tool_calls);
    __jait_captureType(1, (assistantWithTools?.thinking));
    __jait_capture(2, (longThinking.length));
    __jait_capture(3, (assistantWithTools!.thinking), (longThinking));
    const sent = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[1]![1] as RequestInit).body as string);
    __jait_capture(4, (sent.messages.find((m: any) => m.tool_calls)?.reasoning_content), (longThinking));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3886_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // A thinking-only response has no visible text and no tool call, so it hits
    // empty-response recovery. Before the fix that recovery re-issued a
    // byte-identical request, the provider reproduced the same reasoning, and
    // each copy was concatenated onto the same thinking segment — the user saw
    // the model repeat itself two or three times inside one block.
    const thinking =
      "The user says the spiral happened in the thinking block. Let me look at the thinking content of the big spiral message and work out what produced it.";
    const thinkingOnly = [
      `data: {"choices":[{"delta":{"content":"<thinking>${thinking}</thinking>"}}]}\n\n`,
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCalls++;
      if (fetchCalls === 3) {
        return textResponse("Recovered after the repeated reasoning was rejected.");
      }
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of thinkingOnly) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const events: AgentLoopEvent[] = [];
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Why did it spiral?" },
    ];
    const result = await runAgentLoop({
      llm: {
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      },
      history,
      toolSchemas: [],
      hasTools: false,
      sessionId: "session-thinking-replay",
      abort: new AbortController(),
      maxRounds: 6,
      mode: "agent",
      onEvent: (e) => events.push(e),
    });

    __jait_capture(0, (fetchCalls));
    __jait_capture(1, (result.content));
    __jait_capture(2, (result.content));
    __jait_capture(3, (events.some((e) => e.type === "steering" && /repeated the same reasoning/i.test(e.message ?? ""))));

    // The reasoning is recorded once, not glued to itself.
    const thinkingSegments = result.segments.filter((s) => s.type === "thinking");
    __jait_capture(4, (thinkingSegments));
    __jait_capture(5, (thinkingSegments[0]!.content.split(thinking).length - 1));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_3947_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    // Some cloud model servers stream elapsed-time progress (e.g. "25.0s") into
    // the reasoning channel. When that is all a round delivers, retrying just
    // replays the identical heartbeat and the turn is left stuck on an empty
    // thinking bubble. The loop must short-circuit to a graceful, persisted
    // fallback answer instead of looping or throwing.
    const timingNoiseOnly = [
      'data: {"choices":[{"delta":{"content":"<thinking>25.0s</thinking>"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of timingNoiseOnly) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 }),
    );
    const persist = vi.fn();
    const events: AgentLoopEvent[] = [];
    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Run the checks." },
    ];

    const result = await runAgentLoop({
      llm: {
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      },
      history,
      toolSchemas: [],
      hasTools: false,
      sessionId: "session-timing-noise",
      abort: new AbortController(),
      maxRounds: 6,
      mode: "agent",
      onEvent: (e) => events.push(e),
      onPersist: persist,
    });

    // Short-circuited: the single heartbeat is not retried or re-streamed.
    __jait_capture(0, (fetchSpy.mock.calls));
    // A real, user-visible answer was emitted and persisted.
    __jait_capture(1, (result.persisted));
    __jait_capture(2, (result.content));
    __jait_capture(3, (persist.mock.calls));
    __jait_capture(4, (persist.mock.calls[0]![1]));
    __jait_capture(5, (persist.mock.calls[0]![2]));
    // A token event streamed the fallback so the UI shows text, not a bare bubble.
    __jait_capture(6, (events.some((e) => e.type === "token" && (e as { content: string }).content)));
    // The turn ends with a persisted assistant message in history.
    __jait_capture(7, (history.at(-1)));
    __jait_capture(8, (String(history.at(-1)?.content)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4007_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }

try {
await (async()=>{

    const firstThinking =
      "I need to decide how to answer this. Let me weigh the options carefully before writing anything down for the user.";
    const responses = [
      [
        `data: {"choices":[{"delta":{"content":"<thinking>${firstThinking}</thinking>"}}]}\n\n`,
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"Here is the answer."}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    const bodies: string[] = [];
    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(String((init as RequestInit).body));
      const chunks = responses[fetchCalls++] ?? responses[responses.length - 1]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const history: AgentMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: "Answer me." },
    ];
    const result = await runAgentLoop({
      llm: {
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      },
      history,
      toolSchemas: [],
      hasTools: false,
      sessionId: "session-thinking-recovery",
      abort: new AbortController(),
      maxRounds: 6,
      mode: "agent",
    });

    __jait_capture(0, (result.content));
    // The retry payload carries the reasoning that produced no answer, so it is
    // not a byte-identical replay of the attempt that just failed.
    __jait_capture(1, (bodies));
    __jait_capture(2, (bodies[1]), (firstThinking));
    __jait_capture(3, (bodies[1]), (bodies[0]));
    __jait_capture(4, (bodies[1]));
    // Recorded as a real assistant turn, so it survives recovery-prompt cleanup.
    __jait_capture(5, (history.some((m) => m.role === "assistant" && m.content === "" && m.thinking === firstThinking)));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4119_5": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
/*__jait_scope_open__*/{
function investigateForever(sessionId: string, systemOne = false) {
      let fetchCalls = 0;
      let sawToolFreeRound = false;
      const history: AgentMessage[] = [
        { role: "system", content: "system" },
        { role: "user", content: "Find out why the build is slow." },
      ];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        if (String(_input).includes("api.typesafe.ai")) return new Response(JSON.stringify({ model: "jev-latest", answers: { recovery: { type: "choice", choice: "act", confidence: 0.95 } } }));
        const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
        if (!body.tools || body.tools.length === 0) {
          sawToolFreeRound = true;
          return textResponse("Here is what I found.");
        }
        const round = fetchCalls++;
        return toolCallSSE(`call-${round}`, "read", { path: `file-${round}.ts` });
      });

      const run = runAgentLoop(
        {
          llm: {
            openaiApiKey: "test-key",
            openaiBaseUrl: "https://llm.test",
            openaiModel: "test-model",
            contextWindow: 100_000,
          },
          history,
          toolSchemas: [
            {
              type: "function",
              function: {
                name: "read",
                description: "Read a file",
                parameters: { type: "object", properties: { path: { type: "string" } } },
              },
            },
          ],
          hasTools: true,
          sessionId,
          abort: new AbortController(),
          maxRounds: 80,
          auth: systemOne ? { apiKeys: { JEV_API_KEY: "recovery-assessment-test" } } : undefined,
          mode: "agent",
        },
        async () => ({ ok: true, message: "file contents" }),
      );

      return { run, history, sawToolFree: () => sawToolFreeRound, rounds: () => fetchCalls };
    }

try {
await (async()=>{

      const { run, history, sawToolFree } = investigateForever("system-one-recovery", true);
      const result = await run;
      __jait_capture(0, (history.some(message => message.content.includes("System One recovery advice: Prefer a concrete"))));
      __jait_capture(1, (sawToolFree()));
      __jait_capture(2, (result.hitMaxRounds));
      __jait_capture(3, (result.content));
    
})();

} finally {
await __jait_hook_1191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4128_5": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
/*__jait_scope_open__*/{
function investigateForever(sessionId: string, systemOne = false) {
      let fetchCalls = 0;
      let sawToolFreeRound = false;
      const history: AgentMessage[] = [
        { role: "system", content: "system" },
        { role: "user", content: "Find out why the build is slow." },
      ];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        if (String(_input).includes("api.typesafe.ai")) return new Response(JSON.stringify({ model: "jev-latest", answers: { recovery: { type: "choice", choice: "act", confidence: 0.95 } } }));
        const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
        if (!body.tools || body.tools.length === 0) {
          sawToolFreeRound = true;
          return textResponse("Here is what I found.");
        }
        const round = fetchCalls++;
        return toolCallSSE(`call-${round}`, "read", { path: `file-${round}.ts` });
      });

      const run = runAgentLoop(
        {
          llm: {
            openaiApiKey: "test-key",
            openaiBaseUrl: "https://llm.test",
            openaiModel: "test-model",
            contextWindow: 100_000,
          },
          history,
          toolSchemas: [
            {
              type: "function",
              function: {
                name: "read",
                description: "Read a file",
                parameters: { type: "object", properties: { path: { type: "string" } } },
              },
            },
          ],
          hasTools: true,
          sessionId,
          abort: new AbortController(),
          maxRounds: 80,
          auth: systemOne ? { apiKeys: { JEV_API_KEY: "recovery-assessment-test" } } : undefined,
          mode: "agent",
        },
        async () => ({ ok: true, message: "file contents" }),
      );

      return { run, history, sawToolFree: () => sawToolFreeRound, rounds: () => fetchCalls };
    }

try {
await (async()=>{

      const { run, sawToolFree } = investigateForever("session-wandering");
      const result = await run;

      // The model never repeated a call and never hit the round cap — only the
      // absence of state change ends this turn.
      __jait_capture(0, (result.hitMaxRounds));
      __jait_capture(1, (sawToolFree()));
      __jait_capture(2, (result.content));
      __jait_capture(3, (result.rounds));
    
})();

} finally {
await __jait_hook_1191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4140_5": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
/*__jait_scope_open__*/{
function investigateForever(sessionId: string, systemOne = false) {
      let fetchCalls = 0;
      let sawToolFreeRound = false;
      const history: AgentMessage[] = [
        { role: "system", content: "system" },
        { role: "user", content: "Find out why the build is slow." },
      ];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        if (String(_input).includes("api.typesafe.ai")) return new Response(JSON.stringify({ model: "jev-latest", answers: { recovery: { type: "choice", choice: "act", confidence: 0.95 } } }));
        const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
        if (!body.tools || body.tools.length === 0) {
          sawToolFreeRound = true;
          return textResponse("Here is what I found.");
        }
        const round = fetchCalls++;
        return toolCallSSE(`call-${round}`, "read", { path: `file-${round}.ts` });
      });

      const run = runAgentLoop(
        {
          llm: {
            openaiApiKey: "test-key",
            openaiBaseUrl: "https://llm.test",
            openaiModel: "test-model",
            contextWindow: 100_000,
          },
          history,
          toolSchemas: [
            {
              type: "function",
              function: {
                name: "read",
                description: "Read a file",
                parameters: { type: "object", properties: { path: { type: "string" } } },
              },
            },
          ],
          hasTools: true,
          sessionId,
          abort: new AbortController(),
          maxRounds: 80,
          auth: systemOne ? { apiKeys: { JEV_API_KEY: "recovery-assessment-test" } } : undefined,
          mode: "agent",
        },
        async () => ({ ok: true, message: "file contents" }),
      );

      return { run, history, sawToolFree: () => sawToolFreeRound, rounds: () => fetchCalls };
    }

try {
await (async()=>{

      const { run, history } = investigateForever("session-wandering-anchor");
      await run;

      const nudges = history.filter(
        (message) =>
          message.role === "system" && message.content.includes("Investigation is not the goal"),
      );
      __jait_capture(0, (nudges));
    
})();

} finally {
await __jait_hook_1191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4151_5": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{
function toolCallSSE(id: string, name: string, args: unknown = {}): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function toolCallWithContentSSE(id: string, name: string, args: unknown, content: string): Response {
    const contentPayload = JSON.stringify({ choices: [{ delta: { content } }] });
    const toolPayload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id,
                type: "function",
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([
      `data: ${contentPayload}\n\n`,
      `data: ${toolPayload}\n\n`,
      `data: ${finish}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
function toolCallsSSE(calls: Array<{ id: string; name: string; args?: unknown }>): Response {
    const payload = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: calls.map((call, index) => ({
              index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
            })),
          },
        },
      ],
    });
    const finish = JSON.stringify({
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    });
    return sseResponse([`data: ${payload}\n\n`, `data: ${finish}\n\n`, "data: [DONE]\n\n"]);
  }
function sseResponse(chunks: string[]): Response {
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }
function textResponse(text: string): Response {
    return sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
  }
/*__jait_scope_open__*/{
function investigateForever(sessionId: string, systemOne = false) {
      let fetchCalls = 0;
      let sawToolFreeRound = false;
      const history: AgentMessage[] = [
        { role: "system", content: "system" },
        { role: "user", content: "Find out why the build is slow." },
      ];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        if (String(_input).includes("api.typesafe.ai")) return new Response(JSON.stringify({ model: "jev-latest", answers: { recovery: { type: "choice", choice: "act", confidence: 0.95 } } }));
        const body = JSON.parse(String(init?.body ?? "{}")) as { tools?: unknown[] };
        if (!body.tools || body.tools.length === 0) {
          sawToolFreeRound = true;
          return textResponse("Here is what I found.");
        }
        const round = fetchCalls++;
        return toolCallSSE(`call-${round}`, "read", { path: `file-${round}.ts` });
      });

      const run = runAgentLoop(
        {
          llm: {
            openaiApiKey: "test-key",
            openaiBaseUrl: "https://llm.test",
            openaiModel: "test-model",
            contextWindow: 100_000,
          },
          history,
          toolSchemas: [
            {
              type: "function",
              function: {
                name: "read",
                description: "Read a file",
                parameters: { type: "object", properties: { path: { type: "string" } } },
              },
            },
          ],
          hasTools: true,
          sessionId,
          abort: new AbortController(),
          maxRounds: 80,
          auth: systemOne ? { apiKeys: { JEV_API_KEY: "recovery-assessment-test" } } : undefined,
          mode: "agent",
        },
        async () => ({ ok: true, message: "file contents" }),
      );

      return { run, history, sawToolFree: () => sawToolFreeRound, rounds: () => fetchCalls };
    }

try {
await (async()=>{

      const reminder = getReminderInstructions("agent", { model: "test-model", baseUrl: "" });
      __jait_captureType(0, (reminder));

      const { run, history } = investigateForever("session-wandering-reminder");
      await run;

      const reminders = history.filter(
        (message) => message.role === "system" && message.content.startsWith(reminder!),
      );
      __jait_capture(1, (reminders));
    
})();

} finally {
await __jait_hook_1191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4167_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history: AgentMessage[] = [
      {
        role: "tool",
        content: JSON.stringify({ ok: false, message: "503 service unavailable" }),
        tool_call_id: "call-1",
        name: "terminal_exec",
      },
    ];
    const executedToolCalls: ExecutedToolCall[] = [
      {
        callId: "call-1",
        tool: "terminal.exec",
        args: { cmd: "echo test" },
        ok: false,
        message: "503 service unavailable",
        startedAt: 1,
        completedAt: 2,
        retryCount: 0,
      },
    ];

    const result = await retryToolCall(
      "call-1",
      history,
      executedToolCalls,
      async () => ({ ok: true, message: "ok", data: { stdout: "test" } }),
      "session-1",
    );

    __jait_capture(0, (result));
    __jait_capture(1, (executedToolCalls[0]));
    __jait_capture(2, (history[0]), ({
      role: "tool",
      content: JSON.stringify({ ok: true, message: "ok", data: { stdout: "test" } }),
      tool_call_id: "call-1",
      name: "terminal_exec",
    }));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4212_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await retryToolCall(
      "missing-call",
      [],
      [],
      async () => ({ ok: true, message: "ok" }),
      "session-1",
    );

    __jait_capture(0, (result));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4227_3": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    registerOpenAINameMappings(["coverage.identity.tool", "coverage_identity_tool", "coverage.identity_tool"]);
    __jait_capture(0, (fromOpenAIName("coverage_identity_tool")));
    registerOpenAINameMappings(["coverage.identity.tool", "coverage_identity_tool"]);
    __jait_capture(1, (fromOpenAIName("coverage_identity_tool")));
    __jait_capture(2, (listAmbiguousOpenAINames()));
  
})();

} finally {
await __jait_hook_1191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_loop_test_ts_4238_1": {


toolDefsToSchemas(["file.read", "file.list", "web.search", "agent.spawn", "project.create", "project.assign_repository"].map(name => ({
  name, description: name, parameters: { type: "object", properties: {} },
})));
function toolCall(id: string, name = "file_read"): OpenAIToolCall {
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: "{}",
    },
  };
}
function streamReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }).getReader();
}
const LOOP_UNIT = "The user's message was: \"fix the provider selector\" — no.\n\n";
const __jait_hook_1191 = () => {
  vi.restoreAllMocks();
};

try {
await (async()=>{

  const steering = new SteeringController();
  steering.steer("provider text", { displayContent: "visible text", queuedMessageId: "queued-coverage" });
  __jait_capture(0, (steering.hasPending));
  __jait_capture(1, (steering.drain()));
  __jait_capture(2, (steering.hasPending));
  __jait_capture(3, (steering.drain()));

})();

} finally {
await __jait_hook_1191();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
