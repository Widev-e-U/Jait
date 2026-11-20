// Translated fixture from packages/gateway/src/services/orchestration/command-verifier.test.ts; expected literals are in tail_static.rs.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import type { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { createCommandVerifier, createWorkflowVerifier, type ToolExecutorFn } from "../../../../packages/gateway/src/services/orchestration/command-verifier.js";
import type { VerificationRunInput } from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import type { ToolDefinition } from "../../../../packages/gateway/src/tools/contracts.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { ConsentAwareExecutor } from "../../../../packages/gateway/src/security/consent-executor.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import type { ToolPermission } from "../../../../packages/gateway/src/security/tool-permissions.js";
import { TrustEngine } from "../../../../packages/gateway/src/security/trust-engine.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/command-verifier.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_51_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { executor, calls } = recordingExecutor({ ok: true, message: "exit 0" });
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor }).run(input());

    __jait_capture(0, (verdict));
    __jait_capture(1, (calls));
    __jait_capture(2, (calls[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_70_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { executor } = recordingExecutor({ ok: false, message: "User rejected terminal.run: no" });
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor }).run(input());
    __jait_capture(0, (verdict.passed));
    __jait_capture(1, (verdict.detail));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_77_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const executor: ToolExecutorFn = async () => ({
      ok: true,
      message: "Command is still running after the 10000ms initial wait.",
      data: { yielded: true, isBackground: true, executionId: "exec-1" },
    });
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor }).run(input());
    __jait_capture(0, (verdict.passed));
    __jait_capture(1, (verdict.detail));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_88_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const controller = new AbortController();
    const executor: ToolExecutorFn = async () => {
      controller.abort();
      return { ok: true, message: "exit 0" };
    };
    const verdict = await createCommandVerifier({ repositories, toolExecutor: executor })
      .run(input({ signal: controller.signal }));
    __jait_capture(0, (verdict.passed));
    __jait_capture(1, (verdict.detail));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_100_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const verdict = await createCommandVerifier({ repositories }).run(input());
    __jait_capture(0, (verdict.passed));
    __jait_capture(1, (verdict.detail));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_106_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { executor, calls } = recordingExecutor({ ok: true, message: "exit 0" });
    const verifier = createCommandVerifier({ repositories, toolExecutor: executor });

    await verifier.run(input({ workspacePath: null }));
    __jait_capture(0, (calls[0]?.context.projectRoot));

    const foreign = await verifier.run(input({ workspacePath: null, repoId: "someone-elses" }));
    __jait_capture(1, (foreign.passed));
    __jait_capture(2, (calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_118_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const controller = new AbortController();
    controller.abort(new Error("halted"));
    const { executor, calls } = recordingExecutor({ ok: true, message: "exit 0" });
    await __jait_rejected(0, createCommandVerifier({ repositories, toolExecutor: executor }).run(input({ signal: controller.signal })));
    __jait_capture(1, (calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_135_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{
let dir: string | undefined;
const __jait_hook_5549 = async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  };

try {
await (async()=>{

    dir = await mkdtemp(join(__jait_fixture_dir, "jait-verify-"));
    await mkdir(join(dir, "docs"));
    await writeFile(join(dir, "docs", "a.md"), "a\n");
    const verifier = createWorkflowVerifier({ repositories: { getById: () => ({ ...OWNED_REPO, localPath: dir! }) } as unknown as Pick<RepositoryService, "getById">, toolExecutor: undefined });

    __jait_capture(0, (await verifier.run(input({ check: { kind: "artifact", path: "docs/a.md" }, workspacePath: dir }))));
    __jait_capture(1, (await verifier.run(input({ check: { kind: "artifact", path: "docs/missing.md" }, workspacePath: dir }))));
    __jait_capture(2, (await verifier.run(input({ check: { kind: "command", command: "true" } }))));
  
})();

} finally {
await __jait_hook_5549();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_188_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{
async function until(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("condition not reached in time");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
function setup() {
    const ran: Array<{ command: string; cwd: string }> = [];
    const registry = new ToolRegistry();
    registry.register({
      name: "terminal.run",
      description: "Run a command in the terminal",
      parameters: {
        type: "object",
        properties: { command: { type: "string" }, timeout: { type: "number" } },
        required: ["command"],
      },
      execute: async (toolInput: { command: string }, context: { projectRoot: string }) => {
        ran.push({ command: toolInput.command, cwd: context.projectRoot });
        return { ok: true, message: "exit 0" };
      },
    } as unknown as ToolDefinition);
    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    // The consent level that applies to terminal commands: every run asks the owner.
    const permissions = new Map<string, ToolPermission>([
      ["terminal.run", { consentLevel: "always", risk: "high", description: "Run a terminal command", knownTool: true, source: "profile" } as unknown as ToolPermission],
    ]);
    const executor = new ConsentAwareExecutor({
      toolRegistry: registry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions,
      sessionApprovals: new Set<string>(),
    });
    const toolExecutor: ToolExecutorFn = (name, toolInput, context, options) => executor.execute(name, toolInput, context, options);
    return { ran, consentManager, toolExecutor };
  }

try {
await (async()=>{

    const { ran, consentManager, toolExecutor } = setup();
    const verifier = createCommandVerifier({ repositories, toolExecutor });
    const verdict = verifier.run(input({ workspacePath: "/workspaces/A" }));

    await until(() => consentManager.listPending("workflow:run-1").length === 1);
    __jait_capture(0, (ran));
    const [request] = consentManager.listPending("workflow:run-1");
    __jait_capture(1, (request?.toolName));
    __jait_capture(2, (consentManager.approve(request!.id, "click")));

    await __jait_captureResolved(3, (verdict));
    __jait_capture(4, (ran));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_command_verifier_test_ts_203_3": {


const OWNED_REPO = { id: "repo-1", userId: "owner", localPath: "/repos/app", deviceId: null };
const repositories = {
  getById: (id: string) => (id === OWNED_REPO.id ? OWNED_REPO : undefined),
} as unknown as Pick<RepositoryService, "getById">;
function input(overrides: Partial<VerificationRunInput> = {}): VerificationRunInput {
  return {
    userId: "owner",
    repoId: "repo-1",
    check: { kind: "command", command: "npm test", timeoutSeconds: 120 },
    runId: "run-1",
    taskId: "A",
    attemptId: "attempt-1",
    workspacePath: "/workspaces/A",
    signal: new AbortController().signal,
    ...overrides,
  };
}
interface Recorded {
  name: string;
  input: unknown;
  context: ToolContext;
}
function recordingExecutor(result: { ok: boolean; message: string }): { executor: ToolExecutorFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const executor: ToolExecutorFn = async (name, toolInput, context) => {
    calls.push({ name, input: toolInput, context });
    return { ok: result.ok, message: result.message };
  };
  return { executor, calls };
}
/*__jait_scope_open__*/{
async function until(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("condition not reached in time");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
function setup() {
    const ran: Array<{ command: string; cwd: string }> = [];
    const registry = new ToolRegistry();
    registry.register({
      name: "terminal.run",
      description: "Run a command in the terminal",
      parameters: {
        type: "object",
        properties: { command: { type: "string" }, timeout: { type: "number" } },
        required: ["command"],
      },
      execute: async (toolInput: { command: string }, context: { projectRoot: string }) => {
        ran.push({ command: toolInput.command, cwd: context.projectRoot });
        return { ok: true, message: "exit 0" };
      },
    } as unknown as ToolDefinition);
    const consentManager = new ConsentManager({ defaultTimeoutMs: 5_000 });
    // The consent level that applies to terminal commands: every run asks the owner.
    const permissions = new Map<string, ToolPermission>([
      ["terminal.run", { consentLevel: "always", risk: "high", description: "Run a terminal command", knownTool: true, source: "profile" } as unknown as ToolPermission],
    ]);
    const executor = new ConsentAwareExecutor({
      toolRegistry: registry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions,
      sessionApprovals: new Set<string>(),
    });
    const toolExecutor: ToolExecutorFn = (name, toolInput, context, options) => executor.execute(name, toolInput, context, options);
    return { ran, consentManager, toolExecutor };
  }

try {
await (async()=>{

    const { ran, consentManager, toolExecutor } = setup();
    const verifier = createCommandVerifier({ repositories, toolExecutor });
    const verdict = verifier.run(input());

    await until(() => consentManager.listPending("workflow:run-1").length === 1);
    const [request] = consentManager.listPending("workflow:run-1");
    __jait_capture(0, (consentManager.reject(request!.id, "click", "not now")));

    const outcome = await verdict;
    __jait_capture(1, (outcome.passed));
    __jait_capture(2, (outcome.detail));
    __jait_capture(3, (ran));
  
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
