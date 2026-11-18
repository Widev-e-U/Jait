// Translated fixture from packages/gateway/src/tools/agent-acp-runner.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { runAcpSpecialistTurn } from "../../../../packages/gateway/src/tools/agent-acp-runner.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/agent-acp-runner.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_agent_acp_runner_test_ts_67_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const config = { host: "127.0.0.1", port: 8000 };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new FakeAcpProvider();
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-1",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    __jait_capture(0, (result.ok));
    // The [INFORM] performative tag is parsed out of the visible message.
    __jait_capture(1, (result.message));

    // The result carries a structured sub-agent message payload — the same
    // shape a jait-backend specialist produces — so the parent turn can persist
    // and reload it like a normal chat turn.
    const data = result.data as Record<string, unknown>;
    __jait_capture(2, (data.subAgentId));
    __jait_capture(3, (data.provider));
    __jait_capture(4, (data.performative));
    __jait_capture(5, (data.content));
    // Two consecutive text tokens are merged into a single text segment.
    __jait_capture(6, (data.segments));
    __jait_capture(7, (data.toolCalls));
    __jait_capture(8, (typeof data.durationMs));

    __jait_capture(9, (provider.startedSessions));
    __jait_capture(10, (provider.startedSessions[0]?.threadId));
    __jait_capture(11, (provider.sentTurns[0]?.message));
    // Always tears the scoped session down — it's a one-shot delegation, not a persistent chat.
    __jait_capture(12, (provider.stoppedSessionIds));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_acp_runner_test_ts_107_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const config = { host: "127.0.0.1", port: 8000 };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new FakeAcpProvider();
    provider.behavior = "with-tools";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-tools",
      projectRoot: "/repo",
      prompt: "use a tool",
    });

    __jait_capture(0, (result.ok));
    const data = result.data as Record<string, unknown>;
    __jait_capture(1, (data.segments));
    __jait_capture(2, (data.toolCalls));
    const call = (data.toolCalls as Array<Record<string, unknown>>)[0]!;
    __jait_capture(3, (call.callId));
    __jait_capture(4, (call.tool));
    __jait_capture(5, (call.ok));
    __jait_capture(6, (call.message));
    __jait_capture(7, (typeof call.completedAt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_acp_runner_test_ts_140_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const config = { host: "127.0.0.1", port: 8000 };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new FakeAcpProvider();
    provider.behavior = "error";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-2",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (provider.stoppedSessionIds));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_acp_runner_test_ts_162_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const config = { host: "127.0.0.1", port: 8000 };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new FakeAcpProvider();
    provider.behavior = "error-after-work";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-partial",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    __jait_capture(0, (result.ok));
    const data = result.data as Record<string, unknown>;
    __jait_capture(1, (data.subAgentId));
    // Text + tool call up to the failure, then the error itself — not just a
    // bare error message with the work discarded.
    __jait_capture(2, (data.segments));
    __jait_capture(3, (data.toolCalls));
    __jait_capture(4, (data.content));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_acp_runner_test_ts_193_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const config = { host: "127.0.0.1", port: 8000 };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new FakeAcpProvider();
    provider.behavior = "hang";
    const registry = new ProviderRegistry();
    registry.register(provider);

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-3",
      projectRoot: "/repo",
      prompt: "do the thing",
      timeoutMs: 20,
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (provider.stoppedSessionIds));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_agent_acp_runner_test_ts_216_3": {


class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info = { id: "claude-code", name: "Claude Code", description: "", available: true, modes: ["full-access", "supervised"] as const, auth: { login: false, logout: false, deviceCode: false } };
  readonly emitter = new EventEmitter();
  startedSessions: StartSessionOptions[] = [];
  stoppedSessionIds: string[] = [];
  sentTurns: Array<{ sessionId: string; message: string }> = [];
  behavior: "success" | "error" | "error-after-work" | "hang" | "with-tools" = "success";

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.startedSessions.push(options);
    return { id: `sess-${this.startedSessions.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.sentTurns.push({ sessionId, message });
    if (this.behavior === "hang") {
      await new Promise(() => { /* never resolves */ });
      return;
    }
    if (this.behavior === "error") {
      this.emitter.emit("event", { type: "session.error", sessionId, error: "boom" } satisfies ProviderEvent);
      throw new Error("boom");
    }
    if (this.behavior === "error-after-work") {
      this.emitter.emit("event", { type: "token", sessionId, content: "looking into it" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1" } satisfies ProviderEvent);
      throw new Error("transport died");
    }
    if (this.behavior === "with-tools") {
      this.emitter.emit("event", { type: "token", sessionId, content: "start" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.start", sessionId, tool: "bash", args: {}, callId: "call-1" } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "tool.result", sessionId, tool: "bash", ok: true, message: "ok!", callId: "call-1", data: { output: "ok!" } } satisfies ProviderEvent);
      this.emitter.emit("event", { type: "token", sessionId, content: "finished" } satisfies ProviderEvent);
      return;
    }
    this.emitter.emit("event", { type: "token", sessionId, content: "[INFORM] " } satisfies ProviderEvent);
    this.emitter.emit("event", { type: "token", sessionId, content: "done" } satisfies ProviderEvent);
  }

  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId);
  }
  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
const config = { host: "127.0.0.1", port: 8000 };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ProviderRegistry();

    const result = await runAcpSpecialistTurn({
      providerRegistry: registry,
      config,
      providerId: "claude-code",
      userId: "user-1",
      sessionId: "session-1",
      subAgentId: "sub-4",
      projectRoot: "/repo",
      prompt: "do the thing",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
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
