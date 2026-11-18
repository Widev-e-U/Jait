// Translated fixture from packages/gateway/src/security/agent-sandbox-lifecycle.test.ts; expected literals are in tail_static.rs.
import { fileURLToPath } from "node:url";
import { commandSandboxOwner, commandSandboxOwnerAlive } from "../../../../packages/gateway/src/security/agent-sandbox-owner.js";
import { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import { JaitProvider } from "../../../../packages/gateway/src/providers/jait-provider.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/agent-sandbox-lifecycle.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_10_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    __jait_capture(0, (commandSandboxOwnerAlive(commandSandboxOwner())));
    __jait_capture(1, (commandSandboxOwnerAlive("unknown")));
    __jait_capture(2, (commandSandboxOwnerAlive("-1::")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_15_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const runtime = vi.fn(async (_cmd: string[], _timeout: number) => ok("id"));
    const manager = new SandboxManager(runtime);
    await manager.startCommandSandbox({ projectRoot: fileURLToPath(new URL("../../../../", __jait_original_url)), sessionId: "session", threadId: "thread" });
    const cmd = runtime.mock.calls[0]![0] as string[];
    __jait_capture(0, (cmd));
    __jait_capture(1, (cmd));
    __jait_capture(2, (cmd));
    __jait_capture(3, (cmd.some(arg => arg.startsWith("dev.jait.gateway="))));
    __jait_capture(4, (cmd.some(arg => arg.startsWith("dev.jait.owner="))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_27_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const runtime = vi.fn(async (cmd: string[]) => {
      if (cmd[1] === "ps") return ok([
        { name: "jait-agent-sb-dead", owner: "dead" },
        { name: "jait-agent-sb-live", owner: "live" },
        { name: "jait-agent-sb-busy", owner: "dead" },
        { name: "jait-agent-sb-legacy", owner: "" },
        { name: "database", owner: "dead" },
      ].map(row => JSON.stringify(row)).join("\n"));
      if (cmd[1] === "top") return ok(cmd[2] === "jait-agent-sb-busy" ? "PID COMMAND\n123 tail -f /dev/null\n124 node server.js" : "PID COMMAND\n123 tail -f /dev/null");
      return ok();
    });
    const manager = new SandboxManager(runtime);
    __jait_capture(0, (await manager.cleanupOrphanedCommandSandboxes(owner => owner === "live")));
    const list = runtime.mock.calls.find(([cmd]) => cmd[1] === "ps")![0];
    __jait_capture(1, (list.some(arg => arg.startsWith("label=dev.jait.gateway="))));
    __jait_capture(2, (runtime.mock.calls.filter(([cmd]) => cmd[1] === "rm").map(([cmd]) => cmd.at(-1))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_46_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const manager = new SandboxManager(async () => ({ output: "unavailable", exitCode: 1, timedOut: false }));
    __jait_capture(0, (await manager.isCommandSandboxIdle("jait-agent-sb-test")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_64_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const { provider, manager, state } = fixture();
    await provider.reapIdleSandboxes(100, 101);
    __jait_capture(0, (manager.stopContainer.mock.calls));
    __jait_capture(1, ((provider as any).sessions.has("session")));
    __jait_captureType(2, (state.sandboxContainerName));
    __jait_capture(3, (await (provider as any).ensureThreadSandbox(state)));
    __jait_capture(4, (manager.startCommandSandbox.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_74_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const { provider, manager, state } = fixture();
    (state as any).currentTurn = Promise.resolve();
    await provider.reapIdleSandboxes(100, 101);
    __jait_capture(0, (manager.isCommandSandboxIdle.mock.calls));
    (state as any).currentTurn = undefined;
    manager.isCommandSandboxIdle.mockResolvedValue(false);
    await provider.reapIdleSandboxes(100, 101);
    __jait_capture(1, (manager.stopContainer.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_85_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const { provider, manager, state } = fixture();
    manager.isCommandSandboxIdle.mockImplementation(async () => { (state as any).currentTurn = Promise.resolve(); return true; });
    await provider.reapIdleSandboxes(100, 101);
    __jait_capture(0, (manager.stopContainer.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_92_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const { provider, manager, state } = fixture();
    manager.stopContainer.mockRejectedValueOnce(new Error("Docker unavailable"));
    await provider.reapIdleSandboxes(100, 101);
    __jait_capture(0, (state.sandboxContainerName));
    await provider.reapIdleSandboxes(100, 101);
    __jait_captureType(1, (state.sandboxContainerName));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_100_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const { provider, manager } = fixture();
    manager.stopContainer.mockRejectedValueOnce(new Error("unavailable"));
    await provider.stopSession("session");
    __jait_capture(0, ((provider as any).sessions.size));
    await provider.reapIdleSandboxes();
    __jait_capture(1, (manager.stopContainer.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_109_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    const { provider, manager, state } = fixture();
    let release!: () => void;
    manager.stopContainer.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const reaping = provider.reapIdleSandboxes(100, 101);
    await vi.waitFor(() => __jait_capture(0, (manager.stopContainer.mock.calls)));
    const next = (provider as any).ensureThreadSandbox(state);
    __jait_capture(1, (manager.startCommandSandbox.mock.calls));
    release();
    await reaping;
    __jait_capture(2, (await next));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_agent_sandbox_lifecycle_test_ts_122_3": {


const ok = (output = "") => ({ output, exitCode: 0, timedOut: false });
/*__jait_scope_open__*/{
function fixture() {
    const manager = {
      startCommandSandbox: vi.fn(async () => ({ containerName: "jait-agent-sb-new", projectRoot: "/repo", sandboxProjectRoot: "/project" })),
      stopContainer: vi.fn(async () => {}),
      isCommandSandboxIdle: vi.fn(async () => true),
    };
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, sandboxManager: manager });
    const state = { session: { id: "session", status: "running" }, threadId: "thread", workingDirectory: "/repo",
      sandboxContainerName: "jait-agent-sb-old", sandboxStart: Promise.resolve("jait-agent-sb-old"), sandboxLastUsedAt: 0 };
    (provider as any).sessions.set("session", state);
    return { provider, manager, state };
  }

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const { provider, manager } = fixture();
      provider.startSandboxMaintenance();
      provider.startSandboxMaintenance();
      __jait_capture(0, (vi.getTimerCount()));
      await provider.dispose();
      __jait_capture(1, (manager.stopContainer.mock.calls));
      __jait_capture(2, (vi.getTimerCount()));
      provider.startSandboxMaintenance();
      __jait_capture(3, (vi.getTimerCount()));
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
