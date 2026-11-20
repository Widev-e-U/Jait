// Translated fixture from packages/gateway/src/services/orchestration/workspace.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { pathCoveredByWrites, taskBranchName, WorkflowWorkspaces, WorkspaceConflictError, WorkspaceError, integrationBranchName } from "../../../../packages/gateway/src/services/orchestration/workspace.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/workspace.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_71_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const headBefore = git(repo, "rev-parse", "HEAD");
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);

    __jait_capture(0, (git(location.path, "rev-parse", "--abbrev-ref", "HEAD")), (taskBranchName(RUN, "A")));
    __jait_capture(1, (git(repo, "rev-parse", "HEAD")), (headBefore));
    __jait_capture(2, (git(repo, "branch", "--show-current")));
    __jait_capture(3, (git(repo, "status", "--porcelain")));
    __jait_capture(4, (existsSync(join(location.path, "README.md"))));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_82_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "docs/guide/intro.md", "hello\n");
    await writeIn(location.path, "src/hack.ts", "export {};\n");

    const scope = await workspaces.checkScope(location.path, ["docs"]);
    __jait_capture(0, (scope.ok));
    __jait_capture(1, (scope.outside));
    __jait_capture(2, (scope.changed));

    const whole = await workspaces.checkScope(location.path, ["."]);
    __jait_capture(3, (whole.ok));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_103_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    await seed({ "tests/keep.test.ts": "it('works', () => {});\n", "tests/gone.test.ts": "it('gone', () => {});\n", "src/lib.ts": "export {};\n" });
    const location = await workspaces.prepareWrite(ref("A"), ["."], ["tests"]);

    // Allowed: ordinary code changes.
    await writeIn(location.path, "src/lib.ts", "export const lib = 1;\n");
    __jait_capture(0, (await workspaces.checkScope(location.path, ["."], ["tests"])));

    // Weakening an existing test, deleting one and adding a file under a protected path all count.
    await writeIn(location.path, "tests/keep.test.ts", "it.skip('works', () => {});\n");
    await rm(join(location.path, "tests/gone.test.ts"));
    await writeIn(location.path, "tests/extra.test.ts", "it('extra', () => {});\n");
    const scope = await workspaces.checkScope(location.path, ["."], ["tests"]);
    __jait_capture(1, (scope.ok));
    __jait_capture(2, (scope.outside));
    __jait_capture(3, (scope.protectedPaths));
    __jait_capture(4, (scope.deleted));

    // Without the protection the same changes are in scope.
    __jait_capture(5, ((await workspaces.checkScope(location.path, ["."])).ok));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_125_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    await seed({ "src/a.test.ts": "a\n", "src/a.ts": "a\n" });
    const location = await workspaces.prepareWrite(ref("A"), ["src"], ["**/*.test.ts"]);
    await writeIn(location.path, "src/a.test.ts", "weakened\n");
    await writeIn(location.path, "src/a.ts", "changed\n");
    await writeIn(location.path, "docs/stray.md", "outside\n");

    const scope = await workspaces.checkScope(location.path, ["src"], ["**/*.test.ts"]);
    __jait_capture(0, (scope.ok));
    __jait_capture(1, (scope.outside));
    __jait_capture(2, (scope.protectedPaths));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_138_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    await seed({ "docs/old.md": "old\n", "docs/keep.md": "keep\n" });
    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await rm(join(location.path, "docs/old.md"));
    await writeIn(location.path, "docs/new.md", "new\n");

    const scope = await workspaces.checkScope(location.path, ["docs"]);
    __jait_capture(0, (scope.ok));
    __jait_capture(1, (scope.deleted));
    __jait_capture(2, (scope.changed));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_150_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    await seed({ "tests/keep.test.ts": "it('works', () => {});\n" });
    const location = await workspaces.prepareWrite(ref("A"), ["."], ["tests"]);
    await writeIn(location.path, "src/impl.ts", "export {};\n");
    await writeIn(location.path, "tests/keep.test.ts", "// weakened\n");

    const before = git(workspaces.integrationPath(RUN), "rev-parse", "HEAD");
    const attempt = workspaces.integrate(ref("A"), ["."], "integrate A", ["tests"]);
    await __jait_instanceRejected(0, attempt, WorkspaceError);
    await attempt.catch((error: unknown) => {
      __jait_capture(1, ((error as Error).message));
      __jait_capture(2, ((error as Error).message));
    });
    __jait_capture(3, (git(workspaces.integrationPath(RUN), "rev-parse", "HEAD")), (before));
    __jait_capture(4, (existsSync(join(workspaces.integrationPath(RUN), "src/impl.ts"))));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_167_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    await seed({ "tests/keep.test.ts": "it('works', () => {});\n" });
    const location = await workspaces.prepareWrite(ref("A"), ["."], ["tests"]);
    await writeIn(location.path, "tests/keep.test.ts", "// weakened\n");

    const retry = workspaces.prepareWrite(ref("A"), ["."], ["tests"]);
    await __jait_instanceRejected(0, retry, WorkspaceError);
    await retry.catch((error: unknown) => {
      __jait_capture(1, ((error as Error).message));
    });
    // The weakened test was not checkpointed into the branch.
    __jait_capture(2, (git(location.path, "log", "--format=%s", "-1")));
    __jait_capture(3, (git(location.path, "status", "--porcelain")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_182_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "docs/a.md", "from A\n");

    const result = await workspaces.integrate(ref("A"), ["docs"], "integrate A");
    __jait_capture(0, (result.integrated));

    const integration = workspaces.integrationPath(RUN);
    __jait_capture(1, (git(integration, "rev-parse", "--abbrev-ref", "HEAD")), (integrationBranchName(RUN)));
    __jait_capture(2, (await readFile(join(integration, "docs/a.md"), "utf8")));
    __jait_capture(3, (git(repo, "branch", "--show-current")));
    __jait_capture(4, (gitOk(repo, "cat-file", "-e", `main:docs/a.md`)));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_196_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const a = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(a.path, "docs/a.md", "from A\n");
    await workspaces.integrate(ref("A"), ["docs"], "integrate A");

    const b = await workspaces.prepareWrite(ref("B"), ["src"]);
    __jait_capture(0, (await readFile(join(b.path, "docs/a.md"), "utf8")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_205_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const b = await workspaces.prepareWrite(ref("B"), ["docs"]);
    const c = await workspaces.prepareWrite(ref("C"), ["src"]);
    await writeIn(b.path, "docs/b.md", "B\n");
    await writeIn(c.path, "src/c.ts", "export const c = 1;\n");

    await workspaces.integrate(ref("B"), ["docs"], "integrate B");
    await workspaces.integrate(ref("C"), ["src"], "integrate C");

    const integration = workspaces.integrationPath(RUN);
    __jait_capture(0, (await readFile(join(integration, "docs/b.md"), "utf8")));
    __jait_capture(1, (await readFile(join(integration, "src/c.ts"), "utf8")));
    __jait_capture(2, (git(integration, "status", "--porcelain")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_220_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const x = await workspaces.prepareWrite(ref("X"), ["."]);
    const y = await workspaces.prepareWrite(ref("Y"), ["."]);
    await writeIn(x.path, "shared.txt", "from X\n");
    await writeIn(y.path, "shared.txt", "from Y\n");
    await workspaces.integrate(ref("X"), ["."], "integrate X");
    const headAfterX = git(workspaces.integrationPath(RUN), "rev-parse", "HEAD");

    const attempt = workspaces.integrate(ref("Y"), ["."], "integrate Y");
    await __jait_instanceRejected(0, attempt, WorkspaceConflictError);
    await attempt.catch((error: unknown) => {
      __jait_capture(1, ((error as WorkspaceConflictError).files));
    });

    const integration = workspaces.integrationPath(RUN);
    __jait_capture(2, (git(integration, "rev-parse", "HEAD")), (headAfterX));
    __jait_capture(3, (git(integration, "status", "--porcelain")));
    __jait_capture(4, (await readFile(join(integration, "shared.txt"), "utf8")));
    __jait_capture(5, (existsSync(join(integration, ".git"))));
    __jait_capture(6, (gitOk(integration, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_242_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const a = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(a.path, "docs/a.md", "from A\n");
    await workspaces.integrate(ref("A"), ["docs"], "integrate A");

    // A pending task branch with its own commit, merged into integration but never committed (simulated crash).
    const d = await workspaces.prepareWrite(ref("D"), ["notes"]);
    await writeIn(d.path, "notes/d.md", "from D\n");
    git(d.path, "add", "-A");
    git(d.path, "commit", "-q", "-m", "D work");
    const integration = workspaces.integrationPath(RUN);
    __jait_capture(0, (gitOk(integration, "merge", "--no-commit", "--no-ff", taskBranchName(RUN, "D"))));
    __jait_capture(1, (gitOk(integration, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")));

    await workspaces.prepareRead(ref("reader"));
    __jait_capture(2, (gitOk(integration, "rev-parse", "--verify", "--quiet", "MERGE_HEAD")));
    __jait_capture(3, (git(integration, "status", "--porcelain")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_261_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "src/leftover.ts", "x\n");

    await __jait_instanceRejected(0, workspaces.prepareWrite(ref("A"), ["docs"]), WorkspaceError);
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_268_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    const location = await workspaces.prepareWrite(ref("A"), ["docs"]);
    await writeIn(location.path, "docs/partial.md", "half done\n");

    await workspaces.prepareWrite(ref("A"), ["docs"]);
    __jait_capture(0, (git(location.path, "log", "--format=%s", "-1")));
    __jait_capture(1, (git(location.path, "status", "--porcelain")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_277_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    __jait_thrown(0, () => workspaces.assertRunHost(USER, REPO_ID));
    __jait_thrown(1, () => workspaces.assertRunHost("someone-else", REPO_ID), (WorkspaceError));
    __jait_thrown(2, () => workspaces.assertRunHost(USER, "missing-repo"), (WorkspaceError));
    __jait_thrown(3, () => workspaces.assertRunHost(USER, null), (WorkspaceError));
    const unconfigured = new WorkflowWorkspaces({ root: join(base, "other") });
    __jait_thrown(4, () => unconfigured.assertRunHost(USER, REPO_ID), (WorkspaceError));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_286_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{
let base: string;
let repo: string;
let workspaces: WorkflowWorkspaces;
const ref = (taskId: string) => ({ userId: USER, repoId: REPO_ID, runId: RUN, taskId });
async function seed(files: Record<string, string>): Promise<void> {
    for (const [file, content] of Object.entries(files)) await writeIn(repo, file, content);
    git(repo, "add", ...Object.keys(files));
    git(repo, "commit", "-q", "-m", "seed");
  }
const __jait_hook_1449 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-wf-"));
    repo = join(base, "repo");
    await mkdir(repo);
    git(repo, "init", "-q", "-b", "main");
    await writeIn(repo, "README.md", "base\n");
    git(repo, "add", "README.md");
    git(repo, "commit", "-q", "-m", "base");
    const owned = {
      id: REPO_ID,
      userId: USER,
      localPath: repo,
      deviceId: null,
    };
    const repositories = {
      getById: (id: string) => (id === REPO_ID ? owned : undefined),
    } as unknown as Pick<RepositoryService, "getById">;
    workspaces = new WorkflowWorkspaces({ root: join(base, "worktrees"), repositories });
  };
const __jait_hook_2115 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_1449();
try {
await (async()=>{

    for (const taskId of ["plain", "with.dot", "a/b c", "trailing.lock", "émoji"]) {
      const branch = taskBranchName(RUN, taskId);
      __jait_capture(0, (gitOk(repo, "check-ref-format", "--branch", branch)));
    }
    __jait_capture(1, (taskBranchName(RUN, "a.b")), (taskBranchName(RUN, "a_b")));
  
})();

} finally {
await __jait_hook_2115();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workspace_test_ts_296_3": {


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
function gitOk(cwd: string, ...args: string[]): boolean {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
}
async function writeIn(root: string, relative: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relative)), { recursive: true });
  await writeFile(join(root, relative), content);
}
const USER = "owner-1";
const REPO_ID = "repo-1";
const RUN = "run-1";
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (pathCoveredByWrites("src/lib.rs", ["src"])));
    __jait_capture(1, (pathCoveredByWrites("srcx/lib.rs", ["src"])));
    __jait_capture(2, (pathCoveredByWrites("anything", ["."])));
    __jait_capture(3, (pathCoveredByWrites("name:build", ["name:build"])));
  
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
