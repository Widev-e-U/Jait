// Translated fixture from packages/gateway/src/services/orchestration/orchestrator-workspace.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { VerificationGate } from "@jait/shared/types";
import { type JaitDB, migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { PlanService } from "../../../../packages/gateway/src/services/plans.js";
import type { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { createWorkflowVerifier, type ToolExecutorFn } from "../../../../packages/gateway/src/services/orchestration/command-verifier.js";
import { inertWorkspaces } from "../../../../packages/gateway/src/services/orchestration/inert-workspaces.js";
import {
  OrchestrationNotFoundError,
  OrchestrationService,
  OrchestrationValidationError,
  type TaskExecutionInput,
  type TaskExecutor,
} from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import { integrationBranchName, WorkflowWorkspaces } from "../../../../packages/gateway/src/services/orchestration/workspace.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/orchestrator-workspace.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_178_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({
        id: "B",
        dependsOn: ["A"],
        writes: ["docs/guide.md"],
        verification: [artifactGate("guide", "docs/guide.md"), commandGate("guide-check", "test -s docs/guide.md")],
      }),
      approvedTask({ id: "C", dependsOn: ["A"], writes: ["docs/notes.md"], verification: [artifactGate("notes", "docs/notes.md")] }),
      approvedTask({
        id: "D",
        dependsOn: ["B", "C"],
        writes: ["docs/summary.md"],
        verification: [artifactGate("summary", "docs/summary.md"), artifactGate("joined", "docs/notes.md")],
      }),
    ]);

    let running = 0;
    let maxRunning = 0;
    const events: string[] = [];
    const executor: TaskExecutor = {
      async execute(input) {
        events.push(`start:${input.taskId}`);
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        try {
          if (input.taskId === "B" || input.taskId === "C") {
            // Both writers must be active at once, or the test fails: parallel start is what is being verified.
            await until(() => maxRunning >= 2);
            const file = input.taskId === "B" ? "docs/guide.md" : "docs/notes.md";
            await writeIn(input.workspace!.path, file, `${input.taskId}\n`);
            return reportFor(input, [file]);
          }
          if (input.taskId === "D") {
            // The join sees both predecessors' files because its workspace starts from the integrated head.
            __jait_capture(0, (existsSync(join(input.workspace!.path, "docs/guide.md"))));
            __jait_capture(1, (existsSync(join(input.workspace!.path, "docs/notes.md"))));
            await writeIn(input.workspace!.path, "docs/summary.md", "summary\n");
            return reportFor(input, ["docs/summary.md"]);
          }
          return reportFor(input);
        } finally {
          running -= 1;
          events.push(`end:${input.taskId}`);
        }
      },
    };

    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(2, (final.status));
    __jait_capture(3, (final.tasks.map((task) => [task.taskId, task.state])));
    // Dependency edges are part of the run view that owners inspect.
    __jait_capture(4, (final.tasks.map((task) => [task.taskId, task.dependsOn])));
    // So are the resources each task owns, which is what lets B and C run side by side.
    __jait_capture(5, (final.tasks.map((task) => [task.taskId, task.resources])));
    __jait_capture(6, (maxRunning));
    // Dependencies gate starts: A ends before B and C start, and D starts only after B and C end.
    __jait_capture(7, (events.indexOf("end:A")), (events.indexOf("start:B")));
    __jait_capture(8, (events.indexOf("end:A")), (events.indexOf("start:C")));
    __jait_capture(9, (events.indexOf("end:B")), (events.indexOf("start:D")));
    __jait_capture(10, (events.indexOf("end:C")), (events.indexOf("start:D")));

    // Verification evidence: scope, plan gates and integration are all recorded and passed.
    const guide = final.tasks.find((task) => task.taskId === "B");
    __jait_capture(11, (guide?.verification?.map((outcome) => outcome.gateId)));
    __jait_capture(12, (guide?.verification?.every((outcome) => outcome.passed)));
    __jait_capture(13, (guide?.worktreeRef), (workspaces.taskPath(run.id, "B")));

    // The command gate ran in B's worktree, for the workflow, with the plan's command.
    __jait_capture(14, (commands), ({
      command: "test -s docs/guide.md",
      projectRoot: workspaces.taskPath(run.id, "B"),
      requestedBy: "workflow",
    }));

    // Everything is integrated on the integration branch. The user's branch is untouched.
    const integration = workspaces.integrationPath(run.id);
    __jait_capture(15, (git(integration, "rev-parse", "--abbrev-ref", "HEAD")), (integrationBranchName(run.id)));
    for (const file of ["README.md", "docs/guide.md", "docs/notes.md", "docs/summary.md"]) {
      __jait_capture(16, (existsSync(join(integration, file))));
    }
    __jait_capture(17, (git(repo, "branch", "--show-current")));
    __jait_capture(18, (git(repo, "rev-list", "--count", "main")));
    __jait_capture(19, (existsSync(join(repo, "docs"))));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_289_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({
        id: "W",
        dependsOn: ["A"],
        writes: ["docs/w.md"],
        maxAttempts: 1,
        verification: [artifactGate("w", "docs/w.md")],
      }),
      approvedTask({ id: "J", dependsOn: ["W"], writes: ["docs/j.md"], verification: [artifactGate("j", "docs/j.md")] }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        if (input.taskId === "W") {
          await writeIn(input.workspace!.path, "docs/w.md", "ok\n");
          await writeIn(input.workspace!.path, "src/rogue.ts", "export {};\n");
          return reportFor(input, ["docs/w.md", "src/rogue.ts"]);
        }
        return reportFor(input);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(0, (final.status));
    const writer = final.tasks.find((task) => task.taskId === "W");
    __jait_capture(1, (writer?.state));
    __jait_capture(2, (writer?.verification?.[0]));
    __jait_capture(3, (writer?.verification?.[0]?.detail));
    __jait_capture(4, (final.tasks.find((task) => task.taskId === "J")?.state));

    const integration = workspaces.integrationPath(run.id);
    __jait_capture(5, (existsSync(join(integration, "docs/w.md"))));
    __jait_capture(6, (existsSync(join(integration, "src/rogue.ts"))));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_335_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    await seedProject({ "tests/keep.test.ts": "it('works', () => {});\n", "src/lib.ts": "export {};\n" });
    const planId = createPlan([
      approvedTask({
        id: "W",
        writes: ["."],
        protects: ["tests"],
        maxAttempts: 1,
        verification: [artifactGate("impl", "src/impl.ts")],
      }),
      approvedTask({ id: "J", dependsOn: ["W"], writes: ["docs/j.md"], verification: [artifactGate("j", "docs/j.md")] }),
    ]);
    const seen: Array<string[] | undefined> = [];
    const executor: TaskExecutor = {
      async execute(input) {
        seen.push(input.claims.protects);
        if (input.taskId === "W") {
          await writeIn(input.workspace!.path, "src/impl.ts", "export const impl = 1;\n");
          // The agent makes the failing check pass by skipping the test.
          await writeIn(input.workspace!.path, "tests/keep.test.ts", "it.skip('works', () => {});\n");
          return reportFor(input, ["src/impl.ts", "tests/keep.test.ts"]);
        }
        return reportFor(input);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(0, (final.status));
    const writer = final.tasks.find((task) => task.taskId === "W");
    __jait_capture(1, (writer?.state));
    __jait_capture(2, (writer?.resources));
    __jait_capture(3, (writer?.verification?.[0]));
    __jait_capture(4, (writer?.verification?.[0]?.label));
    __jait_capture(5, (writer?.verification?.[0]?.detail));
    __jait_capture(6, (writer?.lastError));
    // The plan's own gates never ran, so the weakened test cannot make the task look successful.
    __jait_capture(7, (writer?.verification?.map((outcome) => outcome.gateId)));
    __jait_capture(8, (final.tasks.find((task) => task.taskId === "J")?.state));
    __jait_capture(9, (seen[0]));

    const integration = workspaces.integrationPath(run.id);
    __jait_capture(10, (existsSync(join(integration, "src/impl.ts"))));
    __jait_capture(11, (await readFile(join(integration, "tests/keep.test.ts"), "utf8")));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_383_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    await seedProject({
      "tests/keep.test.ts": "it('works', () => {});\n",
      "src/old.ts": "export const old = 1;\n",
    });
    const planId = createPlan([
      approvedTask({
        id: "W",
        writes: ["src", "tests"],
        protects: ["tests/keep.test.ts"],
        verification: [artifactGate("impl", "src/impl.ts"), commandGate("new-test", "test -s tests/new.test.ts")],
      }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        await writeIn(input.workspace!.path, "src/impl.ts", "export const impl = 1;\n");
        await writeIn(input.workspace!.path, "tests/new.test.ts", "it('new', () => {});\n");
        await rm(join(input.workspace!.path, "src/old.ts"));
        return reportFor(input, ["src/impl.ts", "tests/new.test.ts", "src/old.ts"]);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(0, (final.status));
    const scope = final.tasks[0]?.verification?.find((outcome) => outcome.gateId === "system:scope");
    __jait_capture(1, (scope));
    __jait_capture(2, (scope?.detail));

    const integration = workspaces.integrationPath(run.id);
    __jait_capture(3, (existsSync(join(integration, "tests/new.test.ts"))));
    __jait_capture(4, (existsSync(join(integration, "src/old.ts"))));
    __jait_capture(5, (await readFile(join(integration, "tests/keep.test.ts"), "utf8")));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_420_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({
        id: "W",
        writes: ["docs/w.md"],
        maxAttempts: 1,
        verification: [artifactGate("w", "docs/w.md"), commandGate("never", "exit 3")],
      }),
    ]);
    const executor: TaskExecutor = {
      async execute(input) {
        await writeIn(input.workspace!.path, "docs/w.md", "ok\n");
        return reportFor(input, ["docs/w.md"]);
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    const final = service.getRun(OWNER, run.id);
    __jait_capture(0, (final.status));
    const outcomes = final.tasks[0]?.verification ?? [];
    __jait_capture(1, (outcomes.find((outcome) => outcome.gateId === "never")));
    __jait_captureType(2, (outcomes.find((outcome) => outcome.gateId === "system:integration")));
    __jait_capture(3, (existsSync(join(workspaces.integrationPath(run.id), "docs/w.md"))));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_447_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W", dependsOn: ["A"], writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] }),
    ]);
    const halted = new Set<string>();
    let release!: (value: unknown) => void;
    let writerStarted = false;
    const executor: TaskExecutor = {
      execute(input) {
        if (input.taskId !== "W") return Promise.resolve(reportFor(input));
        writerStarted = true;
        return new Promise((resolve, reject) => {
          release = () => {
            void writeIn(input.workspace!.path, "docs/w.md", "late\n").then(() => resolve(reportFor(input, ["docs/w.md"])));
          };
          input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    const { service, workspaces } = makeService(executor, { halted });
    const run = service.createRun(OWNER, { planId });
    await until(() => writerStarted);
    const headBefore = git(workspaces.integrationPath(run.id), "rev-parse", "HEAD");

    halted.add(OWNER);
    __jait_capture(0, (service.stopForUser(OWNER).stopped));
    release(undefined);
    await service.settle();

    const stopped = service.getRun(OWNER, run.id);
    __jait_capture(1, (stopped.tasks.find((task) => task.taskId === "W")?.state));
    __jait_capture(2, (stopped.paused));
    __jait_capture(3, (git(workspaces.integrationPath(run.id), "rev-parse", "HEAD")), (headBefore));
    __jait_thrown(4, () => service.createRun(OWNER, { planId }));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_484_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W", dependsOn: ["A"], writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] }),
    ]);
    let writerStarted = false;
    const executor: TaskExecutor = {
      execute(input) {
        if (input.taskId !== "W") return Promise.resolve(reportFor(input));
        writerStarted = true;
        return new Promise((_, reject) => {
          input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId });
    await until(() => writerStarted);
    const headBefore = git(workspaces.integrationPath(run.id), "rev-parse", "HEAD");

    const cancelled = service.cancelRun(OWNER, run.id, "operator stop");
    await service.settle();
    __jait_capture(0, (cancelled.status));
    __jait_capture(1, (service.getRun(OWNER, run.id).tasks.find((task) => task.taskId === "W")?.state));
    __jait_capture(2, (git(workspaces.integrationPath(run.id), "rev-parse", "HEAD")), (headBefore));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_511_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W", dependsOn: ["A"], writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] }),
    ]);
    let writerStarted = false;
    const crashed: TaskExecutor = {
      execute(input) {
        if (input.taskId !== "W") return Promise.resolve(reportFor(input));
        writerStarted = true;
        return new Promise(() => undefined);
      },
    };
    const first = makeService(crashed);
    const run = first.service.createRun(OWNER, { planId });
    await until(() => writerStarted);

    const restarted = makeService({ execute: async (input) => reportFor(input) });
    __jait_capture(0, (restarted.service.recoverAfterRestart()));
    const recovered = restarted.service.getRun(OWNER, run.id);
    __jait_capture(1, (recovered.status));
    __jait_capture(2, (recovered.paused));
    __jait_capture(3, (recovered.tasks.find((task) => task.taskId === "W")?.state));
    await flush();
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_537_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] })]);
    const { service } = makeService({ execute: async (input) => reportFor(input) });
    const run = service.createRun(OWNER, { planId });
    await service.settle();

    __jait_thrown(0, () => service.getRun(OTHER, run.id), (OrchestrationNotFoundError));
    __jait_thrown(1, () => service.createRun(OTHER, { planId }), (OrchestrationNotFoundError));

    const unowned = createPlan(
      [approvedTask({ id: "W", writes: ["docs/w.md"], verification: [artifactGate("w", "docs/w.md")] })],
      "repo-missing",
    );
    __jait_thrown(2, () => service.createRun(OWNER, { planId: unowned }), (OrchestrationValidationError));
    try {
      service.createRun(OWNER, { planId: unowned });
    } catch (error) {
      __jait_capture(3, ((error as OrchestrationValidationError).issues[0]?.code));
    }
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_558_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      approvedTask({ id: "A", reads: ["."], verification: [artifactGate("readme", "README.md")] }),
      approvedTask({ id: "W1", dependsOn: ["A"], writes: ["docs"], verification: [artifactGate("one", "docs/one.md")] }),
      approvedTask({
        id: "W2",
        dependsOn: ["A"],
        writes: ["docs/two.md"],
        verification: [artifactGate("two", "docs/two.md"), artifactGate("sees-one", "docs/one.md")],
      }),
    ]);
    let running = 0;
    let maxWriters = 0;
    const executor: TaskExecutor = {
      async execute(input) {
        if (input.taskId === "A") return reportFor(input);
        running += 1;
        maxWriters = Math.max(maxWriters, running);
        try {
          await flush();
          await writeIn(input.workspace!.path, input.taskId === "W1" ? "docs/one.md" : "docs/two.md", `${input.taskId}\n`);
          return reportFor(input);
        } finally {
          running -= 1;
        }
      },
    };
    const { service, workspaces } = makeService(executor);
    const run = service.createRun(OWNER, { planId, maxWorkers: 2 });
    await service.settle();

    // "docs" and "docs/two.md" overlap, so the scheduler must not run both at once.
    __jait_capture(0, (maxWriters));
    const final = service.getRun(OWNER, run.id);
    __jait_capture(1, (final.status));
    __jait_capture(2, (final.tasks.map((task) => task.state)));
    __jait_capture(3, (existsSync(join(workspaces.integrationPath(run.id), "docs/one.md"))));
    __jait_capture(4, (existsSync(join(workspaces.integrationPath(run.id), "docs/two.md"))));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_workspace_test_ts_598_3": {


const OWNER = "owner-1";
const OTHER = "owner-2";
const REPO_ID = "repo-1";
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Workflow Test",
  GIT_AUTHOR_EMAIL: "workflow-test@example.invalid",
  GIT_COMMITTER_NAME: "Workflow Test",
  GIT_COMMITTER_EMAIL: "workflow-test@example.invalid",
};
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV }).trim();
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
async function until(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not reached in time");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function artifactGate(id: string, path: string): VerificationGate {
  return { id, label: `${path} exists`, check: { kind: "artifact", path } };
}
function commandGate(id: string, command: string): VerificationGate {
  return { id, label: command, check: { kind: "command", command } };
}
interface PlanTaskInput {
  id: string;
  dependsOn?: string[];
  reads?: string[];
  writes?: string[];
  protects?: string[];
  verification: VerificationGate[];
  maxAttempts?: number;
}
function approvedTask(input: PlanTaskInput) {
  const resources: { reads?: string[]; writes?: string[]; protects?: string[] } = {};
  if (input.reads) resources.reads = input.reads;
  if (input.writes) resources.writes = input.writes;
  if (input.protects) resources.protects = input.protects;
  return {
    id: input.id,
    title: `Task ${input.id}`,
    description: `${input.id} work`,
    status: "approved" as const,
    dependsOn: input.dependsOn ?? [],
    resources,
    verification: input.verification,
    ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
  };
}
function reportFor(input: TaskExecutionInput, changedFiles: string[] = []) {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles,
    artifacts: [],
    followUps: [],
  };
}
interface Recorded {
  command: string;
  projectRoot: string;
  requestedBy: string;
}
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let sqlite: SqliteDatabase;
let db: JaitDB;
let commands: Recorded[];
const repositories = {
    getById: (id: string) => (id === REPO_ID ? { id, userId: OWNER, localPath: repo, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
const shellExecutor: ToolExecutorFn = async (_name, toolInput, context: ToolContext) => {
    const { command } = toolInput as { command: string };
    commands.push({ command, projectRoot: context.projectRoot, requestedBy: context.requestedBy });
    try {
      execFileSync("sh", ["-c", command], { cwd: context.projectRoot, stdio: "pipe" });
      return { ok: true, message: "exit 0" };
    } catch (error) {
      return { ok: false, message: `exit ${(error as { status?: number }).status ?? "error"}` };
    }
  };
function makeService(
    executor: TaskExecutor,
    options: { halted?: Set<string>; workspaces?: WorkflowWorkspaces } = {},
  ): { service: OrchestrationService; workspaces: WorkflowWorkspaces } {
    const workspaces = options.workspaces ?? new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
    const service = new OrchestrationService({
      db,
      executor,
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces,
      isHalted: (userId) => options.halted?.has(userId) ?? false,
    });
    return { service, workspaces };
  }
function createPlan(tasks: ReturnType<typeof approvedTask>[], repoId = REPO_ID): string {
    const plans = new PlanService(db);
    const plan = plans.create({ repoId, userId: OWNER, title: "Feature plan", tasks });
    return plan.id;
  }
async function seedProject(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_4055 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-run-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "project\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
    commands = [];
  };
const __jait_hook_4519 = async () => {
    sqlite.close();
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_4055();
try {
await (async()=>{

    const planId = createPlan([
      { ...approvedTask({ id: "A", verification: [commandGate("ok", "true")] }), resources: {} },
    ]);
    const service = new OrchestrationService({
      db,
      executor: { execute: async (input) => reportFor(input) },
      verifier: createWorkflowVerifier({ repositories, toolExecutor: shellExecutor }),
      workspaces: inertWorkspaces,
    });
    const run = service.createRun(OWNER, { planId });
    await service.settle();
    __jait_capture(0, (service.getRun(OWNER, run.id).status));
    __jait_capture(1, (commands.at(-1)?.projectRoot), (repo));
    __jait_capture(2, (await readFile(join(repo, "README.md"), "utf8")));
  
})();

} finally {
await __jait_hook_4519();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
