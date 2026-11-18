// Translated fixture from packages/gateway/src/routes/chat-resume-snapshot.test.ts; expected literals are in tail_static.rs.
import { readFileSync } from "node:fs";
import { __chatTestUtils } from "../../../../packages/gateway/src/routes/chat.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-resume-snapshot.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_resume_snapshot_test_ts_60_3": {


const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
  sessionEventCounter,
  seedSessionEventCounter,
} = __chatTestUtils;
const SESSION = "resume-snapshot-session";
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}
function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}
const __jait_hook_415 = () => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    seedRunningSubAgent();

    const assistants = snapshot().filter((m) => m.role === "assistant");
    // Two assistant bubbles for one in-flight turn means the client renders a
    // phantom `agent` card (from LLM history, no children, never completes)
    // above the real accumulator-backed one — the card that appears stuck
    // after navigating away and back mid-sub-agent.
    __jait_capture(0, (assistants));

    const toolCalls = (assistants[0]!.toolCalls ?? []) as Array<Record<string, unknown>>;
    __jait_capture(1, (toolCalls.map((tc) => tc["callId"])));
    __jait_capture(2, (toolCalls[1]!["parentCallId"]));
  
})();

} finally {
await __jait_hook_415();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_resume_snapshot_test_ts_75_3": {


const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
  sessionEventCounter,
  seedSessionEventCounter,
} = __chatTestUtils;
const SESSION = "resume-snapshot-session";
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}
function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}
const __jait_hook_415 = () => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    seedRunningSubAgent();

    const toolCalls = (snapshot().at(-1)!.toolCalls ?? []) as Array<Record<string, unknown>>;
    // ok defaults to true on the accumulator entry, so without an explicit
    // status the snapshot claimed success-with-no-message and the card came
    // back looking finished and frozen.
    __jait_capture(0, (toolCalls[0]!["status"]));
    __jait_capture(1, (toolCalls[1]!["status"]));
  
})();

} finally {
await __jait_hook_415();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_resume_snapshot_test_ts_86_3": {


const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
  sessionEventCounter,
  seedSessionEventCounter,
} = __chatTestUtils;
const SESSION = "resume-snapshot-session";
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}
function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}
const __jait_hook_415 = () => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    seedRunningSubAgent();
    accumulateToolResult(SESSION, "child-read-1", true, "read 40 lines");
    accumulateToolResult(SESSION, "call-agent-1", false, "Sub-agent hit its maxRounds cap");

    const toolCalls = (snapshot().at(-1)!.toolCalls ?? []) as Array<Record<string, unknown>>;
    __jait_capture(0, (toolCalls[0]!["status"]));
    __jait_capture(1, (toolCalls[1]!["status"]));
    __jait_capture(2, (toolCalls[1]!["message"]));
  
})();

} finally {
await __jait_hook_415();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_resume_snapshot_test_ts_110_3": {


const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
  sessionEventCounter,
  seedSessionEventCounter,
} = __chatTestUtils;
const SESSION = "resume-snapshot-session";
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}
function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}
const __jait_hook_415 = () => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
};
/*__jait_scope_open__*/{
const source = () =>
    readFileSync(new URL("./chat.ts", __jait_original_url), "utf8");

try {
await (async()=>{

    const src = source();
    const seedIdx = src.indexOf(
      "seedSessionEventCounter(sessionId);\n    const rawLastEventId = request.headers[\"last-event-id\"];",
    );
    __jait_capture(0, (seedIdx));
  
})();

} finally {
await __jait_hook_415();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_resume_snapshot_test_ts_118_3": {


const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
  sessionEventCounter,
  seedSessionEventCounter,
} = __chatTestUtils;
const SESSION = "resume-snapshot-session";
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}
function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}
const __jait_hook_415 = () => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
};
/*__jait_scope_open__*/{
const source = () =>
    readFileSync(new URL("./chat.ts", __jait_original_url), "utf8");

try {
await (async()=>{

    // Real behavior, not just source shape: an unseeded session resolves to
    // "now" after seeding, and seeding is idempotent — it must not reset the
    // counter if another route already advanced it.
    const { sessionEventCounter, seedSessionEventCounter } = __chatTestUtils;
    for (const id of ["resume-pos-a", "resume-pos-b", "resume-pos-c"]) sessionEventCounter.delete(id);
    try {
      // Unseeded + no durable row → position "now" (0), not a replay from 0.
      seedSessionEventCounter("resume-pos-a");
      const resumeFrom = sessionEventCounter.get("resume-pos-a") ?? 0;
      __jait_capture(0, (resumeFrom));

      // A live event advancing the counter moves "now" forward; a later
      // subscribe with no header must resume from the current position.
      sessionEventCounter.set("resume-pos-a", 41);
      seedSessionEventCounter("resume-pos-a");
      __jait_capture(1, (sessionEventCounter.get("resume-pos-a")));
    } finally {
      for (const id of ["resume-pos-a", "resume-pos-b", "resume-pos-c"]) sessionEventCounter.delete(id);
    }
  
})();

} finally {
await __jait_hook_415();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_resume_snapshot_test_ts_150_3": {


const {
  sessionHistory,
  sessionStreamingState,
  buildVisibleHistoryMessages,
  accumulateToolStart,
  accumulateToolResult,
  getOrCreateAccumulator,
  sessionEventCounter,
  seedSessionEventCounter,
} = __chatTestUtils;
const SESSION = "resume-snapshot-session";
function seedRunningSubAgent(): void {
  sessionHistory.set(SESSION, [
    { role: "system", content: "system" },
    { role: "user", content: "fix the thing" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call-agent-1", type: "function", function: { name: "agent", arguments: '{"description":"Developer"}' } },
      ],
    },
  ] as never);

  getOrCreateAccumulator(SESSION);
  accumulateToolStart(SESSION, "call-agent-1", "agent", { description: "Developer" });
  // The specialist's own tool call, hanging under the agent card.
  accumulateToolStart(SESSION, "child-read-1", "file.read", { path: "a.ts" }, "call-agent-1");
}
function snapshot() {
  return buildVisibleHistoryMessages(
    SESSION,
    sessionHistory.get(SESSION)!,
    { includePendingAssistantToolCalls: true },
  );
}
const __jait_hook_415 = () => {
  sessionHistory.delete(SESSION);
  sessionStreamingState.delete(SESSION);
};
/*__jait_scope_open__*/{
const source = () =>
    readFileSync(new URL("./chat.ts", __jait_original_url), "utf8");

try {
await (async()=>{

    const src = source();
    // The /events replay filters in SQL now, so its call carries the resume
    // position — match that exact call to slice the /events block (the
    // trajectory stream's unfiltered `loadSessionEvents(sessionId)` must not
    // be picked up by this needle).
    const start = src.indexOf("const history = loadSessionEvents(sessionId, resumeFrom);");
    const end = src.indexOf("// Real turn-state heartbeat", start);
    const replayBlock = src.slice(start, end);

    __jait_capture(0, (replayBlock));
    // The tag must land before the event is written out.
    __jait_capture(1, (replayBlock.indexOf(".replay = true;")));
    __jait_capture(2, (replayBlock.indexOf(".replay = true;")), (replayBlock.indexOf("writeSseChunk(reply, `id: ${ev.log_id}")));
  
})();

} finally {
await __jait_hook_415();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
