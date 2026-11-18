// Translated fixture from packages/gateway/src/routes/repo-proposals-generate.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { CliProviderAdapter, ProviderEvent, ProviderId, ProviderInfo, ProviderSession, RuntimeMode, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { RepoProposalService } from "../../../../packages/gateway/src/services/repo-proposals.js";
import { registerRepoProposalRoutes } from "../../../../packages/gateway/src/routes/repo-proposals.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/repo-proposals-generate.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_repo_proposals_generate_test_ts_90_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class StubCliProvider implements CliProviderAdapter {
  readonly id: ProviderId = "codex";
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Stub Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private listeners = new Set<(event: ProviderEvent) => void>();
  public lastStartOptions: StartSessionOptions | null = null;
  public lastMessage: string | null = null;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    return {
      id: "stub-session",
      providerId: "codex",
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.lastMessage = message;
    for (const listener of this.listeners) {
      listener({
        type: "message",
        sessionId,
        role: "assistant",
        content: JSON.stringify([{ message: "Use selected provider for todo generation", priority: "normal", tags: ["provider"], dueDate: null }]),
      });
      listener({ type: "turn.completed", sessionId });
    }
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let sqlite: ReturnType<typeof openDatabase>["sqlite"] | null = null;
const originalFetch = globalThis.fetch;
const __jait_hook_2696 = () => {
    globalThis.fetch = originalFetch;
    sqlite?.close();
    sqlite = null;
  };

try {
await (async()=>{

    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const app = Fastify({ logger: false });
    const config = {
      ...loadConfig(),
      jwtSecret: "test-jwt-secret",
      logLevel: "silent" as const,
      llmProvider: "openai" as const,
      openaiApiKey: "test-key",
    };
    const repoService = new RepositoryService(opened.db);
    const repoProposalService = new RepoProposalService(opened.db);

    registerRepoProposalRoutes(app, config, {
      repoService,
      repoProposalService,
    });

    const repo = repoService.create({
      userId: "test-user",
      name: "repo",
      localPath: process.cwd(),
    });
    repoProposalService.create({
      repoId: repo.id,
      userId: "test-user",
      message: "Add unit tests for todo generation",
    });

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify([
            {
              message: "Add unit tests for todo generation",
              priority: "normal",
              tags: ["tests"],
              dueDate: null,
            },
            {
              message: "Review Todo page empty states",
              priority: "high",
              tags: ["ui", "todo"],
              dueDate: null,
            },
            {
              message: "Document the release workflow",
              priority: "low",
              tags: ["docs"],
              dueDate: "2026-05-10",
            },
          ]),
        },
      }],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await app.inject({
      method: "POST",
      url: `/api/repos/${repo.id}/todos/generate`,
      headers: await authHeader(config.jwtSecret),
      payload: {},
    });

    __jait_capture(0, (res.statusCode));
    const body = res.json() as { generated: number; todos: Array<{ message: string; priority: string; dueDate: string | null; tags: string }> };
    __jait_capture(1, (body.generated));
    __jait_capture(2, (body.todos.map((todo) => todo.message)));
    __jait_capture(3, (body.todos[0]), ({
      priority: "high",
      dueDate: null,
      tags: JSON.stringify(["ui", "todo"]),
    }));

    const saved = repoProposalService.listByRepo(repo.id);
    __jait_capture(4, (saved));

    await app.close();
  
})();

} finally {
await __jait_hook_2696();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_repo_proposals_generate_test_ts_176_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class StubCliProvider implements CliProviderAdapter {
  readonly id: ProviderId = "codex";
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Stub Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  private listeners = new Set<(event: ProviderEvent) => void>();
  public lastStartOptions: StartSessionOptions | null = null;
  public lastMessage: string | null = null;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.lastStartOptions = options;
    return {
      id: "stub-session",
      providerId: "codex",
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    this.lastMessage = message;
    for (const listener of this.listeners) {
      listener({
        type: "message",
        sessionId,
        role: "assistant",
        content: JSON.stringify([{ message: "Use selected provider for todo generation", priority: "normal", tags: ["provider"], dueDate: null }]),
      });
      listener({ type: "turn.completed", sessionId });
    }
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  async stopSession(): Promise<void> {
    return;
  }

  onEvent(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let sqlite: ReturnType<typeof openDatabase>["sqlite"] | null = null;
const originalFetch = globalThis.fetch;
const __jait_hook_2696 = () => {
    globalThis.fetch = originalFetch;
    sqlite?.close();
    sqlite = null;
  };

try {
await (async()=>{

    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const app = Fastify({ logger: false });
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" as const };
    const repoService = new RepositoryService(opened.db);
    const repoProposalService = new RepoProposalService(opened.db);
    const providerRegistry = new ProviderRegistry();
    const stubProvider = new StubCliProvider();
    providerRegistry.register(stubProvider);

    registerRepoProposalRoutes(app, config, {
      repoService,
      repoProposalService,
      providerRegistry,
    });

    const repo = repoService.create({
      userId: "test-user",
      name: "repo",
      localPath: process.cwd(),
    });

    const runtimeMode: RuntimeMode = "supervised";
    const res = await app.inject({
      method: "POST",
      url: `/api/repos/${repo.id}/todos/generate`,
      headers: await authHeader(config.jwtSecret),
      payload: {
        provider: "codex",
        model: "gpt-5-codex",
        runtimeMode,
      },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (stubProvider.lastStartOptions?.workingDirectory), (repo.localPath));
    __jait_capture(2, (stubProvider.lastStartOptions?.model));
    __jait_capture(3, (stubProvider.lastStartOptions?.mode));
    __jait_capture(4, (stubProvider.lastMessage));

    const body = res.json() as { generated: number; todos: Array<{ message: string }> };
    __jait_capture(5, (body.generated));
    __jait_capture(6, (body.todos[0]?.message));

    await app.close();
  
})();

} finally {
await __jait_hook_2696();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
