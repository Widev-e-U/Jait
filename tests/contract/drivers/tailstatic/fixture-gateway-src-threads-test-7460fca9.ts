// Translated fixture from packages/gateway/src/threads.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/threads.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_threads_test_ts_123_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private nextSessionNumber = 1;
  readonly sentTurns: Array<{ sessionId: string; message: string; attachments?: string[] }> = [];

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `mock-session-${this.nextSessionNumber++}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string, attachments?: string[]): Promise<void> {
    this.sentTurns.push({ sessionId, message, attachments });
  }

  async interruptTurn(_sessionId: string): Promise<void> {
    return;
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
function testConfig() {
  return {
    ...loadConfig(),
    port: 0,
    wsPort: 0,
    logLevel: "silent" as const,
    nodeEnv: "test",
  };
}
async function setupThreadApp() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);

  const provider = new MockThreadProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(testConfig(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
  });

  const token = await signAuthToken(
    { id: "thread-test-user", username: "thread-test-user" },
    testConfig().jwtSecret,
  );

  const inject = (options: Parameters<typeof app.inject>[0]) =>
    app.inject({
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(typeof options === "object" && "headers" in options ? options.headers : {}),
      },
    });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, sqlite, provider, inject } = await setupThreadApp();
    try {
      const threadA = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Thread A", providerId: "codex" },
      });
      const threadB = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Thread B", providerId: "codex" },
      });

      const createdA = JSON.parse(threadA.body) as { id: string };
      const createdB = JSON.parse(threadB.body) as { id: string };

      const startedA = await inject({
        method: "POST",
        url: `/api/threads/${createdA.id}/start`,
      });
      const startedB = await inject({
        method: "POST",
        url: `/api/threads/${createdB.id}/start`,
      });

      const activeA = JSON.parse(startedA.body) as { providerSessionId: string };
      JSON.parse(startedB.body);

      provider.emit({
        type: "message",
        sessionId: activeA.providerSessionId,
        role: "assistant",
        content: "only thread a should persist this",
      });

      const activitiesA = await inject({
        method: "GET",
        url: `/api/threads/${createdA.id}/activities`,
      });
      const activitiesB = await inject({
        method: "GET",
        url: `/api/threads/${createdB.id}/activities`,
      });

      const bodyA = JSON.parse(activitiesA.body) as { activities: Array<{ kind: string; payload?: { content?: string } }> };
      const bodyB = JSON.parse(activitiesB.body) as { activities: Array<{ kind: string; payload?: { content?: string } }> };

      __jait_capture(0, (bodyA.activities.some(
          (activity) =>
            activity.kind === "message" &&
            activity.payload?.content === "only thread a should persist this",
        )));
      __jait_capture(1, (bodyB.activities.some(
          (activity) =>
            activity.kind === "message" &&
            activity.payload?.content === "only thread a should persist this",
        )));
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
case "tailstatic_packages_gateway_src_threads_test_ts_191_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private nextSessionNumber = 1;
  readonly sentTurns: Array<{ sessionId: string; message: string; attachments?: string[] }> = [];

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `mock-session-${this.nextSessionNumber++}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string, attachments?: string[]): Promise<void> {
    this.sentTurns.push({ sessionId, message, attachments });
  }

  async interruptTurn(_sessionId: string): Promise<void> {
    return;
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
function testConfig() {
  return {
    ...loadConfig(),
    port: 0,
    wsPort: 0,
    logLevel: "silent" as const,
    nodeEnv: "test",
  };
}
async function setupThreadApp() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);

  const provider = new MockThreadProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(testConfig(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
  });

  const token = await signAuthToken(
    { id: "thread-test-user", username: "thread-test-user" },
    testConfig().jwtSecret,
  );

  const inject = (options: Parameters<typeof app.inject>[0]) =>
    app.inject({
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(typeof options === "object" && "headers" in options ? options.headers : {}),
      },
    });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, sqlite, threadService, inject } = await setupThreadApp();
    try {
      const threadRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Long Thread", providerId: "codex" },
      });
      const thread = JSON.parse(threadRes.body) as { id: string };

      for (let i = 0; i < 150; i += 1) {
        threadService.addActivity(thread.id, "message", `message ${i}`, {
          role: i % 2 === 0 ? "user" : "assistant",
          content: `message ${i}`,
        });
      }

      const activitiesRes = await inject({
        method: "GET",
        url: `/api/threads/${thread.id}/activities`,
      });
      const body = JSON.parse(activitiesRes.body) as { activities: Array<unknown> };

      __jait_capture(0, (body.activities));
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
case "tailstatic_packages_gateway_src_threads_test_ts_221_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private nextSessionNumber = 1;
  readonly sentTurns: Array<{ sessionId: string; message: string; attachments?: string[] }> = [];

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `mock-session-${this.nextSessionNumber++}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string, attachments?: string[]): Promise<void> {
    this.sentTurns.push({ sessionId, message, attachments });
  }

  async interruptTurn(_sessionId: string): Promise<void> {
    return;
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
function testConfig() {
  return {
    ...loadConfig(),
    port: 0,
    wsPort: 0,
    logLevel: "silent" as const,
    nodeEnv: "test",
  };
}
async function setupThreadApp() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);

  const provider = new MockThreadProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(testConfig(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
  });

  const token = await signAuthToken(
    { id: "thread-test-user", username: "thread-test-user" },
    testConfig().jwtSecret,
  );

  const inject = (options: Parameters<typeof app.inject>[0]) =>
    app.inject({
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(typeof options === "object" && "headers" in options ? options.headers : {}),
      },
    });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, sqlite, provider, inject } = await setupThreadApp();
    try {
      const threadRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Interleaved Thread", providerId: "codex" },
      });
      const thread = JSON.parse(threadRes.body) as { id: string };

      const startedRes = await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/start`,
      });
      const started = JSON.parse(startedRes.body) as { providerSessionId: string };

      provider.emit({ type: "token", sessionId: started.providerSessionId, content: "First " });
      provider.emit({ type: "token", sessionId: started.providerSessionId, content: "answer." });
      provider.emit({
        type: "tool.start",
        sessionId: started.providerSessionId,
        tool: "file.read",
        args: { path: "app.ts" },
        callId: "call-1",
      });
      provider.emit({
        type: "tool.result",
        sessionId: started.providerSessionId,
        tool: "file.read",
        ok: true,
        message: "read app.ts",
        callId: "call-1",
      });
      provider.emit({ type: "token", sessionId: started.providerSessionId, content: "Second answer." });
      provider.emit({ type: "turn.completed", sessionId: started.providerSessionId });

      const activitiesRes = await inject({
        method: "GET",
        url: `/api/threads/${thread.id}/activities`,
      });
      const body = JSON.parse(activitiesRes.body) as {
        activities: Array<{ kind: string; payload?: { role?: string; content?: string; tool?: string } }>;
      };
      const ordered = [...body.activities].reverse()
        .filter((activity) => activity.kind === "message" || activity.kind.startsWith("tool."));

      __jait_capture(0, (ordered.map((activity) => activity.kind)));
      __jait_capture(1, (ordered[0]?.payload?.content));
      __jait_capture(2, (ordered[3]?.payload?.content));
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
case "tailstatic_packages_gateway_src_threads_test_ts_281_3": {


class MockThreadProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private emitter = new EventEmitter();
  private nextSessionNumber = 1;
  readonly sentTurns: Array<{ sessionId: string; message: string; attachments?: string[] }> = [];

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [];
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    const sessionId = `mock-session-${this.nextSessionNumber++}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string, attachments?: string[]): Promise<void> {
    this.sentTurns.push({ sessionId, message, attachments });
  }

  async interruptTurn(_sessionId: string): Promise<void> {
    return;
  }

  async respondToApproval(_sessionId: string, _requestId: string, _approved: boolean): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.emit({ type: "session.completed", sessionId });
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  emit(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }
}
function testConfig() {
  return {
    ...loadConfig(),
    port: 0,
    wsPort: 0,
    logLevel: "silent" as const,
    nodeEnv: "test",
  };
}
async function setupThreadApp() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);

  const provider = new MockThreadProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(testConfig(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
  });

  const token = await signAuthToken(
    { id: "thread-test-user", username: "thread-test-user" },
    testConfig().jwtSecret,
  );

  const inject = (options: Parameters<typeof app.inject>[0]) =>
    app.inject({
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(typeof options === "object" && "headers" in options ? options.headers : {}),
      },
    });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, sqlite, provider, inject } = await setupThreadApp();
    try {
      const threadRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Steered Thread", providerId: "codex" },
      });
      const thread = JSON.parse(threadRes.body) as { id: string };

      const startedRes = await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/start`,
      });
      const started = JSON.parse(startedRes.body) as { providerSessionId: string };

      const steerRes = await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/steer`,
        payload: { message: "Use the smaller fix." },
      });

      __jait_capture(0, (steerRes.statusCode));
      __jait_capture(1, (provider.sentTurns));

      provider.emit({ type: "turn.completed", sessionId: started.providerSessionId });
      await new Promise((resolve) => setTimeout(resolve, 0));

      __jait_capture(2, (provider.sentTurns), ([
        { sessionId: started.providerSessionId, message: "Use the smaller fix.", attachments: undefined },
      ]));
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
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
