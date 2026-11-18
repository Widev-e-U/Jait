// Translated fixture from packages/gateway/src/tools/swarm-stream-repro.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { runAgentLoop, toolDefsToSchemas, type AgentLoopEvent } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { runAcpSpecialistTurn } from "../../../../packages/gateway/src/tools/agent-acp-runner.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/swarm-stream-repro.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_swarm_stream_repro_test_ts_82_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = {
    id: "claude-code",
    name: "Claude Code",
    description: "",
    available: true,
    modes: ["full-access", "supervised"] as const,
    auth: { login: false, logout: false, deviceCode: false },
  };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];

  async checkAvailability(): Promise<boolean> {
    return true;
  }
  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }
  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    // Stream the specialist's prose live, token by token.
    this.emitter.emit("event", { type: "token", sessionId, content: "specialist live prose" } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: " more content" } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "message", sessionId, role: "assistant", content: "specialist live prose more content" } satisfies ProviderEvent);
  }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const coordinatorDelegateStream = [
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-agent-1","type":"function","function":{"name":"agent_spawn","arguments":"{\\"prompt\\":\\"investigate the bug\\",\\"description\\":\\"Specialist Investigator\\"}"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  "data: [DONE]\n\n",
];
const coordinatorFinalStream = [
  'data: {"choices":[{"delta":{"content":"Swarm complete."},"finish_reason":null}]}\n\n',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  "data: [DONE]\n\n",
];
const __jait_hook_3410 = () => {
  vi.restoreAllMocks();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    let fetchCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const chunks = fetchCalls++ === 0 ? coordinatorDelegateStream : coordinatorFinalStream;
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });

    const events: AgentLoopEvent[] = [];
    const registry = new ProviderRegistry();
    registry.register(new FakeAcpProvider());

    const result = await runAgentLoop(
      {
        llm: {
          openaiApiKey: "test-key",
          openaiBaseUrl: "https://llm.test",
          openaiModel: "test-model",
          contextWindow: 100_000,
        },
        history: [
          { role: "system", content: "system" },
          { role: "user", content: "investigate the bug" },
        ],
        // Build through the production builder: the provider alias → internal name
        // inverse is derived from advertised schemas, never guessed.
        toolSchemas: toolDefsToSchemas([
          { name: "agent.spawn", description: "Spawn a specialist sub-agent", parameters: { type: "object", properties: {} } },
        ]),
        hasTools: true,
        sessionId: "session-1",
        abort: new AbortController(),
        maxRounds: 2,
        mode: "swarm",
        onEvent: (event) => events.push(event),
      },
      async (name, args, sessionId, auth, _onChunk, _signal, onNestedEvent) => {
        return runAcpSpecialistTurn({
          providerRegistry: registry,
          config: { host: "127.0.0.1", port: 8000 },
          providerId: "claude-code",
          userId: auth?.userId ?? "user-1",
          sessionId,
          subAgentId: "sub-1",
          projectRoot: "/repo",
          prompt: String((args as { prompt?: string }).prompt ?? ""),
          onNestedEvent,
        });
      },
    );

    __jait_capture(0, (result.executedToolCalls));
    __jait_capture(1, (result.executedToolCalls[0]!.tool));

    const types = events.map((e) => e.type);

    // The coordinator announces swarm mode (the visible "swarm indication").
    __jait_capture(2, (types));

    // ── REGRESSION ────────────────────────────────────────────────────
    // The specialist's prose must be streamed LIVE as `tool_output` events
    // (channel=text) with the agent call id stamped on them — NOT withheld
    // until the specialist's `tool_result`. If these events are absent (or
    // keyed with an id no frontend tool card matches), the UI would show only
    // the swarm indication and the content would only surface on reload.
    const liveProseEvents = events.filter(
      (e): e is Extract<AgentLoopEvent, { type: "tool_output" }> =>
        e.type === "tool_output" && typeof e.content === "string" && e.content.includes("specialist live prose"),
    );
    __jait_capture(3, (liveProseEvents));

    // Each live prose event must carry the agent call id (so the frontend can
    // attach it to the specialist's card) and must arrive before the
    // specialist's final tool_result.
    for (const ev of liveProseEvents) {
      __jait_capture(4, (ev.call_id));
    }
    const agentResultIdx = events.findIndex(
      (e) => e.type === "tool_result" && e.callId === "call-agent-1",
    );
    for (const ev of liveProseEvents) {
      const proseIdx = events.indexOf(ev);
      __jait_capture(5, (proseIdx));
      __jait_capture(6, (proseIdx), (agentResultIdx === -1 ? events.length : agentResultIdx));
    }
  
})();

} finally {
await __jait_hook_3410();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
