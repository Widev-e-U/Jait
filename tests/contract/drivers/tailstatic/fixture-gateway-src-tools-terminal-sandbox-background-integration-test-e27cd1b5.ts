// Translated fixture from packages/gateway/src/tools/terminal-sandbox-background.integration.test.ts; expected literals are in tail_static.rs.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createJaitTerminalTool } from "../../../../packages/gateway/src/tools/terminal-tools.js";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/terminal-sandbox-background.integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_30_3": {


/*__jait_source_gate__ skipIf process.env["JAIT_TEST_DOCKER"] !== "1" */
/*__jait_scope_open__*/{
const manager = new SandboxManager();
const tool = createJaitTerminalTool({} as SurfaceRegistry, manager);
let projectRoot: string;
let containerName: string;
let context: ToolContext;
const __jait_hook_802 = async () => {
    const artifacts = resolve(__jait_original_dir, "../../../../.jait/artifacts/sandbox-background");
    await mkdir(artifacts, { recursive: true });
    projectRoot = await mkdtemp(join(artifacts, "docker-"));
    const session = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
    containerName = session.containerName;
    context = { sessionId: "docker-test", actionId: "action", requestedBy: "test", projectRoot, sandboxContainerName: containerName };
  };
const __jait_hook_1310 = async () => {
    backgroundCommandMonitor.clearForTests();
    if (containerName) await manager.stopContainer(containerName);
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_802();
try {
await (async()=>{

    const abort = new AbortController();
    const start = Date.now();
    const notify = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notify);
    const result = await tool.execute({
      sandbox: true, isBackground: true, timeout: 30000,
      command: `bun -e 'Bun.serve({hostname:"127.0.0.1",port:3411,fetch(){return new Response("ok")}}); console.log("Listening")'`,
    }, { ...context, signal: abort.signal });
    __jait_capture(0, (Date.now() - start));
    __jait_capture(1, (result.ok));
    __jait_capture(2, (result.data));
    __jait_capture(3, ((result.data as { output: string }).output));
    const probe = await manager.execInContainer({
      containerName, timeoutMs: 5000,
      command: `bun -e 'console.log(await (await fetch("http://127.0.0.1:3411")).text())'`,
    });
    __jait_capture(4, (probe.output));
    abort.abort();
    await new Promise(resolve => setTimeout(resolve, 2500));
    const after = await manager.execInContainer({
      containerName, timeoutMs: 5000,
      command: `bun -e 'try { await fetch("http://127.0.0.1:3411"); process.exit(1) } catch { console.log("stopped") }'`,
    });
    __jait_capture(5, (after.ok));
    __jait_capture(6, (after.output));
    __jait_capture(7, (notify.mock.calls));
    __jait_capture(8, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_1310();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_60_3": {


/*__jait_source_gate__ skipIf process.env["JAIT_TEST_DOCKER"] !== "1" */
/*__jait_scope_open__*/{
const manager = new SandboxManager();
const tool = createJaitTerminalTool({} as SurfaceRegistry, manager);
let projectRoot: string;
let containerName: string;
let context: ToolContext;
const __jait_hook_802 = async () => {
    const artifacts = resolve(__jait_original_dir, "../../../../.jait/artifacts/sandbox-background");
    await mkdir(artifacts, { recursive: true });
    projectRoot = await mkdtemp(join(artifacts, "docker-"));
    const session = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
    containerName = session.containerName;
    context = { sessionId: "docker-test", actionId: "action", requestedBy: "test", projectRoot, sandboxContainerName: containerName };
  };
const __jait_hook_1310 = async () => {
    backgroundCommandMonitor.clearForTests();
    if (containerName) await manager.stopContainer(containerName);
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_802();
try {
await (async()=>{

    const notify = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notify);
    const result = await tool.execute({
      sandbox: true, isBackground: true, timeout: 1500,
      command: `bun -e 'console.log("x".repeat(50000)); setInterval(()=>{},1000)'`,
    }, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as { output: string }).output.length));
    await vi.waitFor(() => __jait_capture(2, (notify.mock.calls)), { timeout: 6000 });
    __jait_capture(3, (notify.mock.calls[0]![0]));
    __jait_capture(4, (notify.mock.calls[0]![0].output.length));
  
})();

} finally {
await __jait_hook_1310();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_74_3": {


/*__jait_source_gate__ skipIf process.env["JAIT_TEST_DOCKER"] !== "1" */
/*__jait_scope_open__*/{
const manager = new SandboxManager();
const tool = createJaitTerminalTool({} as SurfaceRegistry, manager);
let projectRoot: string;
let containerName: string;
let context: ToolContext;
const __jait_hook_802 = async () => {
    const artifacts = resolve(__jait_original_dir, "../../../../.jait/artifacts/sandbox-background");
    await mkdir(artifacts, { recursive: true });
    projectRoot = await mkdtemp(join(artifacts, "docker-"));
    const session = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
    containerName = session.containerName;
    context = { sessionId: "docker-test", actionId: "action", requestedBy: "test", projectRoot, sandboxContainerName: containerName };
  };
const __jait_hook_1310 = async () => {
    backgroundCommandMonitor.clearForTests();
    if (containerName) await manager.stopContainer(containerName);
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_802();
try {
await (async()=>{

    const result = await tool.execute({
      sandbox: true, isBackground: true,
      command: "printf '%s\\n' '$(echo literal)' '`echo also-literal`'\nprintf 'container=%s\\n' \"$PWD\"\nexit 9",
    }, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
    const output = (result.data as { output: string }).output;
    __jait_capture(2, (output));
    __jait_capture(3, (output));
    __jait_capture(4, (output));
    __jait_capture(5, (output));
  
})();

} finally {
await __jait_hook_1310();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_integration_test_ts_88_3": {


/*__jait_source_gate__ skipIf process.env["JAIT_TEST_DOCKER"] !== "1" */
/*__jait_scope_open__*/{
const manager = new SandboxManager();
const tool = createJaitTerminalTool({} as SurfaceRegistry, manager);
let projectRoot: string;
let containerName: string;
let context: ToolContext;
const __jait_hook_802 = async () => {
    const artifacts = resolve(__jait_original_dir, "../../../../.jait/artifacts/sandbox-background");
    await mkdir(artifacts, { recursive: true });
    projectRoot = await mkdtemp(join(artifacts, "docker-"));
    const session = await manager.startCommandSandbox({ projectRoot, networkEnabled: false });
    containerName = session.containerName;
    context = { sessionId: "docker-test", actionId: "action", requestedBy: "test", projectRoot, sandboxContainerName: containerName };
  };
const __jait_hook_1310 = async () => {
    backgroundCommandMonitor.clearForTests();
    if (containerName) await manager.stopContainer(containerName);
    if (projectRoot) await rm(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_802();
try {
await (async()=>{

    const abort = new AbortController();
    const result = await tool.execute({
      sandbox: true, isBackground: true, timeout: 15000,
      command: "id -u; echo owned > owned.txt; sleep 10",
    }, { ...context, sandboxContainerName: undefined, signal: abort.signal });
    __jait_capture(0, (result.data));
    const { stat } = await import("node:fs/promises");
    __jait_capture(1, ((await stat(join(projectRoot, "owned.txt"))).uid), (process.getuid!()));
    abort.abort();
    await new Promise(resolve => setTimeout(resolve, 2500));
    __jait_capture(2, (backgroundCommandMonitor.activeCount));
  
})();

} finally {
await __jait_hook_1310();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
