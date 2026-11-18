// Translated fixture from packages/gateway/src/tools/runtime-service-tools.test.ts; expected literals are in tail_static.rs.
import type { VoiceService } from "../../../../packages/gateway/src/voice/service.js";
import type { ChatTracesService } from "../../../../packages/gateway/src/services/chat-traces.js";
import type { SessionSqlService } from "../../../../packages/gateway/src/services/session-sql.js";
import type { MaintenanceService } from "../../../../packages/gateway/src/services/maintenance.js";
import { createVoiceSpeakTool } from "../../../../packages/gateway/src/tools/voice-tools.js";
import { createChatTracesTool } from "../../../../packages/gateway/src/tools/chat-traces-tools.js";
import { createSessionSqlTool } from "../../../../packages/gateway/src/tools/session-sql-tools.js";
import { createMaintenanceRunTool } from "../../../../packages/gateway/src/tools/maintenance-tools.js";
import { createGatewayStatusTool } from "../../../../packages/gateway/src/tools/gateway-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/runtime-service-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_14_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { speak: vi.fn().mockReturnValue({ mimeType: "audio/wav", audioBase64: "YXVkaW8=" }) };
    __jait_capture(0, (await createVoiceSpeakTool(service as unknown as VoiceService).execute({ text: "  Checks passed  " }, context)));
    __jait_capture(1, (service.speak.mock.calls), ([{ sessionId: context.sessionId, text: "Checks passed" }]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_19_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { speak: vi.fn() };
    __jait_capture(0, ((await createVoiceSpeakTool(service as unknown as VoiceService).execute({ text: " " }, context)).ok));
    __jait_capture(1, (service.speak.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_26_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const traces = { found: true, counts: { messages: 2, threads: 1, threadActivities: 3 }, threads: [{ status: "completed", kind: "agent", title: "Browser checks" }] };
    const service = { traces: vi.fn().mockReturnValue(traces) };
    __jait_capture(0, (await createChatTracesTool(service as unknown as ChatTracesService).execute({ chatId: "chat-1", messageLimit: 5, includeThinking: false }, context)), ({ ok: true, data: traces }));
    __jait_capture(1, (service.traces.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_32_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { traces: vi.fn().mockReturnValue({ found: false }) };
    __jait_capture(0, (await createChatTracesTool(service as unknown as ChatTracesService).execute({ chatId: "foreign-chat" }, context)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_38_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { schema: vi.fn().mockReturnValue({ ok: true, data: { tables: ["sessions"] } }), query: vi.fn() };
    __jait_capture(0, (await createSessionSqlTool(service as unknown as SessionSqlService).execute({ mode: "schema" }, context)));
    __jait_capture(1, (service.query.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_43_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { query: vi.fn().mockReturnValue({ ok: true, data: { rowCount: 5, truncated: true, rows: [] } }) };
    const result = await createSessionSqlTool(service as unknown as SessionSqlService).execute({ sql: "SELECT id FROM sessions", max_rows: 5 }, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.query.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_50_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { query: vi.fn().mockReturnValue({ ok: false, message: "Read-only SELECT required", error: "unsafe_query" }) };
    __jait_capture(0, (await createSessionSqlTool(service as unknown as SessionSqlService).execute({ sql: "DELETE FROM sessions" }, context)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_54_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { query: vi.fn() };
    __jait_capture(0, ((await createSessionSqlTool(service as unknown as SessionSqlService).execute({}, context)).ok));
    __jait_capture(1, (service.query.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_61_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { runForRepo: vi.fn().mockResolvedValue({
      id: "run-1", repoName: "Workbench", allPassed: false, planId: "plan-1",
      checks: [{ passed: false, name: "typecheck", durationMs: 20 }],
    }) };
    const result = await createMaintenanceRunTool(service as unknown as MaintenanceService).execute({ repoId: "repo-1" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (service.runForRepo.mock.calls), (["repo-1",context.actionId]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_70_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { runAll: vi.fn().mockResolvedValue([]) };
    __jait_capture(0, (await createMaintenanceRunTool(service as unknown as MaintenanceService).execute({}, context)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_74_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { runForRepo: vi.fn().mockRejectedValue(new Error("Execution node offline")) };
    __jait_capture(0, (await createMaintenanceRunTool(service as unknown as MaintenanceService).execute({ repoId: "repo-1" }, context)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_runtime_service_tools_test_ts_80_3": {


const context = { sessionId: "runtime-tests", actionId: "runtime-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const deps = {
      sessionService: { list: vi.fn().mockReturnValue([{}, {}]) }, surfaceRegistry: { listSurfaces: () => [{}] },
      ws: { clientCount: 3 }, startedAt: Date.now() - 5000,
      scheduler: { list: () => [{ enabled: true }, { enabled: false }] },
      hooks: { registeredEventTypes: () => ["session.created"], listenerCount: () => 1 },
    };
    const tool = createGatewayStatusTool(deps as unknown as Parameters<typeof createGatewayStatusTool>[0]);
    __jait_capture(0, (await tool.execute({}, context)));
    __jait_capture(1, (deps.sessionService.list.mock.calls));
  
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
