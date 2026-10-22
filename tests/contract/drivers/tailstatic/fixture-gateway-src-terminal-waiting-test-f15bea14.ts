// Translated fixture from packages/gateway/src/terminal-waiting.test.ts; expected literals are in tail_static.rs.
import { createTerminalRunTool, getManagedTerminalExecution } from "../../../../packages/gateway/src/tools/terminal-tools.js";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { TerminalSurfaceFactory, type TerminalSurface } from "../../../../packages/gateway/src/surfaces/terminal.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/terminal-waiting.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_38_3": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    const env = setup();
    let returned = false;
    const run = env.run(true).then(result => { returned = true; return result; });
    await vi.advanceTimersByTimeAsync(20);
    __jait_capture(0, (returned));
    env.emit("Listening on http://localhost:5173\r\n");
    await vi.advanceTimersByTimeAsync(1000);
    __jait_capture(1, ((await run).data));
    __jait_capture(2, (env.notify.mock.calls));
  
})();

} finally {
await __jait_hook_1599();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_51_3": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    const env = setup();
    const run = env.run(true);
    await vi.advanceTimersByTimeAsync(20);
    env.emit("startup failed\r\n\x1b]633;D;1\x07\x1b]633;B\x07");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await run;
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
    __jait_capture(2, (env.notify.mock.calls));
    __jait_captureType(3, (getManagedTerminalExecution("term-waiting")));
  
})();

} finally {
await __jait_hook_1599();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_65_3": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    const env = setup();
    const run = env.run(false, 100);
    await vi.advanceTimersByTimeAsync(20);
    env.emit("building first stage\r\n");
    await vi.advanceTimersByTimeAsync(600);
    const result = await run;
    __jait_capture(0, (env.writes.some(value => value.includes("\x03"))));
    __jait_capture(1, (result.data));
    __jait_capture(2, (getManagedTerminalExecution("term-waiting")));
    env.emit("build complete\r\n\x1b]633;D;0\x07\x1b]633;B\x07");
    await vi.advanceTimersByTimeAsync(100);
    __jait_capture(3, (env.notify.mock.calls));
    __jait_capture(4, (env.notify.mock.calls[0]![0]));
    __jait_capture(5, (env.notify.mock.calls[0]![0].output));
    __jait_captureType(6, (getManagedTerminalExecution("term-waiting")));
  
})();

} finally {
await __jait_hook_1599();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_89_1": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};

try {
await (async()=>{

  const registry = new SurfaceRegistry();
  registry.register(new TerminalSurfaceFactory());
  const tool = createTerminalRunTool(registry);
  let terminalId: string | undefined;
  const completion = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(completion);
  try {
    const result = await tool.execute({
      command: `node -e "console.log('stage-one');setTimeout(()=>console.log('stage-two'),500)"`,
      yieldTimeMs: 100,
    }, { sessionId: "s-real-wait", actionId: "a-real-wait", projectRoot: process.cwd(), requestedBy: "test" });
    terminalId = (result.data as { terminalId: string }).terminalId;
    __jait_capture(0, (result.data));
    await vi.waitFor(() => __jait_capture(1, (completion.mock.calls)), { timeout: 5000 });
    __jait_capture(2, (completion.mock.calls[0]![0]));
    __jait_capture(3, (completion.mock.calls[0]![0].output));
  } finally {
    if (terminalId) await registry.stopSurface(terminalId);
  }

})();

} finally {
await __jait_hook_1599();
}


break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_113_1": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};

try {
await (async()=>{

  vi.useFakeTimers();
  const { createTerminalExecutionTool } = await import("../../../../packages/gateway/src/tools/terminal-execution.js");
  const env = setup();
  const run = env.run(false, 20);
  await vi.advanceTimersByTimeAsync(25);
  const result = await run;
  const ids = result.data as { terminalId: string; executionId: string };
  const tool = createTerminalExecutionTool();
  const context = { sessionId: "s-waiting", actionId: "inspect", projectRoot: process.cwd(), requestedBy: "test" };
  env.emit("still building\r\n");
  __jait_capture(0, ((await tool.execute({ ...ids, action: "inspect" }, { ...context, sessionId: "other" })).ok));
  __jait_capture(1, ((await tool.execute({ ...ids, executionId: "stale", action: "cancel" }, context)).ok));
  __jait_capture(2, ((await tool.execute({ ...ids, action: "inspect" }, context)).data));
  __jait_capture(3, ((await tool.execute({ ...ids, action: "cancel" }, context)).data));
  __jait_capture(4, (env.writes.filter(x => x === "STOP")));
  env.emit("\x1b]633;D;0\x07");
  __jait_capture(5, (env.notify.mock.calls));
  __jait_capture(6, ((await tool.execute({ ...ids, action: "inspect" }, context)).data));

})();

} finally {
await __jait_hook_1599();
}


break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_134_1": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};

try {
await (async()=>{

  const env = setup();
  // setup's command is valid; this fixture directly exercises dispatch of malformed input.
  const writes: string[] = [];
  const surface = { id: "syntax", type: "terminal", state: "running", touch() {}, write(s: string) { writes.push(s); }, snapshot() { return { metadata: { shell: "/bin/bash" } }; } };
  const tool = createTerminalRunTool({ getSurface: () => surface } as unknown as SurfaceRegistry);
  const result = await tool.execute({ command: 'printf "unfinished', terminalId: "syntax" },
    { sessionId: "syntax", actionId: "syntax", projectRoot: process.cwd(), requestedBy: "test" });
  __jait_capture(0, (result.ok));
  __jait_capture(1, (result.data));
  __jait_capture(2, (writes));
  __jait_capture(3, (env.notify.mock.calls));

})();

} finally {
await __jait_hook_1599();
}


break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_148_1": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};

try {
await (async()=>{

  vi.useFakeTimers();
  const env = setup();
  const run = env.run(true, 1000, 20);
  await vi.advanceTimersByTimeAsync(25);
  const result = await run;
  __jait_capture(0, (result.ok));
  __jait_capture(1, (result.data));
  __jait_capture(2, (env.writes.filter(x => x === "STOP")));
  __jait_capture(3, (env.notify.mock.calls));

})();

} finally {
await __jait_hook_1599();
}


break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_160_1_each0": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};
/*__jait_scope_open__*/{
const isBackground = false;

try {
await (async()=>{

  const abort = new AbortController();
  const writes: string[] = [];
  const listeners = new Set<(s: string) => void>();
  const surface = { id: "cancel-env", type: "terminal", state: "running", shellIntegrationReady: true,
    touch() {}, snapshot() { return { metadata: { shell: "/bin/bash" } }; },
    addOutputListener(f: (s: string) => void) { listeners.add(f); }, removeOutputListener(f: (s: string) => void) { listeners.delete(f); },
    write(s: string) { writes.push(s); } };
  const registry = { getSurface: () => surface, stopSurface: async () => {} } as unknown as SurfaceRegistry;
  const tool = createTerminalRunTool(registry, undefined, undefined, undefined, async () => { abort.abort(); return {}; });
  const result = await tool.execute({ command: "build-app", terminalId: surface.id, isBackground },
    { sessionId: "cancel-env", actionId: "cancel-env", projectRoot: process.cwd(), requestedBy: "test", signal: abort.signal });
  __jait_capture(0, (result.ok));
  __jait_capture(1, (writes.every(s => !s.includes("build-app"))));
  __jait_capture(2, (backgroundCommandMonitor.activeCount));
  __jait_capture(3, (listeners.size));

})();

} finally {
await __jait_hook_1599();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_160_1_each1": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};
/*__jait_scope_open__*/{
const isBackground = true;

try {
await (async()=>{

  const abort = new AbortController();
  const writes: string[] = [];
  const listeners = new Set<(s: string) => void>();
  const surface = { id: "cancel-env", type: "terminal", state: "running", shellIntegrationReady: true,
    touch() {}, snapshot() { return { metadata: { shell: "/bin/bash" } }; },
    addOutputListener(f: (s: string) => void) { listeners.add(f); }, removeOutputListener(f: (s: string) => void) { listeners.delete(f); },
    write(s: string) { writes.push(s); } };
  const registry = { getSurface: () => surface, stopSurface: async () => {} } as unknown as SurfaceRegistry;
  const tool = createTerminalRunTool(registry, undefined, undefined, undefined, async () => { abort.abort(); return {}; });
  const result = await tool.execute({ command: "build-app", terminalId: surface.id, isBackground },
    { sessionId: "cancel-env", actionId: "cancel-env", projectRoot: process.cwd(), requestedBy: "test", signal: abort.signal });
  __jait_capture(0, (result.ok));
  __jait_capture(1, (writes.every(s => !s.includes("build-app"))));
  __jait_capture(2, (backgroundCommandMonitor.activeCount));
  __jait_capture(3, (listeners.size));

})();

} finally {
await __jait_hook_1599();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_waiting_test_ts_178_1": {


function setup() {
  const listeners = new Set<(data: string) => void>();
  const writes: string[] = [];
  const surface = {
    id: "term-waiting", type: "terminal", state: "running",
    shellIntegrationReady: true,
    touch() {},
    addOutputListener(cb: (data: string) => void) { listeners.add(cb); },
    removeOutputListener(cb: (data: string) => void) { listeners.delete(cb); },
    write(data: string) { writes.push(data); },
    snapshot() { return { metadata: { shell: "/bin/bash" } }; },
  } as unknown as TerminalSurface;
  const tool = createTerminalRunTool({ getSurface: () => surface, stopSurface: async () => { writes.push("STOP"); } } as unknown as SurfaceRegistry);
  const notify = vi.fn();
  backgroundCommandMonitor.setCompletionHandler(notify);
  return {
    writes, notify,
    emit(data: string) { for (const cb of [...listeners]) cb(data); },
    run(isBackground: boolean, timeout = 1000, executionTimeout?: number) {
      return tool.execute({ command: "build-app", terminalId: surface.id, isBackground, yieldTimeMs: timeout, timeout: executionTimeout },
        { sessionId: "s-waiting", actionId: "a-waiting", projectRoot: process.cwd(), requestedBy: "test" });
    },
  };
}
const __jait_hook_1599 = () => {
  backgroundCommandMonitor.clearForTests();
  vi.useRealTimers();
};

try {
await (async()=>{

  const registry = new SurfaceRegistry();
  registry.register(new TerminalSurfaceFactory());
  const tool = createTerminalRunTool(registry);
  const result = await tool.execute({ command: "exit 7", yieldTimeMs: 2000 },
    { sessionId: "shell-exit", actionId: "shell-exit", projectRoot: process.cwd(), requestedBy: "test" });
  __jait_capture(0, (result.ok));
  __jait_capture(1, (result.data));

})();

} finally {
await __jait_hook_1599();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
