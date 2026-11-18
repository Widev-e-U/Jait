// Translated fixture from packages/gateway/src/providers/compaction-recovery.test.ts; expected literals are in tail_static.rs.
import { AcpProvider } from "../../../../packages/gateway/src/providers/acp-provider.js";
import { compactProviderContext, type ProviderContextState } from "../../../../packages/gateway/src/providers/context-control.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/compaction-recovery.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_compaction_recovery_test_ts_14_3": {


function setup(prompt: ReturnType<typeof vi.fn>, cancel = vi.fn().mockResolvedValue(undefined)) {
  const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: "unused" });
  const control: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
  const state = { contextControl: control, session: { status: "idle" }, connection: { prompt, cancel }, acpSessionId: "acp", approvals: new Map(), client: { terminals: new Map(), trackedTerminalIds: new Set() } };
  (provider as unknown as { sessions: Map<string, unknown> }).sessions.set("test", state);
  return { provider, state, control, cancel };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = vi.fn().mockRejectedValueOnce(new Error("compaction failed")).mockResolvedValue({ stopReason: "end_turn" });
    const { provider, cancel, control } = setup(prompt);
    await provider.sendTurn("test", "work");
    __jait_capture(0, (prompt.mock.calls.map(call => call[0].prompt[0].text)));
    __jait_capture(1, (cancel.mock.calls));
    __jait_capture(2, (control.retryAfter), (Date.now()));
    await provider.sendTurn("test", "next");
    __jait_capture(3, (prompt.mock.calls.map(call => call[0].prompt[0].text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_compaction_recovery_test_ts_25_3": {


function setup(prompt: ReturnType<typeof vi.fn>, cancel = vi.fn().mockResolvedValue(undefined)) {
  const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: "unused" });
  const control: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
  const state = { contextControl: control, session: { status: "idle" }, connection: { prompt, cancel }, acpSessionId: "acp", approvals: new Map(), client: { terminals: new Map(), trackedTerminalIds: new Set() } };
  (provider as unknown as { sessions: Map<string, unknown> }).sessions.set("test", state);
  return { provider, state, control, cancel };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let finish!: (value: { stopReason: string }) => void;
    const prompt = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { provider } = setup(prompt);
    const turn = provider.sendTurn("test", "work");
    await provider.interruptTurn("test");
    finish({ stopReason: "cancelled" });
    await __jait_rejected(0, turn);
    __jait_capture(1, (prompt.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_compaction_recovery_test_ts_36_3": {


function setup(prompt: ReturnType<typeof vi.fn>, cancel = vi.fn().mockResolvedValue(undefined)) {
  const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: "unused" });
  const control: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
  const state = { contextControl: control, session: { status: "idle" }, connection: { prompt, cancel }, acpSessionId: "acp", approvals: new Map(), client: { terminals: new Map(), trackedTerminalIds: new Set() } };
  (provider as unknown as { sessions: Map<string, unknown> }).sessions.set("test", state);
  return { provider, state, control, cancel };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const prompt = vi.fn().mockImplementation(() => new Promise(() => {}));
      const { provider, cancel } = setup(prompt);
      const turn = provider.sendTurn("test", "work");
      const assertion = __jait_rejected(0, turn);
      await vi.advanceTimersByTimeAsync(185_001);
      await assertion;
      __jait_capture(1, (cancel.mock.calls));
      __jait_capture(2, (prompt.mock.calls));
      await __jait_rejected(3, provider.sendTurn("test", "next"));
      __jait_capture(4, (prompt.mock.calls));
    } finally { vi.useRealTimers(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_compaction_recovery_test_ts_52_3": {


function setup(prompt: ReturnType<typeof vi.fn>, cancel = vi.fn().mockResolvedValue(undefined)) {
  const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: "unused" });
  const control: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
  const state = { contextControl: control, session: { status: "idle" }, connection: { prompt, cancel }, acpSessionId: "acp", approvals: new Map(), client: { terminals: new Map(), trackedTerminalIds: new Set() } };
  (provider as unknown as { sessions: Map<string, unknown> }).sessions.set("test", state);
  return { provider, state, control, cancel };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const state: ProviderContextState = { commands: ["compact"], usedTokens: 90_000, contextWindow: 100_000 };
      const invoke = vi.fn().mockRejectedValueOnce(new Error("failed")).mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
      await __jait_rejected(0, compactProviderContext(state, invoke));
      await compactProviderContext(state, invoke);
      __jait_capture(1, (invoke.mock.calls));
      await vi.advanceTimersByTimeAsync(60_000);
      await __jait_rejected(2, compactProviderContext(state, invoke));
      await vi.advanceTimersByTimeAsync(119_999);
      await compactProviderContext(state, invoke);
      __jait_capture(3, (invoke.mock.calls));
      await vi.advanceTimersByTimeAsync(1);
      await compactProviderContext(state, invoke);
      __jait_capture(4, (state.failures));
      __jait_captureType(5, (state.usedTokens));
    } finally { vi.useRealTimers(); }
  
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
