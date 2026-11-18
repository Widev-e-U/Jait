// Translated fixture from packages/gateway/src/pr-state.test.ts; expected literals are in tail_static.rs.
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { GitStepResult } from "../../../../packages/gateway/src/services/git.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  StartSessionOptions,
} from "../../../../packages/gateway/src/providers/contracts.js";
import { EventEmitter } from "node:events";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/pr-state.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_pr_state_test_ts_112_3": {


class StubProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex", name: "Stub", description: "", available: true, modes: ["full-access"],
  };
  private emitter = new EventEmitter();
  private n = 0;
  async checkAvailability() { return true; }
  async listModels(): Promise<ProviderModelInfo[]> { return []; }
  async startSession(o: StartSessionOptions): Promise<ProviderSession> {
    const id = `stub-${++this.n}`;
    return { id, providerId: this.id, threadId: o.threadId, status: "running", runtimeMode: o.mode, startedAt: new Date().toISOString() };
  }
  async sendTurn() {}
  async interruptTurn() {}
  async respondToApproval() {}
  async stopSession(sid: string) { this.emit({ type: "session.completed", sessionId: sid }); }
  onEvent(h: (e: ProviderEvent) => void) { this.emitter.on("e", h); return () => { this.emitter.off("e", h); }; }
  emit(e: ProviderEvent) { this.emitter.emit("e", e); }
}
function cfg() {
  return { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test" };
}
function mockGitServiceExistingPr(prUrl: string) {
  return {
    async runStackedAction(): Promise<GitStepResult> {
      return {
        commit: { status: "skipped_no_changes" },
        push: { status: "pushed", branch: "jait/test-branch" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "opened_existing",
          url: prUrl,
          number: 42,
          baseBranch: "main",
          headBranch: "jait/test-branch",
          title: "Test PR",
        },
      };
    },
  };
}
async function setup(gitService?: { runStackedAction: (...args: unknown[]) => Promise<GitStepResult> }) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const provider = new StubProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(cfg(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
    gitService: gitService as never,
  });

  const token = await signAuthToken(
    { id: "pr-test-user", username: "pr-test-user" },
    cfg().jwtSecret,
  );
  const inject = (opts: Parameters<typeof app.inject>[0]) =>
    app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...(typeof opts === "object" && "headers" in opts ? opts.headers : {}) } });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prUrl = "https://github.com/test/repo/pull/42";
    const { app, sqlite, provider, threadService, inject } = await setup(
      mockGitServiceExistingPr(prUrl),
    );

    try {
      // Create a thread with a working directory so create-pr doesn't reject
      const createRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "PR Test", providerId: "codex", workingDirectory: process.cwd() },
      });
      const thread = JSON.parse(createRes.body) as { id: string };

      // Mark thread as completed (create-pr requires completedAt)
      threadService.markCompleted(thread.id);

      // Call create-pr — mock returns "opened_existing"
      const prRes = await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/create-pr`,
        payload: { baseBranch: "main" },
      });

      __jait_capture(0, (prRes.statusCode));
      const prBody = JSON.parse(prRes.body);

      // ── The response must include the PR URL and the updated thread ──
      __jait_capture(1, (prBody.prUrl), (prUrl));
      __jait_captureType(2, (prBody.thread));
      __jait_capture(3, (prBody.thread.prUrl), (prUrl));
      __jait_capture(4, (prBody.thread.prState));
      __jait_capture(5, (prBody.thread.prNumber));

      // ── The DB must also have persisted it ──
      const dbThread = threadService.getById(thread.id);
      __jait_capture(6, (dbThread?.prUrl), (prUrl));
      __jait_capture(7, (dbThread?.prState));
      __jait_capture(8, (dbThread?.prNumber));
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
case "tailstatic_packages_gateway_src_pr_state_test_ts_158_3": {


class StubProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex", name: "Stub", description: "", available: true, modes: ["full-access"],
  };
  private emitter = new EventEmitter();
  private n = 0;
  async checkAvailability() { return true; }
  async listModels(): Promise<ProviderModelInfo[]> { return []; }
  async startSession(o: StartSessionOptions): Promise<ProviderSession> {
    const id = `stub-${++this.n}`;
    return { id, providerId: this.id, threadId: o.threadId, status: "running", runtimeMode: o.mode, startedAt: new Date().toISOString() };
  }
  async sendTurn() {}
  async interruptTurn() {}
  async respondToApproval() {}
  async stopSession(sid: string) { this.emit({ type: "session.completed", sessionId: sid }); }
  onEvent(h: (e: ProviderEvent) => void) { this.emitter.on("e", h); return () => { this.emitter.off("e", h); }; }
  emit(e: ProviderEvent) { this.emitter.emit("e", e); }
}
function cfg() {
  return { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test" };
}
function mockGitServiceExistingPr(prUrl: string) {
  return {
    async runStackedAction(): Promise<GitStepResult> {
      return {
        commit: { status: "skipped_no_changes" },
        push: { status: "pushed", branch: "jait/test-branch" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "opened_existing",
          url: prUrl,
          number: 42,
          baseBranch: "main",
          headBranch: "jait/test-branch",
          title: "Test PR",
        },
      };
    },
  };
}
async function setup(gitService?: { runStackedAction: (...args: unknown[]) => Promise<GitStepResult> }) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const provider = new StubProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(cfg(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
    gitService: gitService as never,
  });

  const token = await signAuthToken(
    { id: "pr-test-user", username: "pr-test-user" },
    cfg().jwtSecret,
  );
  const inject = (opts: Parameters<typeof app.inject>[0]) =>
    app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...(typeof opts === "object" && "headers" in opts ? opts.headers : {}) } });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prUrl = "https://github.com/test/repo/pull/42";
    const { app, sqlite, threadService, inject } = await setup(
      mockGitServiceExistingPr(prUrl),
    );

    try {
      const createRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Race Test", providerId: "codex", workingDirectory: process.cwd() },
      });
      const thread = JSON.parse(createRes.body) as { id: string };
      threadService.markCompleted(thread.id);

      // create-pr persists PR data
      await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/create-pr`,
        payload: { baseBranch: "main" },
      });

      // Verify it was persisted
      const before = threadService.getById(thread.id);
      __jait_capture(0, (before?.prUrl), (prUrl));
      __jait_capture(1, (before?.prState));

      // ── Simulate the frontend polling-clear race: ──
      // The PR-state polling effect calls PATCH with prState: null and prUrl: null
      // when git status doesn't find a PR (gh unavailable / FsNode offline).
      const patchRes = await inject({
        method: "PATCH",
        url: `/api/threads/${thread.id}`,
        payload: { prUrl: null, prNumber: null, prTitle: null, prState: null },
      });
      __jait_capture(2, (patchRes.statusCode));

      // ── BUG FIX: the PATCH with null should not erase create-pr data,
      //    but since the PATCH route itself is intentionally permissive,
      //    the real fix is in the frontend polling (useAutomation.ts) which
      //    no longer sends prState: null when gh finds no PR.
      //    This test verifies the backend PATCH still accepts explicit nulls
      //    (for legitimate use-cases), so we confirm the DB was cleared. ──
      const after = threadService.getById(thread.id);
      __jait_captureType(3, (after?.prUrl));
      __jait_captureType(4, (after?.prState));
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
case "tailstatic_packages_gateway_src_pr_state_test_ts_210_3": {


class StubProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex", name: "Stub", description: "", available: true, modes: ["full-access"],
  };
  private emitter = new EventEmitter();
  private n = 0;
  async checkAvailability() { return true; }
  async listModels(): Promise<ProviderModelInfo[]> { return []; }
  async startSession(o: StartSessionOptions): Promise<ProviderSession> {
    const id = `stub-${++this.n}`;
    return { id, providerId: this.id, threadId: o.threadId, status: "running", runtimeMode: o.mode, startedAt: new Date().toISOString() };
  }
  async sendTurn() {}
  async interruptTurn() {}
  async respondToApproval() {}
  async stopSession(sid: string) { this.emit({ type: "session.completed", sessionId: sid }); }
  onEvent(h: (e: ProviderEvent) => void) { this.emitter.on("e", h); return () => { this.emitter.off("e", h); }; }
  emit(e: ProviderEvent) { this.emitter.emit("e", e); }
}
function cfg() {
  return { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test" };
}
function mockGitServiceExistingPr(prUrl: string) {
  return {
    async runStackedAction(): Promise<GitStepResult> {
      return {
        commit: { status: "skipped_no_changes" },
        push: { status: "pushed", branch: "jait/test-branch" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "opened_existing",
          url: prUrl,
          number: 42,
          baseBranch: "main",
          headBranch: "jait/test-branch",
          title: "Test PR",
        },
      };
    },
  };
}
async function setup(gitService?: { runStackedAction: (...args: unknown[]) => Promise<GitStepResult> }) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const provider = new StubProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(cfg(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
    gitService: gitService as never,
  });

  const token = await signAuthToken(
    { id: "pr-test-user", username: "pr-test-user" },
    cfg().jwtSecret,
  );
  const inject = (opts: Parameters<typeof app.inject>[0]) =>
    app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...(typeof opts === "object" && "headers" in opts ? opts.headers : {}) } });

  return { app, sqlite, provider, threadService, inject };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prUrl = "https://github.com/test/repo/pull/42";
    const { app, sqlite, threadService, inject } = await setup(
      mockGitServiceExistingPr(prUrl),
    );

    try {
      const createRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: {
          title: "Merge Test",
          providerId: "codex",
          workingDirectory: process.cwd(),
          branch: "jait/test-branch",
        },
      });
      const thread = JSON.parse(createRes.body) as { id: string };
      threadService.markCompleted(thread.id);
      // Give it a fake providerSessionId to verify clearSession works
      threadService.update(thread.id, { providerSessionId: "fake-session" } as never);

      // Set PR state to open first
      await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/create-pr`,
        payload: { baseBranch: "main" },
      });

      // Now simulate merge
      const mergeRes = await inject({
        method: "PATCH",
        url: `/api/threads/${thread.id}`,
        payload: { prState: "merged" },
      });
      __jait_capture(0, (mergeRes.statusCode));

      const merged = threadService.getById(thread.id);
      __jait_capture(1, (merged?.prState));
      // clearSession should have been called — providerSessionId should be null
      __jait_captureType(2, (merged?.providerSessionId));
      __jait_captureType(3, (merged?.workingDirectory));
      __jait_capture(4, (merged?.branch));
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
