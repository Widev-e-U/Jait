// Translated fixture from packages/gateway/src/routes/chat-context-flow-storage.test.ts; expected literals are in tail_static.rs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { __chatTestUtils } from "../../../../packages/gateway/src/routes/chat.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-context-flow-storage.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_context_flow_storage_test_ts_7_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const stored = __chatTestUtils.serializePersistedToolCalls(JSON.stringify([{
      callId: "call-large",
      tool: "terminal.run",
      status: "completed",
      ok: true,
      message: "done",
      output: "x".repeat(2_000_000),
    }]));
    const parsed = JSON.parse(stored!) as Array<Record<string, unknown>>;

    __jait_capture(0, (Array.isArray(parsed)));
    __jait_capture(1, (parsed.every((entry) => entry && typeof entry === "object")));
    __jait_capture(2, (Buffer.byteLength(stored!, "utf8")));
    __jait_capture(3, (parsed[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_context_flow_storage_test_ts_30_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const source = readFileSync(
      fileURLToPath(new URL("./chat.ts", __jait_original_url)),
      "utf8",
    );
    const completionStart = source.indexOf("// Re-serialize through the same storage cap");
    const completionEnd = source.indexOf("if (contextFlowJson)", completionStart);
    const completionBlock = source.slice(completionStart, completionEnd);

    __jait_capture(0, (completionStart));
    __jait_capture(1, (completionBlock));
    __jait_capture(2, (completionBlock));
    __jait_capture(3, (source));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_context_flow_storage_test_ts_45_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const stored = __chatTestUtils.serializePersistedContextFlow({
      provider: "jait",
      model: "test-model",
      rounds: [{
        round: 1,
        createdAt: new Date().toISOString(),
        model: "test-model",
        messages: [{ role: "tool", content: "x".repeat(2_000_000) }],
        metrics: { durationMs: 250, completionTokens: 10 },
      }],
    });
    const parsed = JSON.parse(stored) as {
      rounds: Array<{ metrics?: { completionTokens?: number }; messages: Array<{ content?: string }> }>;
    };

    __jait_capture(0, (Buffer.byteLength(stored, "utf8")));
    __jait_capture(1, (parsed.rounds[0]?.metrics?.completionTokens));
    __jait_capture(2, (parsed.rounds[0]?.messages[0]?.content));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_context_flow_storage_test_ts_75_3": {


/*__jait_scope_open__*/{
const round = (n: number) => ({ round: n, createdAt: "2026-10-20T00:00:00Z", model: "test",
    messages: [{ role: "user", content: "x".repeat(200_000), thinking: "y".repeat(20_000),
      tool_calls: [{ function: { name: "tool", arguments: "z".repeat(20_000) } }] }],
    tools: [{ name: "tool" }],
  });

try {
await (async()=>{

    const flow = { provider: "test", rounds: [1, 2, 3, 4].map(round) };
    const stored = __chatTestUtils.serializePersistedContextFlow(flow);
    const parsed = JSON.parse(stored);
    __jait_capture(0, (parsed.truncatedRounds));
    __jait_capture(1, (parsed.rounds.map((r: { round: number }) => r.round)));
    __jait_capture(2, (parsed.rounds[0].messages[0].tool_calls));
    __jait_capture(3, (parsed.rounds[0].messages[0].thinking));
    __jait_capture(4, (parsed.rounds.every((r: { tools?: unknown }) => r.tools === undefined)));
    __jait_capture(5, (flow.rounds[0]!.messages[0]!.content));
    __jait_capture(6, (Buffer.byteLength(stored)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_context_flow_storage_test_ts_88_3": {


/*__jait_scope_open__*/{
const round = (n: number) => ({ round: n, createdAt: "2026-10-20T00:00:00Z", model: "test",
    messages: [{ role: "user", content: "x".repeat(200_000), thinking: "y".repeat(20_000),
      tool_calls: [{ function: { name: "tool", arguments: "z".repeat(20_000) } }] }],
    tools: [{ name: "tool" }],
  });

try {
await (async()=>{

    const memory = { query: "q".repeat(20_000), injectedIds: ["m"], ignoredIds: [], savedIds: [],
      retrieved: [{ id: "m", scope: "session" as const, source: "test", sourceType: "test",
        sourceId: "s", sourceSurface: "chat", updatedAt: "2026-10-20", content: "m".repeat(10_000) }],
    };
    const rounds = [1, 2, 3].map(n => ({ ...round(n), messages: Array.from({ length: 20 },
      (_, i) => ({ role: "user", content: `${i}:` + "x".repeat(20_000) })) }));
    const stored = __chatTestUtils.serializePersistedContextFlow({ provider: "test", rounds, memory });
    const parsed = JSON.parse(stored);
    __jait_capture(0, (parsed.truncated));
    __jait_capture(1, (parsed.rounds[0].messages));
    __jait_capture(2, (parsed.rounds[0].messages[0].content));
    __jait_capture(3, (parsed.rounds[0].messages[1].content));
    __jait_capture(4, (parsed.memory.query), ("q".repeat(2000) + "\n[Stored context truncated]"));
    __jait_capture(5, (parsed.memory.retrieved[0].content), ("m".repeat(1000) + "\n[Stored context truncated]"));
    __jait_capture(6, (parsed.memory.injectedIds));
    __jait_capture(7, (Buffer.byteLength(stored)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_context_flow_storage_test_ts_107_3": {


/*__jait_scope_open__*/{
const round = (n: number) => ({ round: n, createdAt: "2026-10-20T00:00:00Z", model: "test",
    messages: [{ role: "user", content: "x".repeat(200_000), thinking: "y".repeat(20_000),
      tool_calls: [{ function: { name: "tool", arguments: "z".repeat(20_000) } }] }],
    tools: [{ name: "tool" }],
  });

try {
await (async()=>{

    const stored = __chatTestUtils.serializePersistedContextFlow({ provider: "test", rounds: [{
      ...round(1), messages: [{ role: "tool", content: { payload: "x".repeat(600_000) } }],
    }] });
    const parsed = JSON.parse(stored);
    __jait_capture(0, (parsed.rounds[0].messages));
    __jait_capture(1, (parsed.truncated));
    __jait_capture(2, (Buffer.byteLength(stored)));
  
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
