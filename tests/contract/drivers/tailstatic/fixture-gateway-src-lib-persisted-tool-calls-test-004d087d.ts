// Translated fixture from packages/gateway/src/lib/persisted-tool-calls.test.ts; expected literals are in tail_static.rs.
import { serializePersistedToolCalls } from "../../../../packages/gateway/src/lib/persisted-tool-calls.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/lib/persisted-tool-calls.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_5_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (serializePersistedToolCalls(undefined)));
    __jait_captureType(1, (serializePersistedToolCalls("")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_10_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (serializePersistedToolCalls("not-json")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_14_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (serializePersistedToolCalls('{"tool":"file.read"}')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_18_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const payload = JSON.stringify([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true },
    ]);
    __jait_capture(0, (serializePersistedToolCalls(payload)), (payload));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_25_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const payload = JSON.stringify([
      {
        callId: "c1",
        tool: "file.read",
        args: { path: "README.md" },
        ok: true,
        output: "x".repeat(200_000),
      },
    ]);
    const serialized = serializePersistedToolCalls(payload, { maxBytes: 4_096 });
    __jait_capture(0, (Buffer.byteLength(serialized, "utf8")));
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    __jait_capture(1, (parsed[0]["callId"]));
    __jait_capture(2, (parsed[0]["tool"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_42_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const payload = JSON.stringify([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true },
    ]);
    const serialized = serializePersistedToolCalls(payload, { forceCompact: true });
    __jait_capture(0, (serialized), (payload));
    __jait_capture(1, (JSON.parse(serialized)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_53_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const payload = JSON.stringify([
      { callId: "c1", tool: "file.read", args: { path: "README.md" }, ok: true },
    ]);
    const serialized = serializePersistedToolCalls(payload, {
      forceCompact: true,
      markCompacted: true,
    });
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    __jait_capture(0, (parsed[0]["storageCompacted"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_65_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const entry = {
      callId: "c1",
      tool: "file.read",
      args: { path: "README.md" },
      ok: true,
      data: { huge: "x".repeat(1_000_000) },
      output: "y".repeat(1_000_000),
    };
    // Multiple oversized entries so even the smallest compaction pass exceeds the ceiling.
    const payload = JSON.stringify([entry, entry, entry, entry, entry]);
    const serialized = serializePersistedToolCalls(payload, { maxBytes: 1_024 });
    __jait_capture(0, (Buffer.byteLength(serialized, "utf8")));
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    __jait_capture(1, (parsed.length));
    for (const item of parsed) {
      __jait_capture(2, (item["callId"]));
      __jait_captureType(3, (item["data"]));
      __jait_captureType(4, (item["output"]));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_87_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    // Inline base64 is not compaction-safe: the string passes are byte-limited,
    // so an inlined data URI comes back truncated and the chat renders a broken
    // image. `image.view` therefore only inlines small images and otherwise
    // reports the path, which is tiny enough to survive every pass.
    const base64 = "A".repeat(120_000);
    const dataUri = `data:image/png;base64,${base64}`;
    const filler = {
      callId: "c2",
      tool: "terminal",
      ok: true,
      args: {},
      output: "x".repeat(200_000),
    };

    const inlineResult = serializePersistedToolCalls(JSON.stringify([
      {
        callId: "img",
        tool: "image.view",
        ok: true,
        args: { path: "big.png" },
        data: { path: "big.png", mimeType: "image/png", size: 90_000, dataUri, base64 },
      },
      filler,
    ]), { maxBytes: 4_096 });
    const inlineData = (JSON.parse(inlineResult) as Array<Record<string, unknown>>)[0]["data"] as Record<string, unknown>;
    __jait_capture(0, (inlineData["dataUri"]), (dataUri));
    __jait_capture(1, ((inlineData["dataUri"] as string).length), (dataUri.length));

    const pathResult = serializePersistedToolCalls(JSON.stringify([
      {
        callId: "img",
        tool: "image.view",
        ok: true,
        args: { path: "big.png" },
        data: { path: "big.png", mimeType: "image/png", size: 90_000, inline: false },
      },
      filler,
    ]), { maxBytes: 4_096 });
    __jait_capture(2, (Buffer.byteLength(pathResult, "utf8")));
    const pathData = (JSON.parse(pathResult) as Array<Record<string, unknown>>)[0]["data"];
    __jait_capture(3, (pathData));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_131_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const payload = JSON.stringify([
      {
        callId: "c1",
        tool: "file.read",
        args: {},
        ok: true,
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_000_100,
        retryCount: 2,
        status: "completed",
      },
    ]);
    const serialized = serializePersistedToolCalls(payload, { forceCompact: true });
    const parsed = JSON.parse(serialized) as Array<Record<string, unknown>>;
    __jait_capture(0, (parsed[0]["startedAt"]));
    __jait_capture(1, (parsed[0]["completedAt"]));
    __jait_capture(2, (parsed[0]["retryCount"]));
    __jait_capture(3, (parsed[0]["status"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_151_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const entries = Array.from({ length: 1_500 }, (_, i) => ({
      callId: `call-${i}`, tool: "read", args: {}, ok: true,
      message: "🦀".repeat(200), output: "x".repeat(1_000), data: { body: "x".repeat(1_000) },
    }));
    const raw = JSON.stringify(entries);
    const stringify = JSON.stringify;
    let arrayItems = 0;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((value: unknown) => {
      if (Array.isArray(value)) arrayItems += value.length;
      return stringify(value);
    }) as typeof JSON.stringify);
    let serialized: string | null;
    try {
      serialized = serializePersistedToolCalls(raw);
    } finally {
      spy.mockRestore();
    }
    __jait_capture(0, (arrayItems), (entries.length * 4));
    __jait_capture(1, (Buffer.byteLength(serialized!, "utf8")));
    const result = JSON.parse(serialized!);
    __jait_capture(2, (result.length));
    __jait_capture(3, (result[0].callId));
    __jait_capture(4, (result.at(-1).callId), (`call-${result.length - 1}`));
    __jait_capture(5, (result.every((entry: Record<string, unknown>) => !("data" in entry) && !("output" in entry))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_lib_persisted_tool_calls_test_ts_178_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = JSON.parse(serializePersistedToolCalls(JSON.stringify([null, 1, {}]), { forceCompact: true, markCompacted: true })!);
    __jait_capture(0, (result));
    __jait_capture(1, (result[0]));
  
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
