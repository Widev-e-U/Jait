// Translated fixture from packages/gateway/src/providers/jait-provider.test.ts; expected literals are in tail_static.rs.

import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import type { ProviderEvent } from "../../../../packages/gateway/src/providers/contracts.js";

import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/jait-provider.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_19_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    __jait_capture(0, (prepareJaitThreadSandboxToolInput("execute", {
      command: "bun test",
      explanation: "Run tests",
    })));

    __jait_capture(1, (prepareJaitThreadSandboxToolInput("terminal.run", {
      command: "git status",
      sandbox: false,
    })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_40_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    const input = { path: "packages/gateway/src/providers/jait-provider.ts" };
    __jait_capture(0, (prepareJaitThreadSandboxToolInput("file.read", input)), (input));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_47_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    runAgentLoopMock.mockResolvedValueOnce({ content: "ok", executedToolCalls: [] });
    const provider = new JaitProvider({
      config: {
        openaiApiKey: "test",
        openaiBaseUrl: "http://localhost:11434/v1",
        openaiModel: "test",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "test",
        ollamaContextWindow: 0,
        agentMaxRounds: 0,
      } as any,
      threadService: { getById: () => ({ userId: "user-1" }) } as any,
      userService: {
        getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }),
      } as any,
    });

    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: "/repo-worktree",
      mode: "full-access",
      reasoningEffort: "high",
    });
    await provider.sendTurn(session.id, "test");

    __jait_capture(0, (runAgentLoopMock.mock.calls));
    __jait_capture(1, (runAgentLoopMock.mock.calls[0]?.[0].auth.reasoningEffort));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_79_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    const emitted: ProviderEvent[] = [];
    let serializedContextBytes = 0;
    runAgentLoopMock.mockImplementationOnce(async (options) => {
      for (let round = 1; round <= 40; round++) {
        options.onContext?.({
          round,
          createdAt: new Date().toISOString(),
          model: "test",
          messages: [{ role: "assistant", content: "x".repeat(8_000) }],
        });
      }
      return { content: "ok", executedToolCalls: [] };
    });
    const provider = new JaitProvider({
      config: {
        openaiApiKey: "test",
        openaiBaseUrl: "http://localhost:11434/v1",
        openaiModel: "test",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "test",
        ollamaContextWindow: 0,
        agentMaxRounds: 0,
      } as any,
      threadService: { getById: () => ({ userId: "user-1" }) } as any,
      userService: {
        getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }),
      } as any,
    });
    provider.onEvent((event) => {
      emitted.push(event);
      if (event.type === "activity" && event.kind === "context_flow") {
        serializedContextBytes += Buffer.byteLength(JSON.stringify(event), "utf8");
      }
    });

    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: "/repo-worktree",
      mode: "full-access",
    });
    await provider.sendTurn(session.id, "test");

    const contextEvents = emitted.filter(
      (event) => event.type === "activity" && event.kind === "context_flow",
    );
    __jait_capture(0, (contextEvents));
    __jait_capture(1, (serializedContextBytes));
    __jait_capture(2, (contextEvents[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_139_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    let release!: () => void;
    const currentTurn = new Promise<void>(resolve => { release = resolve; });
    const stopContainer = vi.fn(async () => {});
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any,
      sandboxManager: { startCommandSandbox: vi.fn(), stopContainer } });
    const events: ProviderEvent[] = [];
    provider.onEvent(event => events.push(event));
    const abort = new AbortController();
    (provider as any).sessions.set("blocked-session", {
      session: { id: "blocked-session", status: "running" },
      currentTurn, currentTurnAbort: abort, sandboxContainerName: "blocked-sandbox",
    });
    const stop = provider.stopSession("blocked-session");
    try {
      const outcome = await Promise.race([stop.then(() => "stopped"), new Promise(resolve => setTimeout(() => resolve("blocked"), 100))]);
      __jait_capture(0, (outcome));
      __jait_capture(1, (abort.signal.aborted));
      __jait_capture(2, (stopContainer.mock.calls));
      __jait_capture(3, ((provider as any).sessions.has("blocked-session")));
      (provider as any).emit({ type: "token", sessionId: "blocked-session", content: "late" });
      __jait_capture(4, (events.map(event => event.type)));
    } finally { release(); await stop; }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_164_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    const starts: string[] = [];
    const stops: string[] = [];
    const executions: Array<{ toolName: string; input: unknown; context: ToolContext }> = [];
    const provider = new JaitProvider({
      config: {} as any,
      threadService: { getById: () => undefined } as any,
      toolRegistry: {} as any,
      sandboxManager: {
        startCommandSandbox: async (options) => {
          starts.push(options.projectRoot);
          return {
            containerName: "jait-agent-sb-test",
            projectRoot: options.projectRoot,
            sandboxProjectRoot: "/project",
          };
        },
        stopContainer: async (containerName) => {
          stops.push(containerName);
        },
      },
      toolExecutor: async (toolName, input, context) => {
        executions.push({ toolName, input, context });
        return { ok: true, message: "ok" };
      },
    });

    (provider as any).sessions.set("session-1", {
      session: {
        id: "session-1",
        providerId: "jait",
        threadId: "thread-1",
        status: "running",
        startedAt: "2026-05-03T00:00:00.000Z",
      },
      threadId: "thread-1",
      workingDirectory: "/repo-worktree",
      history: [],
    });

    await (provider as any).executeTool(
      "terminal.run",
      { command: "pwd", sandbox: false },
      "session-1",
      undefined,
      undefined,
      undefined,
      "/repo-worktree",
    );
    await (provider as any).executeTool(
      "execute",
      { command: "ls", explanation: "List files" },
      "session-1",
      undefined,
      undefined,
      undefined,
      "/repo-worktree",
    );

    __jait_capture(0, (starts));
    __jait_capture(1, (executions[0].input));
    __jait_capture(2, (executions[0].context.sandboxContainerName));
    __jait_capture(3, (executions[1].context.sandboxContainerName));

    await provider.stopSession("session-1");
    __jait_capture(4, (stops));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_252_3_each0": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function setup(kind = "delivery") {
    const events: ProviderEvent[] = [];
    const executor = vi.fn(async (_name: string, _input: unknown, _context: ToolContext) => ({ ok: true, message: "Posted." }));
    const provider = new JaitProvider({
      config: { openaiBaseUrl: "http://localhost:11434/v1", openaiModel: "test", ollamaUrl: "http://localhost:11434", ollamaModel: "test", ollamaContextWindow: 0 } as any,
      userService: { getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }) } as any,
      threadService: { getById: () => ({ userId: "user-1", kind }) } as any,
      toolRegistry: new ToolRegistry(),
      toolExecutor: executor,
    });
    provider.onEvent(event => events.push(event));
    return { provider, events, executor };
  }
/*__jait_scope_open__*/{
const kind = "delivery";
await __jait_hook_556();
try {
await (async()=>{

    const { provider, events, executor } = setup(kind);
    executor.mockImplementation(async (_name, input: any) => ({ ok: true, message: `fact ${input.index}` }));
    runAgentLoopMock.mockImplementation(async (options, execute) => {
      __jait_capture(0, (options.continuous));
      for (let index = 0; index < 125; index++) {
        await execute("file.read", { index }, options.sessionId, options.auth);
        if (options.abort.signal.aborted) break;
      }
      return { content: "done", executedToolCalls: [] };
    });
    const session = await provider.startSession({ threadId: "persistent-thread", workingDirectory: "/repo-worktree", mode: "full-access" });
    await provider.sendTurn(session.id, "Continue progressing");
    if (kind === "delivery") {
      __jait_capture(1, (executor.mock.calls));
      __jait_capture(2, (events.filter(event => event.type === "turn.completed")));
      await provider.sendTurn(session.id, "Continue the next item");
      __jait_capture(3, (executor.mock.calls));
      __jait_capture(4, (events.filter(event => event.type === "turn.completed")));
    } else {
      __jait_capture(5, (executor.mock.calls));
      __jait_capture(6, (events.filter(event => event.type === "turn.completed")));
      __jait_capture(7, (events), ({ type: "session.error", sessionId: session.id,
        error: "Execution stopped at 120 tool calls. Review the checkpoint before resuming." }));
    }
  
})();
__jait_record({slot:8,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_252_3_each1": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function setup(kind = "delivery") {
    const events: ProviderEvent[] = [];
    const executor = vi.fn(async (_name: string, _input: unknown, _context: ToolContext) => ({ ok: true, message: "Posted." }));
    const provider = new JaitProvider({
      config: { openaiBaseUrl: "http://localhost:11434/v1", openaiModel: "test", ollamaUrl: "http://localhost:11434", ollamaModel: "test", ollamaContextWindow: 0 } as any,
      userService: { getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }) } as any,
      threadService: { getById: () => ({ userId: "user-1", kind }) } as any,
      toolRegistry: new ToolRegistry(),
      toolExecutor: executor,
    });
    provider.onEvent(event => events.push(event));
    return { provider, events, executor };
  }
/*__jait_scope_open__*/{
const kind = "delegation";
await __jait_hook_556();
try {
await (async()=>{

    const { provider, events, executor } = setup(kind);
    executor.mockImplementation(async (_name, input: any) => ({ ok: true, message: `fact ${input.index}` }));
    runAgentLoopMock.mockImplementation(async (options, execute) => {
      __jait_capture(0, (options.continuous));
      for (let index = 0; index < 125; index++) {
        await execute("file.read", { index }, options.sessionId, options.auth);
        if (options.abort.signal.aborted) break;
      }
      return { content: "done", executedToolCalls: [] };
    });
    const session = await provider.startSession({ threadId: "persistent-thread", workingDirectory: "/repo-worktree", mode: "full-access" });
    await provider.sendTurn(session.id, "Continue progressing");
    if (kind === "delivery") {
      __jait_capture(1, (executor.mock.calls));
      __jait_capture(2, (events.filter(event => event.type === "turn.completed")));
      await provider.sendTurn(session.id, "Continue the next item");
      __jait_capture(3, (executor.mock.calls));
      __jait_capture(4, (events.filter(event => event.type === "turn.completed")));
    } else {
      __jait_capture(5, (executor.mock.calls));
      __jait_capture(6, (events.filter(event => event.type === "turn.completed")));
      __jait_capture(7, (events), ({ type: "session.error", sessionId: session.id,
        error: "Execution stopped at 120 tool calls. Review the checkpoint before resuming." }));
    }
  
})();
__jait_record({slot:8,completed:true});
} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_279_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function setup(kind = "delivery") {
    const events: ProviderEvent[] = [];
    const executor = vi.fn(async (_name: string, _input: unknown, _context: ToolContext) => ({ ok: true, message: "Posted." }));
    const provider = new JaitProvider({
      config: { openaiBaseUrl: "http://localhost:11434/v1", openaiModel: "test", ollamaUrl: "http://localhost:11434", ollamaModel: "test", ollamaContextWindow: 0 } as any,
      userService: { getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }) } as any,
      threadService: { getById: () => ({ userId: "user-1", kind }) } as any,
      toolRegistry: new ToolRegistry(),
      toolExecutor: executor,
    });
    provider.onEvent(event => events.push(event));
    return { provider, events, executor };
  }
await __jait_hook_556();
try {
await (async()=>{

    const { provider, executor } = setup();
    const session = await provider.startSession({ threadId: "persistent-thread", workingDirectory: "/tmp", mode: "supervised" });
    await (provider as any).executeTool("team.chat", { action: "send" }, session.id, { userId: "user-1" }, undefined, undefined, "/tmp");
    __jait_capture(0, (executor.mock.calls[0]?.[2]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_286_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function setup(kind = "delivery") {
    const events: ProviderEvent[] = [];
    const executor = vi.fn(async (_name: string, _input: unknown, _context: ToolContext) => ({ ok: true, message: "Posted." }));
    const provider = new JaitProvider({
      config: { openaiBaseUrl: "http://localhost:11434/v1", openaiModel: "test", ollamaUrl: "http://localhost:11434", ollamaModel: "test", ollamaContextWindow: 0 } as any,
      userService: { getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }) } as any,
      threadService: { getById: () => ({ userId: "user-1", kind }) } as any,
      toolRegistry: new ToolRegistry(),
      toolExecutor: executor,
    });
    provider.onEvent(event => events.push(event));
    return { provider, events, executor };
  }
await __jait_hook_556();
try {
await (async()=>{

    runAgentLoopMock.mockImplementationOnce(async (options) => {
      options.onEvent({ type: "error", message: "Provider quota exhausted", status: 429 });
      return { content: "", executedToolCalls: [] };
    });
    const { provider, events } = setup();
    const session = await provider.startSession({ threadId: "persistent-thread", workingDirectory: "/tmp", mode: "supervised" });
    await provider.sendTurn(session.id, "Implement the fix");
    __jait_capture(0, (events.filter(event => event.type === "turn.completed")));
    __jait_capture(1, (events), ({ type: "session.error", sessionId: session.id, error: "Provider quota exhausted" }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_314_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function registryStub(message: string, names: string[] = []) {
    return {
      execute: vi.fn(async () => ({ ok: true, message })),
      list: vi.fn(() => names.map(name => ({ name }))),
      listNames: vi.fn(() => names),
    } as any;
  }
await __jait_hook_556();
try {
await (async()=>{

    const early = registryStub("early");
    const late = registryStub("late");
    const provider = new JaitProvider({
      config: {} as any,
      threadService: {} as any,
      toolRegistry: early,
      getToolRegistry: () => late,
    });

    const result = await (provider as any).executeTool(
      "agent.github", { action: "status" }, "session-1", undefined, undefined, undefined, "/tmp",
    );

    __jait_capture(0, (late.execute.mock.calls));
    __jait_capture(1, (early.execute.mock.calls));
    __jait_capture(2, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_333_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function registryStub(message: string, names: string[] = []) {
    return {
      execute: vi.fn(async () => ({ ok: true, message })),
      list: vi.fn(() => names.map(name => ({ name }))),
      listNames: vi.fn(() => names),
    } as any;
  }
await __jait_hook_556();
try {
await (async()=>{

    runAgentLoopMock.mockResolvedValueOnce({ content: "ok", executedToolCalls: [] });
    const early = new ToolRegistry();
    const late = new ToolRegistry();
    // Core tier keeps the tool in the initial payload, mirroring the real drift:
    // tools registered on the late registry (agent.github, channel.send,
    // skills.manage) were advertised from the early one but executed on the late.
    early.register({ name: "early.only", description: "early build", tier: "core", parameters: { type: "object" } } as any);
    late.register({ name: "late.only", description: "late build", tier: "core", parameters: { type: "object" } } as any);

    const provider = new JaitProvider({
      config: {
        openaiApiKey: "test",
        openaiBaseUrl: "http://localhost:11434/v1",
        openaiModel: "test",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "test",
        ollamaContextWindow: 0,
        agentMaxRounds: 0,
      } as any,
      threadService: { getById: () => ({ userId: "user-1" }) } as any,
      userService: { getSettings: () => ({ apiKeys: {}, jaitBackend: "ollama" }) } as any,
      toolRegistry: early,
      getToolRegistry: () => late,
    });

    const session = await provider.startSession({ threadId: "thread-1", workingDirectory: "/repo-worktree", mode: "full-access" });
    await provider.sendTurn(session.id, "status");

    const advertised = runAgentLoopMock.mock.calls[0]?.[0].toolSchemas as Array<{ function: { name: string } }>;
    const names = advertised.map(schema => schema.function.name);
    __jait_capture(0, (names));
    __jait_capture(1, (names));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_368_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function registryStub(message: string, names: string[] = []) {
    return {
      execute: vi.fn(async () => ({ ok: true, message })),
      list: vi.fn(() => names.map(name => ({ name }))),
      listNames: vi.fn(() => names),
    } as any;
  }
await __jait_hook_556();
try {
await (async()=>{

    const early = registryStub("early");
    const provider = new JaitProvider({ config: {} as any, threadService: {} as any, toolRegistry: early });

    const result = await (provider as any).executeTool(
      "agent.github", { action: "status" }, "session-1", undefined, undefined, undefined, "/tmp",
    );

    __jait_capture(0, (early.execute.mock.calls));
    __jait_capture(1, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_380_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
function registryStub(message: string, names: string[] = []) {
    return {
      execute: vi.fn(async () => ({ ok: true, message })),
      list: vi.fn(() => names.map(name => ({ name }))),
      listNames: vi.fn(() => names),
    } as any;
  }
await __jait_hook_556();
try {
await (async()=>{

    const provider = new JaitProvider({ config: {} as any, threadService: {} as any });
    const result = await (provider as any).executeTool(
      "agent.github", { action: "status" }, "session-1", undefined, undefined, undefined, "/tmp",
    );
    __jait_capture(0, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_390_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    __jait_capture(0, (prepareThreadFileInput("file.read", { path: "src/parser.ts", limit: 20 }, "/tmp/delivery")));
    __jait_capture(1, (prepareThreadFileInput("edit", { path: "/project/src/parser.ts" }, "/tmp/delivery")));
    __jait_capture(2, (prepareThreadFileInput("file.read", { path: "/home/owner/skills/SKILL.md" }, "/tmp/delivery")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_jait_provider_test_ts_398_3": {
const runAgentLoopMock = vi.hoisted(() => vi.fn());
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/tools/index.ts",import.meta.url)), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tools/index.js")>()),
  runAgentLoop: runAgentLoopMock,
}));
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { JaitProvider, prepareJaitThreadSandboxToolInput, prepareThreadFileInput } = await import("../../../../packages/gateway/src/providers/jait-provider.js");
const __jait_hook_556 = () => {
  runAgentLoopMock.mockReset();
};
/*__jait_scope_open__*/{
await __jait_hook_556();
try {
await (async()=>{

    __jait_thrown(0, () => prepareThreadFileInput("file.write", { path: "../main/owned.ts" }, "/tmp/delivery"));
    __jait_thrown(1, () => prepareThreadFileInput("file.read", { path: "/project/../../etc/passwd" }, "/tmp/delivery"));
  
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
