// Translated fixture from packages/gateway/src/routes/remote-threads.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { registerThreadRoutes } from "../../../../packages/gateway/src/routes/threads.js";
import { registerGitRoutes } from "../../../../packages/gateway/src/routes/git.js";
import type { FsNode } from "@jait/shared";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/remote-threads.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_237_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const res = await app.inject({
      method: "POST",
      url: "/api/git/create-branch",
      headers,
      payload: { cwd: REMOTE_CWD, branch: "jait/test-branch", baseBranch: "main" },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));

    // Verify git commands were proxied
    const gitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git");
    __jait_capture(2, (gitCalls.length)); // checkout main, then checkout -b
    __jait_capture(3, (gitCalls[0]!.params.args));
    __jait_capture(4, (gitCalls[1]!.params.args));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_257_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const res = await app.inject({
      method: "POST",
      url: "/api/git/create-worktree",
      headers,
      payload: { cwd: REMOTE_CWD, baseBranch: "main", newBranch: "jait/feature-123" },
    });

    __jait_capture(0, (res.statusCode));
    const body = res.json();
    __jait_capture(1, (body.branch));
    __jait_capture(2, (body.path));

    const wtCalls = mockWs.fsOpCalls.filter((c) => c.op === "git-create-worktree");
    __jait_capture(3, (wtCalls.length));
    __jait_capture(4, (wtCalls[0]!.params), ({
      cwd: REMOTE_CWD,
      baseBranch: "main",
      newBranch: "jait/feature-123",
    }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_281_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const res = await app.inject({
      method: "POST",
      url: "/api/git/pull",
      headers,
      payload: { cwd: REMOTE_CWD },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));
    const gitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git");
    __jait_capture(2, (gitCalls.some((c) => (c.params.args as string).includes("pull --rebase"))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_297_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const res = await app.inject({
      method: "POST",
      url: "/api/git/checkout",
      headers,
      payload: { cwd: REMOTE_CWD, branch: "feature/test" },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));
    const gitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git");
    __jait_capture(2, (gitCalls.some((c) => (c.params.args as string).includes('checkout "feature/test"'))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_313_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const res = await app.inject({
      method: "POST",
      url: "/api/git/run-commit-flow",
      headers,
      payload: { cwd: REMOTE_CWD },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));

    const flowCalls = mockWs.fsOpCalls.filter((c) => c.op === "git-run-commit-flow");
    __jait_capture(2, (flowCalls.length));
    __jait_capture(3, (flowCalls[0]!.params), ({ cwd: REMOTE_CWD }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_337_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    // Step 1: Create a thread pointing to a remote Windows path
    const createRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "[MyApp] Generating title…",
        providerId: "codex",
        workingDirectory: REMOTE_CWD,
        branch: "jait/feature-001",
      },
    });

    __jait_capture(0, (createRes.statusCode));
    const thread = createRes.json() as { id: string };

    // Step 2: Start the thread → should create a RemoteCliProvider
    const startRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: {
        message: "Add error handling to the API routes",
        titleTask: "Add error handling to the API routes",
        titlePrefix: "[MyApp] ",
      },
    });

    __jait_capture(1, (startRes.statusCode));
    const started = startRes.json() as { id: string; status: string; providerSessionId: string };
    __jait_capture(2, (started.status));
    __jait_captureType(3, (started.providerSessionId));

    const sessionId = started.providerSessionId;

    // Verify provider operations were proxied: start-session was called
    const startCalls = mockWs.providerOpCalls.filter((c) => c.op === "start-session");
    __jait_capture(4, (startCalls.length));
    __jait_capture(5, (startCalls[0]!.params.workingDirectory), (REMOTE_CWD));
    __jait_capture(6, (startCalls[0]!.params.providerId));
    __jait_capture(7, (startCalls[0]!.params.mcpServers));

    // The /start handler fires title generation + coding turn in background.
    // Wait a tick for the async background task to call send-turn.
    await new Promise((r) => setTimeout(r, 100));

    // Verify send-turn was called (title gen is the first turn for codex)
    const sendCalls = mockWs.providerOpCalls.filter((c) => c.op === "send-turn");
    __jait_capture(8, (sendCalls.length));

    // Step 3: Simulate title generation turn events from the remote child
    mockWs.fireRemoteEvents(sessionId, [
      { method: "item/agentMessage/delta", params: { delta: "Add Error " } },
      { method: "item/agentMessage/delta", params: { delta: "Handling" } },
      { method: "turn/completed" },
    ]);

    // Allow time for title gen to complete and coding turn to fire
    await new Promise((r) => setTimeout(r, 200));

    // The title turn's turn.completed should have been suppressed (not marking thread completed).
    // The coding turn send-turn should have been called.
    const allSendCalls = mockWs.providerOpCalls.filter((c) => c.op === "send-turn");
    __jait_capture(9, (allSendCalls.length)); // title gen turn + coding turn

    // Verify title was updated (normalized from "Add Error Handling")
    const threadAfterTitle = threadService.getById(thread.id);
    __jait_capture(10, (threadAfterTitle?.title));
    __jait_capture(11, (threadAfterTitle?.title));

    // Step 4: Simulate coding turn events from the remote child
    mockWs.fireRemoteEvents(sessionId, [
      {
        method: "item/started",
        params: { item: { id: "call-1", type: "commandExecution", command: "echo hello" } },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: { itemId: "call-1", delta: "hello" },
      },
      {
        method: "item/completed",
        params: { item: { id: "call-1", type: "commandExecution", status: "completed", output: "hello" } },
      },
      { method: "item/agentMessage/delta", params: { delta: "I've added error handling." } },
      { method: "turn/completed" },
    ]);

    // Allow time for events to propagate
    await new Promise((r) => setTimeout(r, 50));

    // Step 5: Verify thread is marked completed
    const threadAfterComplete = threadService.getById(thread.id);
    __jait_capture(12, (threadAfterComplete?.status));
    __jait_captureType(13, (threadAfterComplete?.completedAt));

    // Step 6: Verify activities were logged
    const activitiesRes = await app.inject({
      method: "GET",
      url: `/api/threads/${thread.id}/activities`,
      headers,
    });

    __jait_capture(14, (activitiesRes.statusCode));
    const { activities } = activitiesRes.json() as {
      activities: Array<{ kind: string; summary: string; payload?: unknown }>;
    };

    // Should have: user message activity, tool.start, tool.result, token, turn.completed
    __jait_capture(15, (activities.length));

    // Check user message was logged
    __jait_capture(16, (activities.some((a) => a.kind === "message" && a.summary.includes("error handling"))));

    // Check tool events were logged
    __jait_capture(17, (activities.some((a) => a.kind === "tool.start")));
    __jait_capture(18, (activities.some((a) => a.kind === "tool.result" || a.kind === "tool.error")));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_473_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const createRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "Test session cleanup",
        providerId: "codex",
        workingDirectory: REMOTE_CWD,
      },
    });

    __jait_capture(0, (createRes.statusCode));
    const thread = createRes.json() as { id: string };
    const startRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Do something" },
    });

    const started = startRes.json() as { providerSessionId: string };
    await new Promise((r) => setTimeout(r, 100));

    // Simulate the title gen turn completing, then the coding turn completing
    mockWs.fireRemoteEvents(started.providerSessionId, [
      { method: "turn/completed" },
    ]);
    await new Promise((r) => setTimeout(r, 200));

    // Now coding turn has started, simulate coding + session exit
    mockWs.fireRemoteEvents(started.providerSessionId, [
      { method: "turn/completed" },
    ]);
    await new Promise((r) => setTimeout(r, 50));

    // Then child exits
    mockWs.fireRemoteEvents(started.providerSessionId, [
      { method: "session/completed" },
    ]);
    await new Promise((r) => setTimeout(r, 50));

    const threadAfter = threadService.getById(thread.id);
    __jait_capture(1, (threadAfter?.status));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_522_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const createRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "Stopped thread",
        providerId: "codex",
        workingDirectory: REMOTE_CWD,
      },
    });

    __jait_capture(0, (createRes.statusCode));
    const thread = createRes.json() as { id: string };

    const firstStartRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "first task", titleTask: "first task" },
    });
    __jait_capture(1, (firstStartRes.statusCode));
    const firstStarted = firstStartRes.json() as { providerSessionId: string };

    const firstActivities = threadService.getActivities(thread.id);
    __jait_capture(2, (firstActivities.some((activity) => activity.kind === "message" && activity.summary.includes("first task"))));

    const stopRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/stop`,
      headers,
    });
    __jait_capture(3, (stopRes.statusCode));
    __jait_capture(4, (threadService.getById(thread.id)?.status));

    mockWs.fireRemoteEvents(firstStarted.providerSessionId, [
      { method: "turn/completed" },
      { method: "session/completed" },
    ]);
    await new Promise((r) => setTimeout(r, 50));
    __jait_capture(5, (threadService.getById(thread.id)?.status));

    const secondStartRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "second task", titleTask: "second task" },
    });
    __jait_capture(6, (secondStartRes.statusCode));
    const secondStarted = secondStartRes.json() as { providerSessionId: string; status: string };
    __jait_capture(7, (secondStarted.status));
    __jait_capture(8, (secondStarted.providerSessionId), (firstStarted.providerSessionId));

    const secondActivities = threadService.getActivities(thread.id);
    __jait_capture(9, (secondActivities.some((activity) => activity.kind === "message" && activity.summary.includes("second task"))));
    __jait_capture(10, (secondActivities.filter((activity) => activity.kind === "message")));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_583_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    const createRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "Restarted gateway stop",
        providerId: "codex",
        workingDirectory: REMOTE_CWD,
      },
    });

    __jait_capture(0, (createRes.statusCode));
    const thread = createRes.json() as { id: string };

    const startRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "keep working" },
    });
    __jait_capture(1, (startRes.statusCode));
    const started = startRes.json() as { providerSessionId: string };
    __jait_capture(2, (threadService.getById(thread.id)?.executionNodeId), (mockWs.remoteNodeId));

    await app.close();
    app = Fastify({ logger: false });
    threadService.queueRestartRecovery();
    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      ws: mockWs as unknown as WsControlPlane,
    });

    const stopCallsBefore = mockWs.providerOpCalls.filter((call) => call.op === "stop-session").length;
    const stopRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/stop`,
      headers,
    });

    __jait_capture(3, (stopRes.statusCode));
    __jait_capture(4, (mockWs.providerOpCalls.filter((call) => call.op === "stop-session")), (stopCallsBefore + 1));
    __jait_capture(5, (mockWs.providerOpCalls.at(-1)), ({
      op: "stop-session",
      params: { sessionId: started.providerSessionId },
    }));
    __jait_capture(6, (threadService.getById(thread.id)?.status));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_remote_threads_test_ts_638_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track the onRemoteProviderEvent callback — RemoteCliProvider sets this
  let onRemoteProviderEvent: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined;

  // Track pending provider ops for assertions
  const providerOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // State: provider thread IDs returned by start-session.
  let providerThreadCounter = 0;

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        case "git-run-commit-flow": {
          return {
            version: { previousVersion: "1.0.0", nextVersion: "1.0.1", files: [`${params.cwd}\\package.json`] },
            sync: { status: "skipped_up_to_date", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
            git: {
              commit: { status: "created", commitSha: "abc123", subject: "chore: bump version to v1.0.1" },
              push: { status: "pushed", branch: "jait/test-branch", upstreamBranch: "origin/jait/test-branch" },
              branch: { status: "skipped_not_requested" },
              pr: { status: "skipped_not_requested" },
            },
          } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Provider operation proxy ───────────────────────────────────
    proxyProviderOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      providerOpCalls.push({ op, params });

      switch (op) {
        case "list-models":
          return [] as T;

        case "start-session":
          providerThreadCounter += 1;
          return {
            ok: true,
            providerThreadId: `remote-thread-${providerThreadCounter}`,
          } as T;

        case "send-turn":
          // The mock doesn't auto-fire events here — tests call
          // fireRemoteEvents() to simulate the child process emitting.
          return { ok: true } as T;

        case "stop-session":
          return { ok: true } as T;

        default:
          throw new Error(`Unexpected provider op in test: ${op}`);
      }
    }),

    // ── Provider event callback ────────────────────────────────────
    get onRemoteProviderEvent() { return onRemoteProviderEvent; },
    set onRemoteProviderEvent(fn: ((sessionId: string, event: unknown, metadata?: { streamId: string; seq: number }) => void) | undefined) {
      onRemoteProviderEvent = fn;
    },

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────

    /** Simulate the remote child process emitting events */
    fireRemoteEvents(sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) {
      for (const event of events) {
        if (onRemoteProviderEvent) {
          onRemoteProviderEvent(sessionId, event);
        }
      }
    },

    /** Access recorded calls for assertions */
    providerOpCalls,
    fsOpCalls,
    remoteNodeId,
  } as unknown as WsControlPlane & {
    fireRemoteEvents: (sessionId: string, events: Array<{ method: string; params?: Record<string, unknown> }>) => void;
    providerOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
  };

  return mock;
}
async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
const REMOTE_CWD = "E:\\Projects\\MyApp";
/*__jait_scope_open__*/{
let app: ReturnType<typeof Fastify>;
let sqlite: ReturnType<typeof openDatabase>["sqlite"];
let threadService: ThreadService;
let mockWs: ReturnType<typeof createMockWsControlPlane>;
let headers: Record<string, string>;
let config: ReturnType<typeof loadConfig> & { jwtSecret: string };
const __jait_hook_7981 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();

    const providerRegistry = new ProviderRegistry();
    // Note: NOT registering a local codex provider — the remote provider
    // should be created dynamically in the /start handler.

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  };
await __jait_hook_7981();
try {
await (async()=>{

    // Test multiple git routes in sequence
    const ops = [
      { url: "/api/git/pull", payload: { cwd: REMOTE_CWD } },
      { url: "/api/git/checkout", payload: { cwd: REMOTE_CWD, branch: "main" } },
      { url: "/api/git/create-branch", payload: { cwd: REMOTE_CWD, branch: "jait/new", baseBranch: "main" } },
      { url: "/api/git/create-worktree", payload: { cwd: REMOTE_CWD, baseBranch: "main", newBranch: "jait/wt" } },
    ];

    for (const op of ops) {
      const res = await app.inject({
        method: "POST",
        url: op.url,
        headers,
        payload: op.payload,
      });
      __jait_capture(0, (res.statusCode));
    }

    // Every operation should have been proxied (no local git execution)
    const allGitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git" || c.op === "git-create-worktree");
    __jait_capture(1, (allGitCalls.length));

    // No local operations should have been attempted for the remote path
    // (if they were, the test would fail because E:\Projects\MyApp doesn't exist)

    await app.close();
    sqlite.close();
  
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
