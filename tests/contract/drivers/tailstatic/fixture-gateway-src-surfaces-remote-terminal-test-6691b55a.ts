// Translated fixture from packages/gateway/src/surfaces/remote-terminal.test.ts; expected literals are in tail_static.rs.
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { RemoteTerminalSurface } from "../../../../packages/gateway/src/surfaces/remote-terminal.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/surfaces/remote-terminal.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_26_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fakeWs = new FakeWs();
    const surface = new RemoteTerminalSurface(
      "term-remote",
      fakeWs as unknown as WsControlPlane,
      "node-1",
      { cols: 100, rows: 40 },
    );

    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });

    __jait_capture(0, (fakeWs.proxyCalls[0]));
    __jait_capture(1, (surface.snapshot()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_63_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );

    surface.ingestOutput("older command output\r\n");
    const outputOffset = surface.getOutputOffset();
    surface.ingestOutput("current command output\r\n");
    const outputEndOffset = surface.getOutputOffset();
    surface.ingestOutput("later command output\r\n");

    __jait_capture(0, (surface.getRecentOutputSince(outputOffset, outputEndOffset)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_79_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );

    surface.ingestOutput("older command output\r\n");
    surface.ingestOutput("jakob@movable-base:~/jait$ ");
    const outputOffset = surface.getOutputOffset();
    surface.ingestOutput("command\r\n");
    const outputEndOffset = surface.getOutputOffset();

    __jait_capture(0, (surface.getRecentOutputSince(outputOffset, outputEndOffset)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_97_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );

    surface.ingestOutput("older command output\r\n");
    const outputOffset = surface.getOutputOffset();
    surface.ingestOutput("command output line one\r\nline two\r\n");
    // Shells with OSC 633 integration deliver the "command finished" marker
    // together with the next prompt redraw in the same PTY read:
    surface.ingestOutput(
      "\x1b]633;D;0\x07\x1b]633;A\x07\x1b]633;B\x07jakob@movable-base:~/jait$ \x1b]633;C\x07",
    );
    const outputEndOffset = surface.getOutputOffset();

    __jait_capture(0, (surface.getCommandDoneEndOffset()), (outputEndOffset));
    const slice = surface.getRecentOutputSince(outputOffset, outputEndOffset);
    __jait_capture(1, (slice));
    __jait_capture(2, (slice));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_120_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );
    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });

    const settled = vi.fn();
    const prompt = surface.waitForPrompt(5000).then(settled);

    // Well past the flat 25 ms this used to resolve after. A slow remote shell
    // (PowerShell loading its profile) is still starting up here, so writing a
    // command now would drop the keystrokes and the run would come back empty.
    await new Promise((r) => setTimeout(r, 80));
    __jait_capture(0, (surface.shellIntegrationReady));
    __jait_capture(1, (settled.mock.calls));

    surface.ingestOutput("\x1b]633;B\x07PS C:\\remote\\project> ");
    await prompt;

    __jait_capture(2, (surface.shellIntegrationReady));
    __jait_capture(3, (settled.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_145_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );

    __jait_capture(0, (surface.bracketedPasteEnabled));
    surface.ingestOutput("\x1b]633;B\x07PS C:\\remote\\project> ");
    __jait_capture(1, (surface.bracketedPasteEnabled));

    // PSReadLine enables bracketed paste at the prompt (CSI ?2004h):
    surface.ingestOutput("\x1b[?2004h\x1b]633;B\x07PS C:\\remote\\project> ");
    __jait_capture(2, (surface.bracketedPasteEnabled));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_161_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
      { reuseOnly: true },
    );

    __jait_capture(0, (surface.shellIntegrationReady));
    const raced = await Promise.race([
      surface.waitForPrompt(5000).then(() => "ready"),
      new Promise((r) => setTimeout(() => r("stalled"), 50)),
    ]);
    __jait_capture(1, (raced));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_177_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface(
      "term-remote",
      new FakeWs() as unknown as WsControlPlane,
      "node-1",
    );
    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });

    surface.ingestOutput("$ ");
    await __jait_captureResolved(0, (surface.waitForPrompt(30)));
    __jait_capture(1, (surface.shellIntegrationReady));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_190_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fakeWs = new FakeWs();
    const surface = new RemoteTerminalSurface(
      "term-remote",
      fakeWs as unknown as WsControlPlane,
      "node-1",
    );
    const onOutput = vi.fn();
    surface.onOutput = onOutput;

    await surface.start({ sessionId: "session-1", projectRoot: "/remote/project" });
    surface.write("pwd\r");
    surface.resize(80, 24);
    surface.ingestOutput("/remote/project\r\n");
    await surface.stop();

    __jait_capture(0, (fakeWs.fireAndForgetCalls));
    __jait_capture(1, (surface.getRecentOutput()));
    __jait_capture(2, (onOutput.mock.calls));
    __jait_capture(3, (fakeWs.proxyCalls.at(-1)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_222_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface("term-paste", new FakeWs() as unknown as WsControlPlane, "node-1");
    __jait_capture(0, (surface.bracketedPasteEnabled));
    surface.ingestOutput("\x1b[?2004h");
    __jait_capture(1, (surface.bracketedPasteEnabled));
    __jait_capture(2, (surface.shellIntegrationReady));
    surface.ingestOutput("\x1b[?2004h\x1b]633;B\x07");
    __jait_capture(3, (surface.shellIntegrationReady));
    await surface.waitForPrompt();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_remote_terminal_test_ts_235_3": {


class FakeWs {
  proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown>; timeoutMs?: number }> = [];
  fireAndForgetCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];

  async proxyTerminalOp<T>(
    nodeId: string,
    op: string,
    params: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    this.proxyCalls.push({ nodeId, op, params, timeoutMs });
    if (op === "start") return { pid: 1234, shell: "/bin/bash" } as T;
    return { ok: true } as T;
  }

  sendTerminalOp(nodeId: string, op: string, params: Record<string, unknown>): void {
    this.fireAndForgetCalls.push({ nodeId, op, params });
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const surface = new RemoteTerminalSurface("term-exit", new FakeWs() as unknown as WsControlPlane, "node-1");
    const removed = vi.fn();
    const observer = vi.fn();
    surface.addExitListener(removed);
    surface.removeExitListener(removed);
    surface.addExitListener(() => { throw new Error("observer failure"); });
    surface.addExitListener(observer);
    surface.ingestExit(7, "SIGTERM");
    __jait_capture(0, (observer.mock.calls));
    __jait_capture(1, (removed.mock.calls));
    __jait_capture(2, (surface.state));
    __jait_capture(3, (surface.getRecentOutput()));
    const output = surface.getRecentOutput();
    surface.ingestExit();
    __jait_capture(4, (observer.mock.calls));
    __jait_capture(5, (surface.getRecentOutput()), (output));
  
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
