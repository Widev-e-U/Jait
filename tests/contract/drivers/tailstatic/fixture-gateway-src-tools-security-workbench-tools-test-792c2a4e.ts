// Translated fixture from packages/gateway/src/tools/security-workbench-tools.test.ts; expected literals are in tail_static.rs.
import { createSecurityWorkbenchTools } from "../../../../packages/gateway/src/tools/security-workbench-tools.js";
import { getSecurityWorkbench } from "../../../../packages/gateway/src/security/workbench.js";
import { getAssessmentService } from "../../../../packages/gateway/src/security/assessment.js";
import type { SchedulerService } from "../../../../packages/gateway/src/scheduler/service.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/security-workbench-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_security_workbench_tools_test_ts_9_1": {


const context: ToolContext = {userId:"monitor-owner",requestedBy:"agent",sessionId:"fixture",actionId:"fixture",projectRoot:process.cwd()};
const __jait_hook_517 = ()=>vi.restoreAllMocks();

try {
await (async()=>{

 const scope=getAssessmentService().createScope({targets:["127.0.0.1","127.0.0.2"],exclusions:[],ports:[80,443],methods:["http","tls"],authorized:true,expiresAt:new Date(Date.now()+60_000).toISOString()},"monitor-owner");
 const saved={scopeId:scope.id,profile:"http",target:"127.0.0.1",port:80,minutes:15};
 let job={id:"monitor-job",userId:"monitor-owner",enabled:true,toolName:"security.monitor.tick",input:saved};
 const fake={create:vi.fn(()=>job),update:vi.fn((_id,patch)=>{job={...job,...patch};return job}),get:vi.fn((_id,owner)=>owner===job.userId?job:null)};
 const tools=createSecurityWorkbenchTools(fake as unknown as SchedulerService);
 const schedule=tools.find(t=>t.name==="security.monitor.schedule")!;
 __jait_capture(0, (schedule.defaultConsentLevel));
 __jait_capture(1, ((await schedule.execute({...saved,minutes:1},context)).ok));
 __jait_capture(2, ((await schedule.execute(saved,context)).ok));
 const service=getSecurityWorkbench();
 const start=vi.spyOn(service,"start").mockReturnValue({id:"monitor-run"} as ReturnType<typeof service.start>);
 vi.spyOn(service,"history").mockReturnValue({runs:[],findings:[]});
 vi.spyOn(service,"wait").mockResolvedValue({id:"monitor-run",status:"completed",coverageGaps:[]} as Awaited<ReturnType<typeof service.wait>>);
 const tick=tools.find(t=>t.name==="security.monitor.tick")!;
 __jait_capture(3, ((await tick.execute({...saved,monitorJobId:job.id,target:"127.0.0.2",profile:"tls",port:443},context)).ok));
 __jait_capture(4, (start.mock.calls[0][0]), (saved));
 __jait_capture(5, ((await tick.execute({...saved,monitorJobId:job.id},{...context,userId:"other"})).ok));
 vi.spyOn(Date,"now").mockReturnValue(Date.parse(scope.expiresAt)+1);
 __jait_capture(6, ((await tick.execute({...saved,monitorJobId:job.id},context)).message));
 __jait_capture(7, (fake.update.mock.calls), ([job.id,{enabled:false},"monitor-owner"]));
 __jait_capture(8, (start.mock.calls));

})();

} finally {
await __jait_hook_517();
}


break;
}
case "tailstatic_packages_gateway_src_tools_security_workbench_tools_test_ts_33_1": {


const context: ToolContext = {userId:"monitor-owner",requestedBy:"agent",sessionId:"fixture",actionId:"fixture",projectRoot:process.cwd()};
const __jait_hook_517 = ()=>vi.restoreAllMocks();

try {
await (async()=>{

 const expanded = getSecurityWorkbench();
 const native = getAssessmentService();
 const fakeRun = { id: "saved-expanded", operatorId: context.userId, status: "completed", evidence: [], findings: [] };
 const getExpanded = vi.spyOn(expanded, "get").mockImplementation((id, owner) => {
   if (id === fakeRun.id && owner === context.userId) return fakeRun as ReturnType<typeof expanded.get>;
   throw new Error("Security check not found");
 });
 const getNative = vi.spyOn(native, "getRun").mockImplementation((id, owner) => {
   if (id === "saved-native" && owner === context.userId) return { id, status: "partial", observations: [] } as ReturnType<typeof native.getRun>;
   throw new Error("Assessment not found");
 });
 const startExpanded = vi.spyOn(expanded, "start");
 const startNative = vi.spyOn(native, "start");
 const show = createSecurityWorkbenchTools().find(tool => tool.name === "security.results.show")!;
 __jait_capture(0, (show.parameters.required));
 __jait_capture(1, (await show.execute({ runId: fakeRun.id }, context)), ({ ok: true, data: fakeRun }));
 __jait_capture(2, (await show.execute({ runId: "saved-native" }, context)));
 __jait_capture(3, ((await show.execute({ runId: fakeRun.id }, { ...context, userId: "other" })).ok));
 __jait_capture(4, ((await show.execute({ runId: "saved-native" }, { ...context, userId: "other" })).ok));
 __jait_capture(5, (getExpanded.mock.calls), ([fakeRun.id,context.userId]));
 __jait_capture(6, (getNative.mock.calls), (["saved-native",context.userId]));
 __jait_capture(7, (startExpanded.mock.calls));
 __jait_capture(8, (startNative.mock.calls));

})();

} finally {
await __jait_hook_517();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
