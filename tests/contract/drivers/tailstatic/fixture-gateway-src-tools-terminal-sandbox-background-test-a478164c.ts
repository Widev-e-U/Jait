// Translated fixture from packages/gateway/src/tools/terminal-sandbox-background.test.ts; expected literals are in tail_static.rs.
import type { SandboxManager, SandboxRunResult } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createJaitTerminalTool } from "../../../../packages/gateway/src/tools/terminal-tools.js";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/terminal-sandbox-background.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_15_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const completion = new Promise(resolve => { finish = resolve; });
    const manager = {
      execInContainer: vi.fn(() => new Promise(() => {})),
      startBackgroundCommand: vi.fn(() => ({
        containerName: context.sandboxContainerName, output: "server listening",
        completion, stop: vi.fn(), onOutput: vi.fn(() => () => {}),
      })),
    };
    const notify = vi.fn();
    const unregister = backgroundCommandMonitor.setCompletionHandler(notify);
    try {
      const tool = createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager);
      let result: Awaited<ReturnType<typeof tool.execute>> | undefined;
      const pending = tool.execute({ command: "bun run dev", sandbox: true, isBackground: true }, context)
        .then(value => { result = value; });
      await vi.advanceTimersByTimeAsync(5000);
      __jait_captureType(0, (result));
      __jait_capture(1, (result!.data));
      __jait_capture(2, (notify.mock.calls));
      finish({ ok: false, output: "server stopped", exitCode: 7, timedOut: false, containerName: context.sandboxContainerName });
      await pending;
      await vi.advanceTimersByTimeAsync(0);
      __jait_capture(3, (notify.mock.calls));
      __jait_capture(4, (notify.mock.calls[0]![0]), ({ sessionId: context.sessionId, exitCode: 7, output: "server stopped" }));
    } finally {
      unregister();
    }
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_60_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{
function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

try {
await (async()=>{

    const { tool } = fixture({ ok: false, output: "port in use", exitCode: 1, timedOut: false, containerName: "jait-agent-sb-test" });
    const notify = vi.fn();
    const unregister = backgroundCommandMonitor.setCompletionHandler(notify);
    try {
      const result = await tool.execute({ command: "server", sandbox: true, isBackground: true }, context);
      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.data));
      __jait_capture(2, (notify.mock.calls));
    } finally { unregister(); }
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_72_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{
function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

try {
await (async()=>{

    vi.useFakeTimers();
    const { tool, manager, finish } = fixture();
    const notify = vi.fn();
    backgroundCommandMonitor.setCompletionHandler(notify);
    const pending = tool.execute({ command: "build", sandbox: true, yieldTimeMs: 20 }, context);
    await vi.advanceTimersByTimeAsync(20);
    const result = await pending;
    __jait_capture(0, (result.data), ({ isBackground: true, executionId: context.actionId, output: "booting" }));
    __jait_capture(1, (manager.startBackgroundCommand.mock.calls));
    __jait_capture(2, (manager.execInContainer.mock.calls));
    finish({ ok: true, output: "built", exitCode: 0, timedOut: false, containerName: context.sandboxContainerName! });
    await vi.advanceTimersByTimeAsync(0);
    __jait_capture(3, (notify.mock.calls));
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_88_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{
function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

try {
await (async()=>{

    const { tool, manager } = fixture({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "one-shot" });
    await tool.execute({ command: "cat /repo/file", sandbox: true, sandboxMountMode: "read-only", isBackground: true }, { ...context, sandboxContainerName: undefined });
    __jait_capture(0, (manager.startBackgroundCommand.mock.calls));
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_97_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{
function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

try {
await (async()=>{

    const { tool, manager } = fixture();
    const abort = new AbortController(); abort.abort();
    const result = await tool.execute({ command: "server", sandbox: true, isBackground: true }, { ...context, signal: abort.signal });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (manager.startBackgroundCommand.mock.calls));
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_105_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{
function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

try {
await (async()=>{

    vi.useFakeTimers();
    const { tool, stop } = fixture();
    const abort = new AbortController();
    const pending = tool.execute({ command: "server", sandbox: true, isBackground: true }, { ...context, signal: abort.signal });
    abort.abort();
    const result = await pending;
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (stop.mock.calls));
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_terminal_sandbox_background_test_ts_117_3": {


const context: ToolContext = {
  sessionId: "sandbox-session", actionId: "action", requestedBy: "user",
  projectRoot: "/repo", sandboxContainerName: "jait-agent-sb-test",
};
const __jait_hook_589 = () => { backgroundCommandMonitor.clearForTests(); vi.useRealTimers(); };
/*__jait_scope_open__*/{
function fixture(completed?: { ok: boolean; output: string; exitCode: number; timedOut: boolean; containerName: string }) {
    let finish!: (value: SandboxRunResult) => void;
    const completion = completed ? Promise.resolve(completed) : new Promise<SandboxRunResult>(resolve => { finish = resolve; });
    const stop = vi.fn(async () => {});
    const manager = {
      startBackgroundCommand: vi.fn(() => ({ containerName: "jait-agent-sb-test", output: "booting", completion, stop, onOutput: vi.fn(() => () => {}) })),
      execInContainer: vi.fn(async () => ({ ok: true, output: "done", exitCode: 0, timedOut: false, containerName: "jait-agent-sb-test" })),
    };
    return { tool: createJaitTerminalTool({} as SurfaceRegistry, manager as unknown as SandboxManager), manager, stop, finish };
  }

try {
await (async()=>{

    vi.useFakeTimers();
    const { tool, stop, finish } = fixture();
    const notify = vi.fn();
    const unregister = backgroundCommandMonitor.setCompletionHandler(notify);
    try {
      const pending = tool.execute({ command: "server", sandbox: true, isBackground: true }, context);
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      backgroundCommandMonitor.stopForSession(context.sessionId);
      __jait_capture(0, (stop.mock.calls));
      finish({ ok: false, exitCode: 143, output: "stopped", timedOut: false, containerName: "jait-agent-sb-test" });
      await vi.advanceTimersByTimeAsync(0);
      __jait_capture(1, (notify.mock.calls));
      __jait_capture(2, (backgroundCommandMonitor.activeCount));
    } finally { unregister(); }
  
})();

} finally {
await __jait_hook_589();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
