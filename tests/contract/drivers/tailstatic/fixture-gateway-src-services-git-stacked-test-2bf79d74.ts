// Translated fixture from packages/gateway/src/services/git-stacked.test.ts; expected literals are in tail_static.rs.
import { mkdtemp, writeFile, readFile, rm, chmod, mkdir, lstat, symlink, readlink } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { homedir, platform, tmpdir } from "node:os";
import { GitService, isManagedWorktreePath } from "../../../../packages/gateway/src/services/git.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/git-stacked.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_41_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    // Create a change
    await writeFile(join(repoDir, "file.txt"), "hello");

    // Make commit fail via a pre-commit hook that rejects
    const hookPath = join(repoDir, ".git", "hooks", "pre-commit");
    await writeFile(hookPath, "#!/bin/sh\nexit 1\n");
    if (platform() !== "win32") await chmod(hookPath, 0o755);

    const error = await captureError(svc.runStackedAction(repoDir, "commit", "test commit"));

    __jait_instance(0, error, Error);

    // Files should NOT be left staged
    const staged = git(repoDir, "diff --cached --name-only");
    __jait_capture(1, (staged));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_59_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    await writeFile(join(repoDir, "file.txt"), "hello");

    // Pass undefined message so it auto-generates, but sabotage the commit
    // by making the repo read-only objects dir
    // Instead: use a commit-msg hook that rejects
    const hookPath = join(repoDir, ".git", "hooks", "commit-msg");
    await writeFile(hookPath, "#!/bin/sh\nexit 1\n");
    if (platform() !== "win32") await chmod(hookPath, 0o755);

    const error = await captureError(svc.runStackedAction(repoDir, "commit", "test commit"));

    __jait_instance(0, error, Error);

    // Verify nothing is left staged
    const staged = git(repoDir, "diff --cached --name-only");
    __jait_capture(1, (staged));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_78_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    await writeFile(join(repoDir, "file.txt"), "hello");

    const result = await svc.runStackedAction(repoDir, "commit", "test: add file");

    __jait_capture(0, (result.commit.status));
    // No staged or unstaged files should remain
    const status = git(repoDir, "status --porcelain");
    __jait_capture(1, (status));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_89_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    await writeFile(join(repoDir, "staged.txt"), "staged");
    await writeFile(join(repoDir, "unstaged-a.txt"), "a");
    await writeFile(join(repoDir, "unstaged-b.txt"), "b");

    // Stage only the first file; the other two remain unstaged.
    git(repoDir, "add staged.txt");

    const result = await svc.runStackedAction(repoDir, "commit", "test: staged only");

    __jait_capture(0, (result.commit.status));
    // Only the staged file should be in the commit.
    __jait_capture(1, (git(repoDir, "show --name-only --format= HEAD")));
    // The unstaged files must NOT be committed nor pushed; they stay in the tree.
    const status = git(repoDir, "status --porcelain");
    __jait_capture(2, (status));
    __jait_capture(3, (status));
    __jait_capture(4, (status));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_109_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    const releaseCheckoutDir = join(repoDir, ".jait", "release-checkout-20260729");
    await mkdir(releaseCheckoutDir, { recursive: true });
    git(releaseCheckoutDir, "init");
    await writeFile(join(repoDir, "file.txt"), "hello");

    const result = await svc.runStackedAction(repoDir, "commit", "test: ignore local checkout");

    __jait_capture(0, (result.commit.status));
    __jait_capture(1, (git(repoDir, "show --name-only --format= HEAD")));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_121_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    const releaseCheckoutDir = join(repoDir, ".jait", "release-checkout-20260729");
    await mkdir(releaseCheckoutDir, { recursive: true });
    git(releaseCheckoutDir, "init");
    git(releaseCheckoutDir, "config user.email test@test.com");
    git(releaseCheckoutDir, "config user.name Test");
    await writeFile(join(releaseCheckoutDir, "release.txt"), "release");
    git(releaseCheckoutDir, "add release.txt");
    git(releaseCheckoutDir, "commit -m release");
    git(repoDir, "add .jait/release-checkout-20260729");
    git(repoDir, "commit -m \"track local release checkout\"");

    git(releaseCheckoutDir, "checkout --orphan empty");
    git(releaseCheckoutDir, "rm -rf .");
    await writeFile(join(repoDir, "file.txt"), "hello");

    const result = await svc.runStackedAction(repoDir, "commit", "test: ignore stale checkout");

    __jait_capture(0, (result.commit.status));
    __jait_capture(1, (git(repoDir, "show --name-only --format= HEAD")));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_143_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    const packageDir = join(repoDir, "packages", "one");
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "inside.txt"), "inside");
    await writeFile(join(repoDir, "outside.txt"), "outside");

    const result = await svc.runStackedAction(packageDir, "commit", "test: scoped commit");

    __jait_capture(0, (result.commit.status));
    __jait_capture(1, (git(repoDir, "show --name-only --format= HEAD")));
    __jait_capture(2, (git(repoDir, "status --porcelain")));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_156_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    const bareRemote = await mkdtemp(join(__jait_fixture_dir, "git-sync-remote-"));
    git(bareRemote, "init --bare");
    git(repoDir, `remote add origin "${bareRemote}"`);

    const result = await svc.sync(repoDir);

    __jait_capture(0, (result.pull.status));
    __jait_capture(1, (result.push.status));
    __jait_capture(2, (result.upstreamBranch));
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_168_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_758 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-stacked-test-"));
    git(repoDir, "init");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    // Create an initial commit so HEAD exists
    await writeFile(join(repoDir, "init.txt"), "init");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_1178 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_758();
try {
await (async()=>{

    const bareRemote = await mkdtemp(join(__jait_fixture_dir, "git-version-bump-remote-"));
    const collaboratorDir = await mkdtemp(join(__jait_fixture_dir, "git-version-bump-peer-"));
    try {
      git(bareRemote, "init --bare");
      git(repoDir, `remote add origin "${bareRemote}"`);

      await writeFile(join(repoDir, "package.json"), `${JSON.stringify({ name: "retry-test", version: "1.0.0" }, null, 2)}\n`);
      git(repoDir, "add package.json");
      git(repoDir, "commit -m \"chore: add package\"");
      git(repoDir, "push -u origin HEAD");

      git(collaboratorDir, `clone "${bareRemote}" .`);
      git(collaboratorDir, "config user.email test@test.com");
      git(collaboratorDir, "config user.name Test");
      await writeFile(join(collaboratorDir, "README.md"), "collaborator change\n");
      git(collaboratorDir, "add README.md");
      git(collaboratorDir, "commit -m \"docs: add readme\"");
      git(collaboratorDir, "push origin HEAD");

      const result = await svc.runVersionBumpCommitPushFlow(repoDir);
      const branch = git(repoDir, "rev-parse --abbrev-ref HEAD");

      __jait_capture(0, (result.version.previousVersion));
      __jait_capture(1, (result.version.nextVersion));
      __jait_capture(2, (result.sync.status));
      __jait_capture(3, (result.git.commit.status));
      __jait_capture(4, (result.git.push.status));

      const packageJson = JSON.parse(await readFile(join(repoDir, "package.json"), "utf-8")) as { version: string };
      __jait_capture(5, (packageJson.version));
      __jait_capture(6, (git(repoDir, `show origin/${branch}:README.md`)));
      __jait_capture(7, (git(repoDir, `show origin/${branch}:package.json`)));
    } finally {
      await rm(collaboratorDir, { recursive: true, force: true });
      await rm(bareRemote, { recursive: true, force: true });
    }
  
})();

} finally {
await __jait_hook_1178();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_210_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const repoDir = await mkdtemp(join(__jait_fixture_dir, "git-disk-growth-test-"));
    const worktreeDir = `${repoDir}-worktree`;
    try {
      git(repoDir, "init");
      git(repoDir, "config user.email test@test.com");
      git(repoDir, "config user.name Test");
      await writeFile(join(repoDir, ".gitignore"), "node_modules/\njait-win/\ntarget/\n*.local\n");
      await writeFile(join(repoDir, "tracked.local"), "tracked despite ignore");
      await writeFile(join(repoDir, "untracked.txt"), "keep");
      await writeFile(join(repoDir, "file with spaces.txt"), "keep spaces");
      await symlink("jait-win", join(repoDir, "build-link"));
      await mkdir(join(repoDir, "nested", "target"), { recursive: true });
      await mkdir(join(repoDir, "node_modules"));
      await mkdir(join(repoDir, "jait-win"));
      await writeFile(join(repoDir, "nested", "target", "build.bin"), Buffer.alloc(1024 * 1024));
      await writeFile(join(repoDir, "node_modules", "dep.js"), "dependency");
      await writeFile(join(repoDir, "jait-win", "disk.bin"), Buffer.alloc(1024 * 1024));
      await writeFile(join(repoDir, "secret.local"), "excluded");
      git(repoDir, "add .gitignore");
      git(repoDir, "add -f tracked.local");
      git(repoDir, "commit -m initial");
      await new GitService().createWorktree(repoDir, git(repoDir, "branch --show-current"),
        "jait/disk-growth", worktreeDir, { fastPath: true });
      for (const path of ["node_modules", "jait-win", "nested/target", "secret.local"]) {
        await __jait_captureRejected(0, (lstat(join(worktreeDir, path))));
      }
      __jait_capture(1, (await readFile(join(worktreeDir, "tracked.local"), "utf8")));
      __jait_capture(2, (await readFile(join(worktreeDir, "untracked.txt"), "utf8")));
      __jait_capture(3, (await readFile(join(worktreeDir, "file with spaces.txt"), "utf8")));
      __jait_capture(4, ((await lstat(join(worktreeDir, "build-link"))).isSymbolicLink()));
      __jait_capture(5, (await readlink(join(worktreeDir, "build-link"))));
      __jait_capture(6, ((await lstat(join(worktreeDir, ".git"))).isFile()));
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_249_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const repoDir = await mkdtemp(join(__jait_fixture_dir, "git-fast-worktree-test-"));
    const worktreeDir = `${repoDir}-worktree`;
    try {
      git(repoDir, "init");
      git(repoDir, "config user.email test@test.com");
      git(repoDir, "config user.name Test");
      await writeFile(join(repoDir, "tracked.txt"), "tracked");
      await writeFile(join(repoDir, "untracked.txt"), "copied");
      git(repoDir, "add tracked.txt");
      git(repoDir, "commit -m initial");
      const baseBranch = git(repoDir, "branch --show-current");

      await new GitService().createWorktree(
        repoDir,
        baseBranch,
        "jait/fast-worktree-test",
        worktreeDir,
        { fastPath: true },
      );

      __jait_capture(0, ((await lstat(join(worktreeDir, ".git"))).isFile()));
      __jait_capture(1, (await readFile(join(worktreeDir, ".git"), "utf8")));
      __jait_capture(2, (await readFile(join(worktreeDir, "tracked.txt"), "utf8")));
      __jait_capture(3, (await readFile(join(worktreeDir, "untracked.txt"), "utf8")));
      __jait_capture(4, (git(worktreeDir, "status --porcelain")));
    } finally {
      await rm(worktreeDir, { recursive: true, force: true });
      await rm(repoDir, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_stacked_test_ts_281_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
async function captureError(run: Promise<unknown>): Promise<unknown> {
  try {
    await run;
    return null;
  } catch (error) {
    return error;
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const managedRoot = join(process.env["JAIT_STATE_DIR"] ?? join(homedir(), ".jait"), "worktrees");

    __jait_capture(0, (isManagedWorktreePath(join(managedRoot, "repo", "thread"))));
    __jait_capture(1, (isManagedWorktreePath(managedRoot)));
    __jait_capture(2, (isManagedWorktreePath(`${managedRoot}-copy/repo/thread`)));
  
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
