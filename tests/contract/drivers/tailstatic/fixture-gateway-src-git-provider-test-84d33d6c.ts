// Translated fixture from packages/gateway/src/git-provider.test.ts; expected literals are in tail_static.rs.
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, detectGitRemoteProvider, parseGitRemote } from "../../../../packages/gateway/src/services/git.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/git-provider.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_git_provider_test_ts_9_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (detectGitRemoteProvider("git@github.com:acme/repo.git")));
    __jait_capture(1, (detectGitRemoteProvider("git@ssh.dev.azure.com:v3/acme/project/repo")));
    __jait_capture(2, (detectGitRemoteProvider("https://gitea.example.com/acme/repo.git")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_15_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseGitRemote("https://dev.azure.com/acme/project/_git/repo")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_26_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseGitRemote("https://github.com/acme/repo.git")));
    __jait_capture(1, (parseGitRemote("git@github.com:acme/repo.git")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_43_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseGitRemote("git@ssh.dev.azure.com:v3/acme/project/repo")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_54_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseGitRemote("https://acme.visualstudio.com/project/_git/repo")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_65_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseGitRemote("https://gitlab.com/group/subgroup/repo.git")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_75_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseGitRemote("https://bitbucket.org/acme/repo.git")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_85_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (parseGitRemote(null)));
    __jait_captureType(1, (parseGitRemote("")));
    __jait_captureType(2, (parseGitRemote("   ")));
    __jait_captureType(3, (parseGitRemote("not a url")));
    __jait_captureType(4, (parseGitRemote("https://github.com/acme")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_93_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (detectGitRemoteProvider(null)));
    __jait_capture(1, (detectGitRemoteProvider("garbage")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_100_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const git = new GitService();
    vi.spyOn(git, "getPreferredRemote").mockResolvedValue("origin");
    const remoteUrlSpy = vi.spyOn(git, "getRemoteUrl");
    remoteUrlSpy.mockResolvedValueOnce("git@github.com:acme/repo.git");
    await __jait_captureResolved(0, (git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")));

    remoteUrlSpy.mockResolvedValueOnce("https://dev.azure.com/acme/project/_git/repo");
    await __jait_captureResolved(1, (git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")));

    remoteUrlSpy.mockResolvedValueOnce("https://gitea.example.com/acme/repo.git");
    await __jait_captureResolved(2, (git.buildCreatePrUrl("/repo", "feature/test", "origin", "main")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_122_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-discard-"));
    try {
      execSync("git init", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "base\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "changed\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await __jait_captureResolved(0, (git.discardChanges(root, ["file.txt"])));

      __jait_capture(1, (readFileSync(join(root, "file.txt"), "utf8")));
      __jait_capture(2, (execSync("git status --short", { cwd: root, encoding: "utf8" }).trim()));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_149_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-diff-stats-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "base\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/thread", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "file.txt"), "base\nextra\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "thread change"', { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await __jait_captureResolved(0, (git.diffStats(root, "main")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_178_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-diff-stats-branch-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "file.txt"), "base\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/one", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "file.txt"), "base\none\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "feature one"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });
      execSync("git checkout -b feature/two", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "file.txt"), "base\ntwo\nthree\n");
      execSync("git add file.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "feature two"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await __jait_captureResolved(0, (git.diffStats(root, "main", "feature/one")));
      await __jait_captureResolved(1, (git.diffStats(root, "main", "feature/two")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_221_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-diff-stats-merged-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "base.txt"), "base\n");
      execSync("git add base.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/thread", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "thread.txt"), "thread\n");
      execSync("git add thread.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "thread change"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });
      execSync('git merge --no-ff feature/thread -m "merge thread"', { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "main-only.txt"), "main only\n");
      execSync("git add main-only.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "main advances"', { cwd: root, stdio: "ignore" });

      const git = new GitService();
      await __jait_captureResolved(0, (git.diffStats(root, "main", "feature/thread")));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_git_provider_test_ts_256_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-diff-stats-untracked-"));
    try {
      execSync("git init -b main", { cwd: root, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: root, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: root, stdio: "ignore" });
      execSync("git config core.autocrlf false", { cwd: root, stdio: "ignore" });

      writeFileSync(join(root, "base.txt"), "base\n");
      execSync("git add base.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: root, stdio: "ignore" });

      execSync("git checkout -b feature/thread", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "thread.txt"), "thread\n");
      execSync("git add thread.txt", { cwd: root, stdio: "ignore" });
      execSync('git commit -m "thread change"', { cwd: root, stdio: "ignore" });

      execSync("git checkout main", { cwd: root, stdio: "ignore" });
      writeFileSync(join(root, "scratch.txt"), "local only\n");

      const git = new GitService();
      await __jait_captureResolved(0, (git.diffStats(root, "main", "feature/thread")));
    } finally {
      rmSync(root, { recursive: true, force: true });
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
