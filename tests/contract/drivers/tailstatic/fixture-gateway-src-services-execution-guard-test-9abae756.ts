// Translated fixture from packages/gateway/src/services/execution-guard.test.ts; expected literals are in tail_static.rs.
import { ExecutionGuard } from "../../../../packages/gateway/src/services/execution-guard.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/execution-guard.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_5_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (const tool of ["browser.screenshot", "preview.inspect", "browser.snapshot"]) {
      guard.beforeCall();
      guard.record(tool, { ok: false, message: "This preview is not shared with the agent. Use Share with agent in the chat browser card or preview tab to allow browser tools." });
    }
    __jait_capture(0, (guard.stopReason));
    __jait_capture(1, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_15_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("screenshot.capture", { ok: false, message: "Screenshot failed: browserType.launch: Executable doesn't exist at /cache/chromium/headless_shell" });
    }
    __jait_capture(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_24_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (const path of ["design.md", "review.json", "optional.log"]) {
      guard.beforeCall();
      guard.record("file.read", { ok: false, message: `ENOENT: no such file or directory, open '/project/${path}'` });
    }
    __jait_captureType(0, (guard.stopReason));
    __jait_capture(1, (guard.snapshot().infrastructureFailures ?? 0));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_34_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 6; i++) {
      guard.beforeCall();
      guard.record("execute", { ok: false, message: "bash: bun: command not found" });
      guard.beforeCall();
      guard.record("execute", { ok: true, message: "Command completed", data: { output: `bun works: ${i}`, exitCode: 0 } });
    }
    __jait_captureType(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_45_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (const tool of ["execute", "terminal.run", "jait.terminal"]) {
      __jait_captureType(0, (guard.beforeCall()));
      guard.record(tool, { ok: false, message: "Command failed", data: { output: "fatal: not a git repository: /host/.git", exitCode: 128 } });
    }
    __jait_capture(1, (guard.beforeCall()));
    __jait_capture(2, (guard.snapshot().calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_55_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 20; i++) {
      guard.beforeCall();
      guard.record("todo", { ok: true, message: `Progress ${i}`, data: { items: [] } });
    }
    __jait_capture(0, (guard.stopReason));
    const progressing = new ExecutionGuard();
    for (let i = 0; i < 20; i++) {
      progressing.beforeCall();
      progressing.record("read", { ok: true, message: `Read range ${i}`, data: { content: "1\tNew evidence" } });
    }
    __jait_captureType(1, (progressing.stopReason));
    for (let i = 0; i < 20; i++) {
      progressing.beforeCall();
      progressing.record("file.read", { ok: true, message: "Different tool", data: { content: "New evidence" } });
    }
    __jait_capture(2, (progressing.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_75_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 20; i++) {
      guard.beforeCall();
      guard.record(["mcp__jait_core__todo", "mcp__jait__team_chat", "mcp__jait__tools_search"][i % 3]!,
        { ok: true, message: `Acknowledged ${i}`, data: { id: `different-result-${i}` } });
    }
    __jait_capture(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_85_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    guard.beforeCall(); guard.record("read", { ok: true, message: "fact", data: { content: "fact" } });
    guard.beforeCall(); guard.record("execute", { ok: false, message: "Source chat not found" });
    guard.beforeCall(); guard.record("team.chat", { ok: false, message: "Source chat not found" });
    const restored = new ExecutionGuard(guard.snapshot());
    restored.beforeCall(); restored.record("team.chat", { ok: false, message: "Source chat not found" });
    __jait_capture(0, (restored.stopReason));
    __jait_capture(1, (restored.snapshot().calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_96_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("jait.terminal", { ok: true, message: "Command completed", data: { exitCode: 0,
        output: "bash: bun: command not found; diagnostic attempt " + i } });
    }
    __jait_capture(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_106_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    let guard = new ExecutionGuard();
    const outputs = ["bun: command not found", "Cannot find module better-sqlite3", "Permission denied",
      "Source chat not found", "Consent request timed out", "No test files found"];
    for (const output of outputs) {
      guard.beforeCall();
      guard.record("terminal.run", { ok: false, message: output });
      guard = new ExecutionGuard(guard.snapshot());
    }
    __jait_capture(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_118_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("file.read", { ok: true, message: "Read", data: { content: "command not found; permission denied" } });
    }
    __jait_captureType(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_127_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard();
    for (let i = 0; i < 3; i++) {
      guard.beforeCall();
      guard.record("jait.terminal", { ok: true, message: "Command completed", data: { exitCode: 0,
        output: "src/guard.ts: if (/command not found|permission denied/.test(message)) return;" } });
    }
    __jait_captureType(0, (guard.stopReason));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_137_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    let guard = new ExecutionGuard(undefined, Number.POSITIVE_INFINITY);
    for (let i = 0; i < 300; i++) {
      __jait_captureType(0, (guard.beforeCall()));
      __jait_captureType(1, (guard.record("file.read", { ok: true, message: `fact ${i}` })));
      if (i === 119) guard = new ExecutionGuard(guard.snapshot(), Number.POSITIVE_INFINITY);
    }
    __jait_capture(2, (guard.snapshot().calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_execution_guard_test_ts_147_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const guard = new ExecutionGuard(undefined, 120);
    for (let i = 0; i < 120; i++) {
      __jait_captureType(0, (guard.beforeCall()));
      guard.record("read", { ok: true, message: `fact ${i}` });
    }
    __jait_capture(1, (guard.beforeCall()));
    __jait_capture(2, (guard.snapshot().calls));
  
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
