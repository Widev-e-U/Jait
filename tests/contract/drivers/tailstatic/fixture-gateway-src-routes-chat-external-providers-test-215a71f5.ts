// Translated fixture from packages/gateway/src/routes/chat.external-providers.test.ts; expected literals are in tail_static.rs.
import { UserQuestionService } from "../../../../packages/gateway/src/services/user-questions.js";
import { EventEmitter } from "node:events";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { CliProviderAdapter, ProviderEvent, ProviderInfo, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { ChatLoopService } from "../../../../packages/gateway/src/services/chat-loops.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import {
  canUseGatewayProviderForProject,
  buildCliProviderSystemPrompt,
  getExternalFileMutationPath,
  getProviderRequestErrorMessage,
  isNonRecoverableProviderRequestError,
  normalizeProviderSessionError,
} from "../../../../packages/gateway/src/routes/chat.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat.external-providers.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_26_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildCliProviderSystemPrompt("codex", "gpt-5.4", "agent", {
      projectRoot: "/work/project",
      architectureGraph: "graph TD; A-->B".repeat(500),
      projectInstructions: "Use the repository conventions.",
      skills: [{
        id: "debugging",
        name: "Debugging",
        description: "Use for root-cause analysis.",
        filePath: "/skills/debugging/SKILL.md",
        source: "bundled",
        enabled: true,
      }],
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    // Skills are lazy-discovered now: the prompt carries the discovery
    // instruction, not the skill's file path.
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
    __jait_capture(6, (prompt));
    __jait_capture(7, (prompt.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_55_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (canUseGatewayProviderForProject("desktop-windows-node")));
    __jait_capture(1, (canUseGatewayProviderForProject("gateway")));
    __jait_capture(2, (canUseGatewayProviderForProject(null)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_63_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (getExternalFileMutationPath("edit", { path: "/tmp/a.ts" })));
    __jait_capture(1, (getExternalFileMutationPath("file.write", { filePath: "/tmp/b.ts" })));
    __jait_capture(2, (getExternalFileMutationPath("write", { file_path: "/tmp/c.ts" })));
    __jait_capture(3, (getExternalFileMutationPath("create_file", { filename: "/tmp/d.ts" })));
    __jait_capture(4, (getExternalFileMutationPath("replace_string_in_file", { targetFile: "/tmp/e.ts" })));
    __jait_capture(5, (getExternalFileMutationPath("edit", { relative_path: "src/f.ts" })));
    __jait_capture(6, (getExternalFileMutationPath("edit", { changes: [{ path: "src/g.ts" }] })));
    __jait_capture(7, (getExternalFileMutationPath("edit", { input: { changes: [{ file_path: "src/h.ts" }] } })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_74_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (getExternalFileMutationPath("read", { path: "/tmp/a.ts" })));
    __jait_captureType(1, (getExternalFileMutationPath("web", { path: "/tmp/a.ts" })));
    __jait_captureType(2, (getExternalFileMutationPath("execute", { command: "echo hi" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_82_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeProviderSessionError("Usage limit reached for this provider")));
    __jait_capture(1, (normalizeProviderSessionError("Please log in before continuing")));
    __jait_capture(2, (normalizeProviderSessionError("Temporary provider outage")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_88_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const error = Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });

    __jait_capture(0, (getProviderRequestErrorMessage(error)));
    __jait_capture(1, (isNonRecoverableProviderRequestError(error)));
    __jait_capture(2, (isNonRecoverableProviderRequestError(new Error("Session process exited"))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_346_3_each0": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const status = "error";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("goal-owner", "password123");
    const session = sessionService.create({ userId: user.id, name: "Saved goal" });
    const chatLoops = new ChatLoopService(sessionService);
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { db, sqlite, sessionService, sessionState, userService, providerRegistry, chatLoops });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const send = (content: string) => app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content, provider: "codex", runtimeMode: "full-access" } });
    try {
      __jait_capture(0, ((await send("Inspect current work")).statusCode));
      chatLoops.goal(session.id, "Finish saved migration", ["All components verified"]);
      if (status === "error") chatLoops.finishTurn(session.id, "Workspace is out of credits");
      else chatLoops.control(session.id, "pause");
      __jait_capture(1, ((await send("Why did the goal stop?")).statusCode));
      __jait_capture(2, (provider.startSession.mock.calls));
      __jait_capture(3, (provider.sendTurn.mock.calls));
      const prompt = provider.sendTurn.mock.calls[1]![1];
      __jait_capture(4, (prompt));
      __jait_capture(5, (prompt), (`Loop status: ${status}`));
      __jait_capture(6, (prompt));
      __jait_capture(7, (prompt));
      if (status === "error") __jait_capture(8, (prompt));
      // Asking about the failure grants no automatic resume authority.
      __jait_capture(9, (chatLoops.get(session.id)?.status));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_346_3_each1": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const status = "paused";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("goal-owner", "password123");
    const session = sessionService.create({ userId: user.id, name: "Saved goal" });
    const chatLoops = new ChatLoopService(sessionService);
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { db, sqlite, sessionService, sessionState, userService, providerRegistry, chatLoops });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    const send = (content: string) => app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content, provider: "codex", runtimeMode: "full-access" } });
    try {
      __jait_capture(0, ((await send("Inspect current work")).statusCode));
      chatLoops.goal(session.id, "Finish saved migration", ["All components verified"]);
      if (status === "error") chatLoops.finishTurn(session.id, "Workspace is out of credits");
      else chatLoops.control(session.id, "pause");
      __jait_capture(1, ((await send("Why did the goal stop?")).statusCode));
      __jait_capture(2, (provider.startSession.mock.calls));
      __jait_capture(3, (provider.sendTurn.mock.calls));
      const prompt = provider.sendTurn.mock.calls[1]![1];
      __jait_capture(4, (prompt));
      __jait_capture(5, (prompt), (`Loop status: ${status}`));
      __jait_capture(6, (prompt));
      __jait_capture(7, (prompt));
      if (status === "error") __jait_capture(8, (prompt));
      // Asking about the failure grants no automatic resume authority.
      __jait_capture(9, (chatLoops.get(session.id)?.status));
    } finally { await app.close(); sqlite.close(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_382_3_each0": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const recovery = false;

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const image = { name: "colleague.png", mimeType: "image/png", data: "aGVsbG8=" };
    const document = { name: "notes.txt", mimeType: "text/plain", data: Buffer.from("colleague notes").toString("base64") };
    try {
      const headers = await authHeaders();
      for (const payload of [
        { content: "help me fix it", attachments: [image, document], displaySegments: [{ type: "image", ...image }] },
        { content: "", displaySegments: [{ type: "image", ...image }] },
      ]) {
        if (recovery && provider.sendTurn.mock.calls.length > 0) {
          provider.sendTurn.mockRejectedValueOnce(new Error("Session process exited"));
        }
        const response = await app.inject({
          method: "POST", url: "/api/chat", headers,
          payload: { ...payload, sessionId: `uploaded-images-session-${recovery}`, provider: "codex" },
        });
        __jait_capture(0, (response.body));
      }
      __jait_capture(1, (provider.startSession.mock.calls), (recovery ? 2 : 1));
      __jait_capture(2, (provider.sendTurn.mock.calls), (recovery ? 3 : 2));
      for (const call of provider.sendTurn.mock.calls) __jait_capture(3, (call[2]), ([image]));
      __jait_capture(4, (provider.sendTurn.mock.calls[0]?.[1]));
      __jait_capture(5, (provider.sendTurn.mock.calls[0]?.[1]), (image.data));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_382_3_each1": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const recovery = true;

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const image = { name: "colleague.png", mimeType: "image/png", data: "aGVsbG8=" };
    const document = { name: "notes.txt", mimeType: "text/plain", data: Buffer.from("colleague notes").toString("base64") };
    try {
      const headers = await authHeaders();
      for (const payload of [
        { content: "help me fix it", attachments: [image, document], displaySegments: [{ type: "image", ...image }] },
        { content: "", displaySegments: [{ type: "image", ...image }] },
      ]) {
        if (recovery && provider.sendTurn.mock.calls.length > 0) {
          provider.sendTurn.mockRejectedValueOnce(new Error("Session process exited"));
        }
        const response = await app.inject({
          method: "POST", url: "/api/chat", headers,
          payload: { ...payload, sessionId: `uploaded-images-session-${recovery}`, provider: "codex" },
        });
        __jait_capture(0, (response.body));
      }
      __jait_capture(1, (provider.startSession.mock.calls), (recovery ? 2 : 1));
      __jait_capture(2, (provider.sendTurn.mock.calls), (recovery ? 3 : 2));
      for (const call of provider.sendTurn.mock.calls) __jait_capture(3, (call[2]), ([image]));
      __jait_capture(4, (provider.sendTurn.mock.calls[0]?.[1]));
      __jait_capture(5, (provider.sendTurn.mock.calls[0]?.[1]), (image.data));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_414_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer({ ...testConfig, llmProvider: "opencode-go", openaiApiKey: "" }, { providerRegistry });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers: await authHeaders(),
        payload: { content: "hello", sessionId: "codex-without-go-key", provider: "codex", runtimeMode: "full-access" },
      });
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (response.body));
      __jait_capture(2, (provider.sendTurn.mock.calls));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_434_3_each0": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const requestedBy = "user.ask";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("question-owner", "password123");
    const session = sessionService.create({ userId: user.id, name: "Browser handoff" });
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const questions = new UserQuestionService();
    const app = await createServer(testConfig, { db, sqlite, sessionService, sessionState, userService,
      providerRegistry, userQuestionService: questions });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    try {
      await app.inject({ method: "POST", url: "/api/chat", headers,
        payload: { sessionId: session.id, content: "Continue after my answer", provider: "codex", runtimeMode: "full-access" } });
      vi.useFakeTimers();
      const id = questions.startResumable({ sessionId: session.id, userId: user.id, requestedBy,
        questions: [{ id: "browser", header: "Browser", question: "Finish this step" }] });
      const wait = questions.waitForAnswer(id, session.id, user.id);
      await vi.advanceTimersByTimeAsync(60_000);
      __jait_capture(0, (await wait));
      vi.useRealTimers();
      __jait_capture(1, (provider.sendTurn.mock.calls));
      const submitted = await app.inject({ method: "POST", url: `/api/user-questions/requests/${id}/submit`, headers,
        payload: { answers: { browser: { selected: ["Done"], freeText: null, skipped: false } } } });
      __jait_capture(2, (submitted.statusCode));
      await vi.waitFor(() => __jait_capture(3, (provider.sendTurn.mock.calls)));
      __jait_capture(4, (provider.sendTurn.mock.calls[1]![1]), (`${requestedBy} with only requestId=`));
      __jait_capture(5, (provider.startSession.mock.calls.at(-1)![0].mode));
      const history = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/messages`, headers });
      __jait_capture(6, (history.body));
    } finally {
      vi.useRealTimers();
      await app.close();
      sqlite.close();
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_434_3_each1": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const requestedBy = "browser.handoff";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("question-owner", "password123");
    const session = sessionService.create({ userId: user.id, name: "Browser handoff" });
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const questions = new UserQuestionService();
    const app = await createServer(testConfig, { db, sqlite, sessionService, sessionState, userService,
      providerRegistry, userQuestionService: questions });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };
    try {
      await app.inject({ method: "POST", url: "/api/chat", headers,
        payload: { sessionId: session.id, content: "Continue after my answer", provider: "codex", runtimeMode: "full-access" } });
      vi.useFakeTimers();
      const id = questions.startResumable({ sessionId: session.id, userId: user.id, requestedBy,
        questions: [{ id: "browser", header: "Browser", question: "Finish this step" }] });
      const wait = questions.waitForAnswer(id, session.id, user.id);
      await vi.advanceTimersByTimeAsync(60_000);
      __jait_capture(0, (await wait));
      vi.useRealTimers();
      __jait_capture(1, (provider.sendTurn.mock.calls));
      const submitted = await app.inject({ method: "POST", url: `/api/user-questions/requests/${id}/submit`, headers,
        payload: { answers: { browser: { selected: ["Done"], freeText: null, skipped: false } } } });
      __jait_capture(2, (submitted.statusCode));
      await vi.waitFor(() => __jait_capture(3, (provider.sendTurn.mock.calls)));
      __jait_capture(4, (provider.sendTurn.mock.calls[1]![1]), (`${requestedBy} with only requestId=`));
      __jait_capture(5, (provider.startSession.mock.calls.at(-1)![0].mode));
      const history = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/messages`, headers });
      __jait_capture(6, (history.body));
    } finally {
      vi.useRealTimers();
      await app.close();
      sqlite.close();
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_476_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const sessionId = "cli-hidden-background-completion";
    const monitorSpy = vi.spyOn(backgroundCommandMonitor, "setCompletionHandler");
    let completeCommand: () => Promise<void> = async () => {};
    class BackgroundProvider extends MockChatProvider {
      override readonly sendTurn = vi.fn(async (providerSessionId: string, _content?: string): Promise<void> => {
        if (this.sendTurn.mock.calls.length === 1) await completeCommand();
        setTimeout(() => {
          this.emitForTest({ type: "token", sessionId: providerSessionId, content: "verified" });
          this.emitForTest({ type: "turn.completed", sessionId: providerSessionId });
        }, 0);
      });
    }
    const provider = new BackgroundProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const handler = monitorSpy.mock.calls.at(-1)![0];
    completeCommand = async () => { await handler({
      sessionId, terminalId: "tty-hidden", command: "check-private-output", exitCode: 0,
      output: "private completion evidence", durationMs: 1000,
    }); };
    try {
      const headers = await authHeaders();
      const response = await app.inject({
        method: "POST", url: "/api/chat", headers,
        payload: { content: "verify", sessionId, provider: "codex", runtimeMode: "full-access" },
      });
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (provider.sendTurn.mock.calls));
      __jait_capture(2, (provider.sendTurn.mock.calls[1]?.[1]));
      __jait_capture(3, (response.body));
      __jait_capture(4, (response.body));
      __jait_capture(5, (response.body));
      __jait_capture(6, (response.body));
      const history = await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/messages`, headers });
      __jait_capture(7, (history.statusCode));
      __jait_capture(8, (history.body));
      __jait_capture(9, (history.body));
    } finally {
      monitorSpy.mockRestore();
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_521_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (loadConfig()));

    const provider = new MockSilentChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "think carefully",
        sessionId: "chat-silent-turn-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (response.body));
    __jait_capture(3, (response.body));
    __jait_capture(4, (provider.interruptTurn.mock.calls));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_550_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockCreditErrorChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "continue the task",
        sessionId: "chat-provider-credit-error-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.body));
    __jait_capture(2, (response.body));
    __jait_capture(3, (response.body));
    __jait_capture(4, (provider.startSession.mock.calls));
    __jait_capture(5, (provider.sendTurn.mock.calls));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_579_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const supervised = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: "chat-runtime-mode-session",
        provider: "codex",
        runtimeMode: "supervised",
      },
    });

    __jait_capture(0, (supervised.statusCode));
    __jait_capture(1, (provider.startSession.mock.calls));
    __jait_capture(2, (provider.startSession.mock.calls[0]?.[0]));
    __jait_capture(3, (provider.stopSession.mock.calls));

    const fullAccess = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello again",
        sessionId: "chat-runtime-mode-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(4, (fullAccess.statusCode));
    __jait_capture(5, (provider.stopSession.mock.calls));
    __jait_capture(6, (provider.startSession.mock.calls));
    __jait_capture(7, (provider.startSession.mock.calls[1]?.[0]));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_623_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-model-effort-session";

    await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "first turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "second turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
        model: "gpt-5.6-terra",
        reasoningEffort: "ultra",
      },
    });

    __jait_capture(0, (provider.stopSession.mock.calls));
    __jait_capture(1, (provider.startSession.mock.calls));
    __jait_capture(2, (provider.startSession.mock.calls[0]?.[0]));
    __jait_capture(3, (provider.startSession.mock.calls[1]?.[0]));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_673_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockApprovalChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-approval-session";

    const responsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "edit the file",
        sessionId,
        provider: "codex",
        runtimeMode: "supervised",
      },
    });

    await waitForAssertion(() => __jait_capture(0, (provider.approvalEmitted)));

    const approval = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/approve`,
      headers,
      payload: { requestId: "approval-request-1", approved: true },
    });

    __jait_capture(1, (approval.statusCode));
    __jait_capture(2, (provider.respondToApproval.mock.calls));

    const response = await responsePromise;
    __jait_capture(3, (response.statusCode));
    __jait_capture(4, (response.body));
    __jait_capture(5, (response.body));
    __jait_capture(6, (response.body));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_714_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "fix the bug",
        sessionId: "chat-system-prompt-trace-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));

    const firstTurnMessage = provider.sendTurn.mock.calls[0]?.[1];
    __jait_capture(1, (typeof firstTurnMessage));
    __jait_capture(2, (firstTurnMessage));
    __jait_capture(3, (firstTurnMessage));
    __jait_capture(4, (firstTurnMessage));
    __jait_capture(5, (firstTurnMessage));
    __jait_capture(6, (firstTurnMessage));
    __jait_capture(7, (firstTurnMessage));

    __jait_capture(8, (response.body));
    __jait_capture(9, (response.body));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_750_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer({
      ...testConfig,
      llmProvider: "ollama",
      ollamaModel: "llama3.2",
    }, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "fix the bug",
        sessionId: "chat-ollama-cli-system-prompt-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));

    const firstTurnMessage = provider.sendTurn.mock.calls[0]?.[1];
    __jait_capture(1, (typeof firstTurnMessage));
    __jait_capture(2, (firstTurnMessage));
    __jait_capture(3, (firstTurnMessage));
    __jait_capture(4, (firstTurnMessage));
    __jait_capture(5, (firstTurnMessage));
    __jait_capture(6, (firstTurnMessage));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_786_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const sessionId = "chat-reused-system-prompt-trace-session";
    await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "first turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "second turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (provider.startSession.mock.calls));

    const secondTurnMessage = provider.sendTurn.mock.calls[1]?.[1];
    __jait_capture(2, (secondTurnMessage));
    __jait_capture(3, (response.body));
    __jait_capture(4, (response.body));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_829_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-provider-switch-context-session";

    for (const content of ["first turn", "second turn", "third turn"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers,
        payload: {
          content,
          sessionId,
          provider: "codex",
          runtimeMode: "full-access",
        },
      });
      __jait_capture(0, (response.statusCode));
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "fourth turn",
        sessionId,
        provider: "codex",
        runtimeMode: "supervised",
      },
    });

    __jait_capture(1, (response.statusCode));
    __jait_capture(2, (provider.startSession.mock.calls));
    __jait_capture(3, (provider.stopSession.mock.calls));

    const handoffMessage = provider.sendTurn.mock.calls[3]?.[1];
    __jait_capture(4, (typeof handoffMessage));
    __jait_capture(5, (handoffMessage));
    __jait_capture(6, (handoffMessage));
    __jait_capture(7, (handoffMessage));
    __jait_capture(8, (handoffMessage));
    __jait_capture(9, (handoffMessage));
    __jait_capture(10, (handoffMessage));
    __jait_capture(11, (response.body));
    __jait_capture(12, (response.body));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_882_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const provider = new MockTodoChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("todo-chat-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Todo Chat" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      sessionState,
      userService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: {
        content: "track this work with todos",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.body));
    __jait_capture(2, (response.body));

    __jait_capture(3, (sessionState.get(session.id, ["todo_list"])));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_935_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockInterleavedToolChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-interleaved-tool-segments-session";

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "read then answer",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/messages`,
      headers,
    });

    __jait_capture(1, (messagesResponse.statusCode));
    const body = messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        toolCalls?: Array<{ callId: string }>;
        segments?: Array<{ type: string; content?: string; callIds?: string[] }>;
      }>;
    };
    const assistantMessage = body.messages.find((message) => message.role === "assistant");
    __jait_capture(2, (assistantMessage?.content));
    __jait_capture(3, (assistantMessage?.toolCalls?.map((call) => call.callId)));
    __jait_capture(4, (assistantMessage?.segments));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_984_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression test: the "!cliProvider" branch used to `return` directly
    // out of the SSE handler, which skipped the activeStreams cleanup that
    // normally runs after the try/catch. That left the session permanently
    // marked as streaming (stuck spinner, queued-forever messages) any time
    // a remote node briefly wasn't advertising the requested provider.
    const providerRegistry = new ProviderRegistry();
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-unavailable-provider-session";

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId,
        provider: "totally-bogus-provider",
        runtimeMode: "full-access",
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.body));

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/messages`,
      headers,
    });

    __jait_capture(2, (messagesResponse.statusCode));
    __jait_capture(3, (messagesResponse.json()));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1022_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const provider = new MockCancelledChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("cancelled-chat-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Cancelled Chat" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const responsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "start a long answer",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    await waitForAssertion(() => __jait_capture(0, (provider.partialEmitted)));

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/cancel`,
      headers,
    });
    __jait_capture(1, (cancelResponse.statusCode));
    __jait_capture(2, (cancelResponse.json()));
    await responsePromise;

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers,
    });

    __jait_capture(3, (messagesResponse.statusCode));
    const body = messagesResponse.json() as {
      messages: Array<{ role: string; content: string; segments?: Array<{ type: string; content?: string }> }>;
    };
    const assistantMessage = body.messages.find((message) => message.role === "assistant");
    __jait_capture(4, (assistantMessage?.content));
    __jait_capture(5, (assistantMessage?.segments));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1088_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockHangingSendTurnChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("hung-cancel-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Hung Cancellation" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const responsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "start a turn whose provider request hangs",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    try {
      await waitForAssertion(() => __jait_capture(0, (provider.sendTurn.mock.calls)));

      const cancelResponse = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/cancel`,
        headers,
      });
      __jait_capture(1, (cancelResponse.statusCode));
      __jait_capture(2, (cancelResponse.json()));

      await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for cancelled chat response")), 500);
        }),
      ]);

      __jait_capture(3, (provider.interruptTurn.mock.calls));
      __jait_capture(4, (provider.stopSession.mock.calls));
      __jait_capture(5, (provider.listenerCountForTest()));

      const approvalResponse = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/approve`,
        headers,
        payload: { requestId: "stale-request", approved: true },
      });
      __jait_capture(6, (approvalResponse.statusCode));

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers,
      });
      __jait_capture(7, (messagesResponse.statusCode));
      __jait_capture(8, (messagesResponse.json()));
    } finally {
      provider.release();
      await responsePromise;
      await app.close();
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1167_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockHangingFirstTurnChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("hung-restart-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Hung Restart" });
    const token = await signAuthToken(
      { id: user.id, username: user.username },
      testConfig.jwtSecret,
    );
    const headers = { authorization: `Bearer ${token}` };
    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "replace this hung turn",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    try {
      await waitForAssertion(() => __jait_capture(0, (provider.sendTurn.mock.calls)));
      const restartResponse = await Promise.race([
        app.inject({
          method: "POST",
          url: `/api/sessions/${session.id}/restart-from`,
          headers,
          payload: {
            messageFromEnd: 0,
            expectedContent: "replace this hung turn",
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for restart")), 1_000);
        }),
      ]);

      __jait_capture(1, (restartResponse.statusCode));
      await firstResponsePromise;
      __jait_capture(2, (provider.interruptTurn.mock.calls));
      __jait_capture(3, (provider.stopSession.mock.calls));
      __jait_capture(4, (provider.listenerCountForTest()));

      const secondResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers,
        payload: {
          content: "run after restart",
          sessionId: session.id,
          provider: "codex",
          runtimeMode: "full-access",
        },
      });
      __jait_capture(5, (secondResponse.statusCode));
      __jait_capture(6, (secondResponse.body));
      __jait_capture(7, (provider.startSession.mock.calls));
      __jait_capture(8, (provider.sendTurn.mock.calls.map(([providerSessionId]) => providerSessionId)));
      __jait_capture(9, (provider.listenerCountForTest()));
    } finally {
      await app.close();
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1251_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("cli-metrics-chat-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "CLI Metrics Chat" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "say ok",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });
    __jait_capture(0, (response.statusCode));

    // Locate the assistant message's visible index, then lazy-load its flow.
    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers,
    });
    __jait_capture(1, (messagesResponse.statusCode));
    const messages = messagesResponse.json() as { messages: Array<{ role: string; hasContextFlow?: boolean }> };
    const assistantIndex = messages.messages.findIndex((message) => message.role === "assistant");
    __jait_capture(2, (assistantIndex));
    __jait_capture(3, (messages.messages[assistantIndex]?.hasContextFlow));

    const flowResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages/${assistantIndex}/context-flow`,
      headers,
    });
    __jait_capture(4, (flowResponse.statusCode));
    const flow = flowResponse.json() as { contextFlow: { provider: string; rounds: Array<{ metrics?: Record<string, unknown> }> } };
    __jait_capture(5, (flow.contextFlow.provider));
    const metrics = flow.contextFlow.rounds[0]?.metrics;
    __jait_captureType(6, (metrics));
    __jait_capture(7, (metrics?.durationMs));
    __jait_capture(8, (metrics?.promptTokens));
    __jait_capture(9, (metrics?.completionTokens));
    __jait_capture(10, (metrics?.totalTokens));
    __jait_capture(11, (metrics?.tokenUsageEstimated));
    // An immediate mock turn can finish within the same millisecond; a rate
    // cannot be calculated when the measured duration is zero.
    if ((metrics?.durationMs as number) > 0) {
      __jait_capture(12, (metrics?.tokensPerSecond));
    } else {
      __jait_captureType(13, (metrics?.tokensPerSecond));
    }
    __jait_capture(14, (metrics?.contextUsage));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1326_1": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

try {
await (async()=>{

  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db);
  const user = userService.createUser("read-marker-owner", "password123");
  const sessionService = new SessionService(db);
  const session = sessionService.create({ userId: user.id });
  const provider = new MockChatProvider();
  const registry = new ProviderRegistry();
  registry.register(provider);
  let observedAt = "";
  const realTouch = sessionService.touch.bind(sessionService);
  vi.spyOn(sessionService, "touch").mockImplementation((id) => {
    realTouch(id);
    // Simulate the reader acknowledging the prompt, then leaving before the reply.
    if (!observedAt) {
      observedAt = sessionService.getById(id)!.lastActiveAt;
      sessionService.markViewed(id, user.id, observedAt);
    }
  });
  const app = await createServer(testConfig, { db, sqlite, sessionService, userService, providerRegistry: registry });
  try {
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "Reply after I leave", provider: "codex" },
    });
    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.body));
    const completed = sessionService.getById(session.id)!;
    __jait_capture(2, (Date.parse(completed.lastActiveAt)), (Date.parse(observedAt)));
    __jait_capture(3, (completed.viewedAt), (observedAt));
  } finally {
    await app.close();
    sqlite.close();
  }

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1364_1_each0": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
const personal = false;

try {
await (async()=>{

  const { ProjectService } = await import("../../../../packages/gateway/src/services/projects.js");
  const { SurfaceRegistry } = await import("../../../../packages/gateway/src/surfaces/registry.js");
  const { FileSystemSurfaceFactory } = await import("../../../../packages/gateway/src/surfaces/filesystem.js");
  const { RemoteFileSystemSurface } = await import("../../../../packages/gateway/src/surfaces/remote-filesystem.js");
  const { RemoteCliProvider } = await import("../../../../packages/gateway/src/providers/remote-cli-provider.js");
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db);
  const user = userService.createUser("windows-project-owner", "password123");
  const projectService = new ProjectService(db);
  const root = "C:\\Users\\jakob\\Tankstelle";
  const node = { id: "windows-node", name: "Windows desktop", platform: "windows", clientId: "connected", providers: ["codex"] };
  const project = projectService.create({ userId: user.id, title: "Tankstelle", rootPath: root, nodeId: node.id });
  const sessionService = new SessionService(db);
  const session = sessionService.create(personal ? { userId: user.id } : { userId: user.id, projectId: project.id, projectPath: root });
  if (personal) sessionService.updateChatSelection(session.id, { nodeId: node.id }, user.id);
  const provider = new MockChatProvider();
  const spies = [
    vi.spyOn(RemoteCliProvider.prototype, "startSession").mockImplementation(provider.startSession),
    vi.spyOn(RemoteCliProvider.prototype, "sendTurn").mockImplementation(provider.sendTurn),
    vi.spyOn(RemoteCliProvider.prototype, "checkAvailability").mockResolvedValue(true),
    vi.spyOn(RemoteCliProvider.prototype, "onEvent").mockImplementation(provider.onEvent.bind(provider)),
    vi.spyOn(RemoteCliProvider.prototype, "stopSession").mockResolvedValue(),
  ];
  const ws = {
    canAccessNode: (_id: string, userId: string | null) => userId === user.id,
    getFsNodes: () => [node], findNodeByDeviceId: () => node,
    broadcast: vi.fn(), broadcastToUser: vi.fn(), registerGatewayFsNode: vi.fn(),
    proxyFsOp: vi.fn(async () => ({ isDirectory: true })),
  } as unknown as import("../ws.js").WsControlPlane;
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  const remote = new RemoteFileSystemSurface("windows-files", ws);
  if (!personal) {
    await remote.start({ sessionId: session.id, projectRoot: root, nodeId: node.id });
    surfaceRegistry.registerInstance(remote.id, remote);
  }
  const gatewayProvider = new MockChatProvider();
  const registry = new ProviderRegistry();
  registry.register(gatewayProvider);
  const app = await createServer(testConfig, { db, sqlite, sessionService, projectService, userService, surfaceRegistry, ws, providerRegistry: registry, audit: new AuditWriter(db) });
  try {
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({ method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` }, payload: { sessionId: session.id, content: "hello", provider: "codex" } });
    __jait_capture(0, (response.body));
    __jait_capture(1, (provider.startSession.mock.calls), ([personal ? "." : root]));
    __jait_capture(2, (surfaceRegistry.getBySession(session.id).map((s) => s.type)), (personal ? [] : ["remote-filesystem"]));
    __jait_capture(3, (provider.sendTurn.mock.calls[0]?.[1]));
    __jait_capture(4, (provider.sendTurn.mock.calls[0]?.[1]));
    if (personal) {
      const headers = { authorization: `Bearer ${token}` };
      const prewarm = await app.inject({ method: "POST", url: "/api/chat/prewarm", headers, payload: { sessionId: session.id, provider: "codex" } });
      __jait_capture(5, (prewarm.json().status));
      ws.getFsNodes = () => [];
      const offline = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "offline turn", provider: "codex" } });
      __jait_capture(6, (offline.body));
      __jait_capture(7, (gatewayProvider.startSession.mock.calls));
      // A filesystem surface left by an earlier project must not override
      // the explicit personal selection when switching back to the gateway.
      await remote.start({ sessionId: session.id, projectRoot: root, nodeId: node.id });
      surfaceRegistry.registerInstance(remote.id, remote);
      const changed = await app.inject({ method: "PATCH", url: `/api/sessions/${session.id}`, headers, payload: { nodeId: "gateway" } });
      __jait_capture(8, (changed.statusCode));
      const local = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "gateway turn", provider: "codex" } });
      __jait_capture(9, (local.body));
      __jait_capture(10, (gatewayProvider.startSession.mock.calls));
      __jait_capture(11, (gatewayProvider.startSession.mock.calls), ([process.cwd()]));
      __jait_capture(12, (spies[4].mock.calls));
      // A saved binding does not authorize a device after ownership changes.
      sessionService.updateChatSelection(session.id, { nodeId: node.id }, user.id);
      ws.canAccessNode = () => false;
      const denied = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "revoked device", provider: "codex" } });
      __jait_capture(13, (denied.statusCode));
      __jait_capture(14, (denied.json().error));
      __jait_capture(15, (gatewayProvider.startSession.mock.calls));
    }
  } finally {
    await app.close();
    sqlite.close();
    for (const spy of spies) spy.mockRestore();
  }

})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_external_providers_test_ts_1364_1_each1": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}
class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}
class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}
class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}
class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}
class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
  });
}
class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}
async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}
/*__jait_scope_open__*/{
const personal = true;

try {
await (async()=>{

  const { ProjectService } = await import("../../../../packages/gateway/src/services/projects.js");
  const { SurfaceRegistry } = await import("../../../../packages/gateway/src/surfaces/registry.js");
  const { FileSystemSurfaceFactory } = await import("../../../../packages/gateway/src/surfaces/filesystem.js");
  const { RemoteFileSystemSurface } = await import("../../../../packages/gateway/src/surfaces/remote-filesystem.js");
  const { RemoteCliProvider } = await import("../../../../packages/gateway/src/providers/remote-cli-provider.js");
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db);
  const user = userService.createUser("windows-project-owner", "password123");
  const projectService = new ProjectService(db);
  const root = "C:\\Users\\jakob\\Tankstelle";
  const node = { id: "windows-node", name: "Windows desktop", platform: "windows", clientId: "connected", providers: ["codex"] };
  const project = projectService.create({ userId: user.id, title: "Tankstelle", rootPath: root, nodeId: node.id });
  const sessionService = new SessionService(db);
  const session = sessionService.create(personal ? { userId: user.id } : { userId: user.id, projectId: project.id, projectPath: root });
  if (personal) sessionService.updateChatSelection(session.id, { nodeId: node.id }, user.id);
  const provider = new MockChatProvider();
  const spies = [
    vi.spyOn(RemoteCliProvider.prototype, "startSession").mockImplementation(provider.startSession),
    vi.spyOn(RemoteCliProvider.prototype, "sendTurn").mockImplementation(provider.sendTurn),
    vi.spyOn(RemoteCliProvider.prototype, "checkAvailability").mockResolvedValue(true),
    vi.spyOn(RemoteCliProvider.prototype, "onEvent").mockImplementation(provider.onEvent.bind(provider)),
    vi.spyOn(RemoteCliProvider.prototype, "stopSession").mockResolvedValue(),
  ];
  const ws = {
    canAccessNode: (_id: string, userId: string | null) => userId === user.id,
    getFsNodes: () => [node], findNodeByDeviceId: () => node,
    broadcast: vi.fn(), broadcastToUser: vi.fn(), registerGatewayFsNode: vi.fn(),
    proxyFsOp: vi.fn(async () => ({ isDirectory: true })),
  } as unknown as import("../ws.js").WsControlPlane;
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  const remote = new RemoteFileSystemSurface("windows-files", ws);
  if (!personal) {
    await remote.start({ sessionId: session.id, projectRoot: root, nodeId: node.id });
    surfaceRegistry.registerInstance(remote.id, remote);
  }
  const gatewayProvider = new MockChatProvider();
  const registry = new ProviderRegistry();
  registry.register(gatewayProvider);
  const app = await createServer(testConfig, { db, sqlite, sessionService, projectService, userService, surfaceRegistry, ws, providerRegistry: registry, audit: new AuditWriter(db) });
  try {
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({ method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` }, payload: { sessionId: session.id, content: "hello", provider: "codex" } });
    __jait_capture(0, (response.body));
    __jait_capture(1, (provider.startSession.mock.calls), ([personal ? "." : root]));
    __jait_capture(2, (surfaceRegistry.getBySession(session.id).map((s) => s.type)), (personal ? [] : ["remote-filesystem"]));
    __jait_capture(3, (provider.sendTurn.mock.calls[0]?.[1]));
    __jait_capture(4, (provider.sendTurn.mock.calls[0]?.[1]));
    if (personal) {
      const headers = { authorization: `Bearer ${token}` };
      const prewarm = await app.inject({ method: "POST", url: "/api/chat/prewarm", headers, payload: { sessionId: session.id, provider: "codex" } });
      __jait_capture(5, (prewarm.json().status));
      ws.getFsNodes = () => [];
      const offline = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "offline turn", provider: "codex" } });
      __jait_capture(6, (offline.body));
      __jait_capture(7, (gatewayProvider.startSession.mock.calls));
      // A filesystem surface left by an earlier project must not override
      // the explicit personal selection when switching back to the gateway.
      await remote.start({ sessionId: session.id, projectRoot: root, nodeId: node.id });
      surfaceRegistry.registerInstance(remote.id, remote);
      const changed = await app.inject({ method: "PATCH", url: `/api/sessions/${session.id}`, headers, payload: { nodeId: "gateway" } });
      __jait_capture(8, (changed.statusCode));
      const local = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "gateway turn", provider: "codex" } });
      __jait_capture(9, (local.body));
      __jait_capture(10, (gatewayProvider.startSession.mock.calls));
      __jait_capture(11, (gatewayProvider.startSession.mock.calls), ([process.cwd()]));
      __jait_capture(12, (spies[4].mock.calls));
      // A saved binding does not authorize a device after ownership changes.
      sessionService.updateChatSelection(session.id, { nodeId: node.id }, user.id);
      ws.canAccessNode = () => false;
      const denied = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "revoked device", provider: "codex" } });
      __jait_capture(13, (denied.statusCode));
      __jait_capture(14, (denied.json().error));
      __jait_capture(15, (gatewayProvider.startSession.mock.calls));
    }
  } finally {
    await app.close();
    sqlite.close();
    for (const spy of spies) spy.mockRestore();
  }

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
