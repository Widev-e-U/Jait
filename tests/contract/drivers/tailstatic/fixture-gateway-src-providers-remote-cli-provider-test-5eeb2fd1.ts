// Translated fixture from packages/gateway/src/providers/remote-cli-provider.test.ts; expected literals are in tail_static.rs.
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { RemoteCliProvider } from "../../../../packages/gateway/src/providers/remote-cli-provider.js";
import type { ProviderEvent } from "../../../../packages/gateway/src/providers/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/remote-cli-provider.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_53_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = createMockWs();
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code-account", "claude-code");

    __jait_capture(0, (await provider.checkAvailability()));
    await provider.listModels();
    __jait_capture(1, (ws.proxyProviderOp.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_67_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = createMockWs({
      listModelsResult: {
        data: [
          {
            id: "gpt-5.6-sol",
            displayName: "GPT-5.6-Sol",
            description: "Latest frontier agentic coding model.",
            hidden: false,
            isDefault: true,
            supportedReasoningEfforts: [
              { reasoningEffort: "low", description: "Fast responses with lighter reasoning" },
              { reasoningEffort: "medium", description: "Balances speed and reasoning depth" },
            ],
          },
        ],
        nextCursor: null,
      },
    });
    const provider = new RemoteCliProvider(ws, "node-1", "windows-codex", "codex");

    await __jait_captureResolved(0, (provider.listModels()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_103_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = createMockWs({
      listModelsError: new Error("Codex model discovery exited (code 1) - provider stderr: invalid config"),
    });
    const provider = new RemoteCliProvider(ws, "node-1", "windows-codex", "codex");

    await __jait_rejected(0, provider.listModels());
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_112_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, getRemoteHandlerSetCount } = createMockWs();
    const first = new RemoteCliProvider(ws, "node-1", "claude-code");
    const second = new RemoteCliProvider(ws, "node-1", "claude-code");

    __jait_capture(0, (getRemoteHandlerSetCount()));

    await first.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });
    await second.startSession({
      threadId: "thread-2",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });

    __jait_capture(1, (getRemoteHandlerSetCount()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_133_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, fireRemoteEvent } = createMockWs();
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => {
      events.push(event);
    });

    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
      mcpServers: [{ name: "jait", transport: "http", url: "http://gateway.test/mcp" }],
    });

    __jait_capture(0, (ws.proxyProviderOp.mock.calls));

    fireRemoteEvent(session.id, { type: "turn.completed", sessionId: session.id });

    __jait_capture(1, (events), ([
      { type: "session.started", sessionId: session.id },
      { type: "turn.completed", sessionId: session.id },
    ]));

    unsubscribe();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_167_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, fireRemoteEvent } = createMockWs();
    const provider = new RemoteCliProvider(ws, "node-1", "windows-codex", "codex");
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => { events.push(event); });
    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: "\\\\?\\E:\\",
      mode: "full-access",
    });

    fireRemoteEvent(session.id, {
      type: "provider.line",
      sessionId: session.id,
      line: JSON.stringify({
        method: "item/agentMessage/delta",
        params: { delta: "Hello from Codex" },
      }),
    });
    fireRemoteEvent(session.id, {
      type: "provider.turn-completed",
      sessionId: session.id,
    });

    __jait_capture(0, (events), ([
      { type: "session.started", sessionId: session.id },
      { type: "token", sessionId: session.id, content: "Hello from Codex" },
      { type: "turn.completed", sessionId: session.id },
    ]));
    unsubscribe();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_199_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, fireRemoteEvent } = createMockWs();
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");
    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });

    let resolved = false;
    const sendTurn = provider.sendTurn(session.id, "hello").then(() => { resolved = true; });
    await Promise.resolve();
    await Promise.resolve();

    __jait_capture(0, (ws.proxyProviderOp.mock.calls), ([session.id,30 * 60 * 1000 + 30_000]));
    __jait_capture(1, (resolved));

    fireRemoteEvent(session.id, { type: "turn.completed", sessionId: session.id });
    await sendTurn;

    __jait_capture(2, (resolved));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_231_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = createMockWs({ stopSessionResult: { ok: true, stopped: false } });
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");

    await __jait_rejected(0, provider.stopSession("missing-session"));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_remote_cli_provider_test_ts_240_3": {


function createMockWs(options: { listModelsResult?: unknown; listModelsError?: Error; sendTurnResult?: unknown; stopSessionResult?: unknown } = {}) {
  let remoteHandler: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;
  let remoteHandlerSetCount = 0;

  const ws = {
    findNodeByDeviceId: vi.fn(() => ({
      id: "node-1",
      providers: ["claude-code"],
      isGateway: false,
    })),
    proxyProviderOp: vi.fn(async (_nodeId: string, op: string) => {
      if (op === "list-models") {
        if (options.listModelsError) throw options.listModelsError;
        return options.listModelsResult ?? [];
      }
      if (op === "start-session") {
        return { ok: true, providerThreadId: "remote-thread-1" };
      }
      if (op === "send-turn") {
        return options.sendTurnResult ?? { ok: true };
      }
      if (op === "stop-session") {
        return options.stopSessionResult ?? { ok: true, stopped: true };
      }
      return { ok: true };
    }),
    get onRemoteProviderEvent() {
      return remoteHandler;
    },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      remoteHandlerSetCount += 1;
      remoteHandler = fn;
    },
  } as unknown as WsControlPlane;

  return {
    ws,
    fireRemoteEvent(sessionId: string, event: unknown) {
      remoteHandler?.(sessionId, event);
    },
    getRemoteHandlerSetCount() {
      return remoteHandlerSetCount;
    },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = createMockWs({ sendTurnResult: { ok: true, completed: true } });
    const provider = new RemoteCliProvider(ws, "node-1", "claude-code");
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => { events.push(event); });
    const session = await provider.startSession({
      threadId: "thread-1",
      workingDirectory: process.cwd(),
      mode: "full-access",
    });

    await provider.sendTurn(session.id, "hello");

    __jait_capture(0, (events), ({ type: "turn.completed", sessionId: session.id }));
    unsubscribe();
  
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
