// Translated fixture from packages/gateway/src/tools/agent-tools.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { createAgentSpawnTool } from "../../../../packages/gateway/src/tools/agent-tools.js";
import { createAgentTool } from "../../../../packages/gateway/src/tools/core/agent.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import type { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import type { LLMConfig } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/agent-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_agent_tools_test_ts_43_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new FakeAcpProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);

    const getLLMConfig = vi.fn<() => LLMConfig>();
    const tool = createAgentSpawnTool({
      toolRegistry: {} as ToolRegistry,
      getLLMConfig,
      providerRegistry,
      gatewayAddress: { host: "127.0.0.1", port: 8000 },
    });

    const result = await tool.execute(
      { prompt: "do the thing", description: "test task" },
      { ...baseContext, providerId: "claude-code", model: "opus" },
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    // Must never touch the HTTP LLM path for an ACP provider — that's the
    // exact bug (bare CLI alias like "opus" sent to the wrong HTTP backend).
    __jait_capture(2, (getLLMConfig.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_tools_test_ts_68_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const getLLMConfig = vi.fn<() => LLMConfig>();
    const tool = createAgentSpawnTool({
      toolRegistry: {} as ToolRegistry,
      getLLMConfig,
    });

    const result = await tool.execute(
      { prompt: "do the thing", description: "test task" },
      { ...baseContext, providerId: "claude-code", model: "opus" },
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (getLLMConfig.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_tools_test_ts_85_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolRegistry = {
      has: () => true,
      list: () => [],
      execute: vi.fn(),
    } as unknown as ToolRegistry;
    const getLLMConfig = vi.fn<() => LLMConfig>().mockReturnValue({
      openaiApiKey: "key",
      openaiBaseUrl: "http://127.0.0.1:11434/v1",
      openaiModel: "deepseek-v4-flash:0731-cloud",
      contextWindow: 32768,
    });

    const tool = createAgentSpawnTool({ toolRegistry, getLLMConfig });

    // Pre-aborted signal so the loop short-circuits right after resolving
    // the LLM config instead of making a real network call — this test only
    // cares that the "jait" provider still reaches getLLMConfig (the HTTP
    // path), not that a full sub-agent turn succeeds.
    const result = await tool.execute(
      { prompt: "do the thing", description: "test task", allowedTools: "" },
      { ...baseContext, providerId: "jait", signal: AbortSignal.abort() },
    );

    __jait_capture(0, (result.message));
    __jait_capture(1, (getLLMConfig.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_tools_test_ts_119_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};
/*__jait_scope_open__*/{
const __jait_hook_4489 = () => {
    vi.restoreAllMocks();
  };

try {
await (async()=>{

    const spawn = createAgentSpawnTool({ toolRegistry: {} as ToolRegistry, getLLMConfig: vi.fn<() => LLMConfig>() });
    const core = createAgentTool({ toolRegistry: {} as ToolRegistry, getLLMConfig: vi.fn<() => LLMConfig>() });

    // A cap the model can set is a cap the model *will* set — it truncates the
    // specialist mid-task and the partial work comes back looking finished.
    for (const def of [spawn, core]) {
      const props = (def.parameters as { properties: Record<string, unknown> }).properties;
      __jait_capture(0, (Object.keys(props)));
    }
  
})();

} finally {
await __jait_hook_4489();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_tools_test_ts_131_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};
/*__jait_scope_open__*/{
const __jait_hook_4489 = () => {
    vi.restoreAllMocks();
  };

try {
await (async()=>{

    // Four tool rounds, then a final tagged answer. If a cap were still applied
    // the run would stop at round 2 with truncated, untagged output.
    const toolRound = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const finalRound = [
      'data: {"choices":[{"delta":{"content":"[INFORM] implemented and verified"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ];
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = round++ < 4 ? toolRound : finalRound;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const fileReadDef = {
      name: "file.read",
      description: "Read a file",
      parameters: { type: "object", properties: {} },
    };
    let call = 0;
    const toolRegistry = {
      has: () => true,
      get: () => fileReadDef,
      list: () => [fileReadDef],
      // Vary the result so duplicate-call loop detection doesn't end the run.
      execute: async () => ({ ok: true, message: `finding ${++call}` }),
    } as unknown as ToolRegistry;

    const tool = createAgentSpawnTool({
      toolRegistry,
      getLLMConfig: () => ({
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      }),
    });

    const result = await tool.execute(
      // Passed anyway — the schema no longer advertises it, so it must be ignored.
      { prompt: "implement the thing", description: "Developer", allowedTools: "file.read", maxRounds: 2 } as never,
      { ...baseContext, providerId: "jait" },
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.data));
    __jait_capture(3, (round));
  
})();

} finally {
await __jait_hook_4489();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_tools_test_ts_198_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return { id: "sess-1", providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string): Promise<void> {
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] specialist result" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const baseContext: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/repo",
  requestedBy: "test",
  userId: "user-1",
};
/*__jait_scope_open__*/{
const __jait_hook_7657 = () => {
    vi.restoreAllMocks();
  };

try {
await (async()=>{

    const rounds = [
      [
        'data: {"choices":[{"delta":{"content":"Looking at the config first."}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"file_read","arguments":"{}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ],
      [
        'data: {"choices":[{"delta":{"content":"[INFORM] the config sets the port"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    ];
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = rounds[Math.min(round++, rounds.length - 1)]!;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      }), { status: 200 });
    });

    const fileReadDef = { name: "file.read", description: "Read a file", parameters: { type: "object", properties: {} } };
    const toolRegistry = {
      has: () => true,
      get: () => fileReadDef,
      list: () => [fileReadDef],
      execute: async () => ({ ok: true, message: "port = 8000" }),
    } as unknown as ToolRegistry;

    const tool = createAgentSpawnTool({
      toolRegistry,
      getLLMConfig: () => ({
        openaiApiKey: "test-key",
        openaiBaseUrl: "https://llm.test",
        openaiModel: "test-model",
        contextWindow: 100_000,
      }),
    });

    const result = await tool.execute(
      { prompt: "find the port", description: "Researcher", allowedTools: "file.read" },
      { ...baseContext, providerId: "jait" },
    );

    // The prose the specialist wrote before delegating to a tool has to stay
    // *before* that tool call — this ordering is the whole point of shipping
    // segments, since the flat toolCalls list can only be rendered as one lump.
    __jait_capture(0, (result.data));
  
})();

} finally {
await __jait_hook_7657();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
