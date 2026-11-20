// Translated fixture from packages/gateway/src/services/orchestration/acp-worker.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TaskWorker } from "@jait/shared/types";
import { type JaitDB, migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import { PlanService } from "../../../../packages/gateway/src/services/plans.js";
import type { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { createAcpWorkflowWorker } from "../../../../packages/gateway/src/services/orchestration/acp-worker.js";
import { createWorkflowVerifier, type ToolExecutorFn } from "../../../../packages/gateway/src/services/orchestration/command-verifier.js";
import { type SubAgentRunner, type SubAgentRunRequest, SubAgentTaskExecutor, unboundSubAgentRunner } from "../../../../packages/gateway/src/services/orchestration/executor.js";
import { OrchestrationService, workflowSessionId } from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import { routeWorkers } from "../../../../packages/gateway/src/services/orchestration/worker-router.js";
import { integrationBranchName, WorkflowWorkspaces } from "../../../../packages/gateway/src/services/orchestration/workspace.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/acp-worker.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_167_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { provider, worker } = setupWorker({ reply: () => '{"status":"completed"}' });
    const refs: string[] = [];
    const result = await worker.run(requestFor({ recordAgentRef: (ref) => refs.push(ref) }));

    __jait_capture(0, (result));
    __jait_capture(1, (provider.started));
    __jait_capture(2, (provider.started[0]));
    __jait_capture(3, (refs));
    __jait_capture(4, (provider.stopped));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_183_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { provider, worker } = setupWorker({ modes: ["full-access"] });
    await __jait_rejected(0, worker.run(requestFor()));
    __jait_capture(1, (provider.started));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_189_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { provider, worker } = setupWorker();
    await __jait_rejected(0, worker.run(requestFor({ workspace: null })));
    await __jait_rejected(1, worker.run(requestFor({ workspace: { path: "/worktrees/run-1/guide", mode: "read" } })));
    __jait_capture(2, (provider.started));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_197_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { provider, worker } = setupWorker({ behavior: "hang" });
    await __jait_rejected(0, worker.run(requestFor({ timeoutMs: 20 })));
    __jait_capture(1, (provider.stopped));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_203_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { worker } = setupWorker({ behavior: "fail" });
    await __jait_rejected(0, worker.run(requestFor()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_208_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { provider, worker, consentManager } = setupWorker({ approval: APPROVAL });
    const run = worker.run(requestFor());
    await until(() => consentManager.listPending(workflowSessionId("run-1")).length === 1);

    const [pending] = consentManager.listPending(workflowSessionId("run-1"));
    if (!pending) throw new Error("no approval was requested");
    __jait_capture(0, (pending), ({ toolName: "acp.claude-code", risk: "high", sessionId: workflowSessionId("run-1") }));
    __jait_capture(1, (pending.summary));
    __jait_capture(2, (pending.preview));

    consentManager.approve(pending.id);
    await __jait_captureResolved(3, (run));
    __jait_capture(4, (provider.answers));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_224_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { provider, worker, consentManager } = setupWorker({
      approval: APPROVAL,
      reply: () => '{"status":"blocked","error":"the owner refused the write"}',
    });
    const run = worker.run(requestFor());
    await until(() => consentManager.listPending(workflowSessionId("run-1")).length === 1);

    const [pending] = consentManager.listPending(workflowSessionId("run-1"));
    if (!pending) throw new Error("no approval was requested");
    consentManager.reject(pending.id);
    await __jait_captureResolved(0, (run));
    __jait_capture(1, (provider.answers));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_239_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const controller = new AbortController();
    const { provider, worker, consentManager } = setupWorker({ approval: APPROVAL });
    const run = worker.run(requestFor({ signal: controller.signal }));
    await until(() => consentManager.listPending(workflowSessionId("run-1")).length === 1);

    controller.abort();
    await __jait_rejected(0, run);
    __jait_capture(1, (consentManager.listPending(workflowSessionId("run-1"))));
    await until(() => provider.answers.length === 1);
    __jait_capture(2, (provider.answers));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_254_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const jait = { run: vi.fn(async () => ({ text: "in-process" })) };
    const acp = { run: vi.fn(async () => ({ text: "acp" })) };
    const router = routeWorkers({ jait, acp });

    await __jait_captureResolved(0, (router.run(requestFor({ worker: { kind: "jait" } }))));
    await __jait_captureResolved(1, (router.run(requestFor())));
    __jait_capture(2, (jait.run.mock.calls));
    __jait_capture(3, (acp.run.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_265_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const router = routeWorkers({ jait: unboundSubAgentRunner });
    await __jait_rejected(0, router.run(requestFor()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_362_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const noCommands: ToolExecutorFn = async () => ({ ok: false, message: "no command gates in this plan" });
function serviceFor(
    provider: FakeAcpProvider,
    consentManager: ConsentManager,
    options: { jait?: SubAgentRunner; perProviderMaxWorkers?: number } = {},
  ) {
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const acp = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
    const workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(routeWorkers({ jait: options.jait ?? unboundSubAgentRunner, acp })),
      verifier: createWorkflowVerifier({ repositories, toolExecutor: noCommands }),
      workspaces,
      isHalted: () => false,
      perProviderMaxWorkers: options.perProviderMaxWorkers,
      listPendingApprovals: (sessionId) => consentManager.listPending(sessionId).map((request) => ({
        id: request.id,
        toolName: request.toolName,
        summary: request.summary,
        createdAt: request.createdAt,
      })),
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof planTask>[]): string {
    return new PlanService(db).create({ repoId: REPO_ID, userId: OWNER, title: "Guide plan", tasks }).id;
  }
const __jait_hook_13383 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-acp-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeFile(join(repo, "README.md"), "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_13840 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_13383();
try {
await (async()=>{

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    const provider = new FakeAcpProvider({
      approval: { tool: "Write docs/guide.md", args: { path: "docs/guide.md" } },
      onAllowed: (cwd) => writeInSync(cwd, "docs/guide.md", "guide\n"),
      reply: reportFromPrompt(["docs/guide.md"]),
    });
    const { service, workspaces } = serviceFor(provider, consentManager);
    const planId = createPlan([planTask({ id: "guide", writes: ["docs/guide.md"], worker: ACP_WORKER, maxAttempts: 1 })]);

    const run = service.createRun(OWNER, { planId, maxWorkers: 1 });
    await until(() => consentManager.listPending(workflowSessionId(run.id)).length === 1);
    // The run view shows the approval the worker waits on, in the run's worker session.
    __jait_capture(0, (service.getRun(OWNER, run.id).pendingApprovals));
    const [pending] = consentManager.listPending(workflowSessionId(run.id));
    if (!pending) throw new Error("no approval was requested");
    consentManager.approve(pending.id);
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(1, (final.status));
    __jait_capture(2, (final.tasks[0]), ({ taskId: "guide", state: "passed", worktreeRef: workspaces.taskPath(run.id, "guide") }));
    // The worker's identity is recorded on the attempt.
    __jait_capture(3, (JSON.stringify(service.getTaskAttempts(OWNER, run.id, "guide"))));
    // The agent worked in its own worktree, in supervised mode.
    __jait_capture(4, (provider.started[0]), ({ workingDirectory: workspaces.taskPath(run.id, "guide"), mode: "supervised" }));
    __jait_capture(5, (provider.answers));
    // The change is integrated on the run's branch, and the user's checkout is untouched.
    __jait_capture(6, (git(repo, "show", `${integrationBranchName(run.id)}:docs/guide.md`)));
    __jait_capture(7, (existsSync(join(repo, "docs/guide.md"))));
  
})();

} finally {
await __jait_hook_13840();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_394_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const noCommands: ToolExecutorFn = async () => ({ ok: false, message: "no command gates in this plan" });
function serviceFor(
    provider: FakeAcpProvider,
    consentManager: ConsentManager,
    options: { jait?: SubAgentRunner; perProviderMaxWorkers?: number } = {},
  ) {
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const acp = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
    const workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(routeWorkers({ jait: options.jait ?? unboundSubAgentRunner, acp })),
      verifier: createWorkflowVerifier({ repositories, toolExecutor: noCommands }),
      workspaces,
      isHalted: () => false,
      perProviderMaxWorkers: options.perProviderMaxWorkers,
      listPendingApprovals: (sessionId) => consentManager.listPending(sessionId).map((request) => ({
        id: request.id,
        toolName: request.toolName,
        summary: request.summary,
        createdAt: request.createdAt,
      })),
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof planTask>[]): string {
    return new PlanService(db).create({ repoId: REPO_ID, userId: OWNER, title: "Guide plan", tasks }).id;
  }
const __jait_hook_13383 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-acp-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeFile(join(repo, "README.md"), "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_13840 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_13383();
try {
await (async()=>{

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    const provider = new FakeAcpProvider({
      approval: { tool: "Write docs/guide.md", args: { path: "docs/guide.md" } },
      onAllowed: (cwd) => writeInSync(cwd, "docs/guide.md", "guide\n"),
      // The agent claims it changed the file, but the owner refused, so the gate must catch it.
      reply: reportFromPrompt(["docs/guide.md"]),
    });
    const { service } = serviceFor(provider, consentManager);
    const planId = createPlan([planTask({ id: "guide", writes: ["docs/guide.md"], worker: ACP_WORKER, maxAttempts: 1 })]);

    const run = service.createRun(OWNER, { planId, maxWorkers: 1 });
    await until(() => consentManager.listPending(workflowSessionId(run.id)).length === 1);
    const [pending] = consentManager.listPending(workflowSessionId(run.id));
    if (!pending) throw new Error("no approval was requested");
    consentManager.reject(pending.id);
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(0, (final.status));
    __jait_capture(1, (final.tasks[0]?.state));
    __jait_capture(2, (provider.answers));
    __jait_capture(3, (final.tasks[0]?.verification?.find((outcome) => outcome.gateId === "output")?.passed));
  
})();

} finally {
await __jait_hook_13840();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_acp_worker_test_ts_419_3": {


const OWNER = "owner-1";
const REPO_ID = "repo-1";
const CONFIG = { host: "127.0.0.1", port: 8000 };
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
const ACP_WORKER: TaskWorker = { kind: "acp", providerId: "claude-code" };
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function writeInSync(root: string, relative: string, content: string): void {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}
interface FakeOptions {
  modes?: Array<"full-access" | "supervised">;
  /** "hang" never finishes the turn; "fail" throws out of it. */
  behavior?: "finish" | "hang" | "fail";
  /** Asks for one tool approval before the turn can finish. */
  approval?: { tool: string; args: unknown };
  /** Runs once the agent may act: when no approval was asked, or when the owner allowed it. */
  onAllowed?: (workingDirectory: string) => void;
  /** The agent's final answer, built from the prompt it was sent. */
  reply?: (prompt: string) => string;
}
class FakeAcpProvider implements CliProviderAdapter {
  readonly id = "claude-code";
  readonly info: CliProviderAdapter["info"];
  readonly emitter = new EventEmitter();
  readonly started: StartSessionOptions[] = [];
  readonly stopped: string[] = [];
  readonly answers: Array<{ requestId: string; approved: boolean }> = [];
  private resolveApproval: ((approved: boolean) => void) | undefined;

  constructor(private readonly options: FakeOptions = {}) {
    this.info = {
      id: "claude-code",
      name: "Claude Code",
      description: "",
      available: true,
      modes: options.modes ?? ["full-access", "supervised"],
      auth: { login: false, logout: false, deviceCode: false },
    };
  }

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    this.started.push(options);
    return { id: `sess-${this.started.length}`, providerId: this.id, threadId: options.threadId, status: "running" };
  }

  async sendTurn(sessionId: string, message: string): Promise<void> {
    if (this.options.behavior === "hang") await new Promise<void>(() => {});
    if (this.options.behavior === "fail") throw new Error("transport closed");
    const workingDirectory = this.started[this.started.length - 1]?.workingDirectory ?? "";
    if (this.options.approval) {
      const approval = this.options.approval;
      const approved = await new Promise<boolean>((resolve) => {
        this.resolveApproval = resolve;
        this.emitter.emit("event", {
          type: "tool.approval-required",
          sessionId,
          tool: approval.tool,
          args: approval.args,
          requestId: "req-1",
        } satisfies ProviderEvent);
      });
      if (approved) this.options.onAllowed?.(workingDirectory);
    } else {
      this.options.onAllowed?.(workingDirectory);
    }
    const reply = this.options.reply?.(message) ?? '{"status":"completed"}';
    this.emitter.emit("event", { type: "token", sessionId, content: reply } satisfies ProviderEvent);
  }

  async respondToApproval(_sessionId: string, requestId: string, approved: boolean): Promise<void> {
    this.answers.push({ requestId, approved });
    this.resolveApproval?.(approved);
  }

  async interruptTurn(): Promise<void> {}

  async stopSession(sessionId: string): Promise<void> {
    this.stopped.push(sessionId);
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }
}
function requestFor(overrides: Partial<SubAgentRunRequest> = {}): SubAgentRunRequest {
  return {
    userId: OWNER,
    runId: "run-1",
    taskId: "guide",
    attemptId: "attempt-1",
    prompt: "Write the guide.",
    claims: { reads: [], writes: ["docs/guide.md"] },
    worker: ACP_WORKER,
    workspace: { path: "/worktrees/run-1/guide", mode: "write" },
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function setupWorker(options: FakeOptions = {}) {
  const provider = new FakeAcpProvider(options);
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
  const worker = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
  return { provider, consentManager, worker };
}
const APPROVAL = { tool: "Edit file", args: { path: "docs/guide.md" } };
function reportJson(taskId: string, attemptId: string, changedFiles: string[]): string {
  return JSON.stringify({ taskId, attemptId, status: "completed", summary: `${taskId} done`, changedFiles, artifacts: [], followUps: [] });
}
function reportFromPrompt(changedFiles: string[]): (prompt: string) => string {
  return (prompt) => reportJson(
    /"taskId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    /"attemptId":"([^"]+)"/.exec(prompt)?.[1] ?? "",
    changedFiles,
  );
}
function planTask(input: { id: string; writes: string[]; worker?: TaskWorker; maxAttempts?: number }) {
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: [] as string[],
    resources: { writes: input.writes },
    ...(input.worker ? { worker: input.worker } : {}),
    verification: [{ id: "output", label: `${input.writes[0]} exists`, check: { kind: "artifact" as const, path: input.writes[0] ?? "" } }],
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const noCommands: ToolExecutorFn = async () => ({ ok: false, message: "no command gates in this plan" });
function serviceFor(
    provider: FakeAcpProvider,
    consentManager: ConsentManager,
    options: { jait?: SubAgentRunner; perProviderMaxWorkers?: number } = {},
  ) {
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const acp = createAcpWorkflowWorker({ config: CONFIG, providerRegistry, consentManager });
    const workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(routeWorkers({ jait: options.jait ?? unboundSubAgentRunner, acp })),
      verifier: createWorkflowVerifier({ repositories, toolExecutor: noCommands }),
      workspaces,
      isHalted: () => false,
      perProviderMaxWorkers: options.perProviderMaxWorkers,
      listPendingApprovals: (sessionId) => consentManager.listPending(sessionId).map((request) => ({
        id: request.id,
        toolName: request.toolName,
        summary: request.summary,
        createdAt: request.createdAt,
      })),
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof planTask>[]): string {
    return new PlanService(db).create({ repoId: REPO_ID, userId: OWNER, title: "Guide plan", tasks }).id;
  }
const __jait_hook_13383 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-acp-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeFile(join(repo, "README.md"), "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_13840 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_13383();
try {
await (async()=>{

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    const provider = new FakeAcpProvider({
      approval: { tool: "Write docs/b.md", args: { path: "docs/b.md" } },
      onAllowed: (cwd) => writeInSync(cwd, "docs/b.md", "b\n"),
      reply: reportFromPrompt(["docs/b.md"]),
    });
    const jait: SubAgentRunner = {
      async run(request) {
        if (!request.workspace) throw new Error("the in-process test worker needs a worktree");
        writeInSync(request.workspace.path, "docs/a.md", "a\n");
        return { text: reportJson(request.taskId, request.attemptId, ["docs/a.md"]) };
      },
    };
    // One slot per provider: in-process and ACP each get their own, so both can run at once.
    const { service } = serviceFor(provider, consentManager, { jait, perProviderMaxWorkers: 1 });
    const planId = createPlan([
      planTask({ id: "A", writes: ["docs/a.md"], maxAttempts: 1 }),
      planTask({ id: "B", writes: ["docs/b.md"], worker: ACP_WORKER, maxAttempts: 1 }),
    ]);

    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    // A finishes while B still waits for its approval, so the coding agent did not hold A's slot.
    await until(() => service.getRun(OWNER, run.id).tasks.find((task) => task.taskId === "A")?.state === "passed");
    __jait_capture(0, (service.getRun(OWNER, run.id).tasks.find((task) => task.taskId === "B")?.state));
    const [pending] = consentManager.listPending(workflowSessionId(run.id));
    if (!pending) throw new Error("no approval was requested");
    consentManager.approve(pending.id);
    await service.settle();

    __jait_capture(1, (service.getRun(OWNER, run.id).status));
  
})();

} finally {
await __jait_hook_13840();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
