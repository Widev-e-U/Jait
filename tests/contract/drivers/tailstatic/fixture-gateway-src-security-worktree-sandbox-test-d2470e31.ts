// Translated fixture from packages/gateway/src/security/worktree-sandbox.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { worktreeGitMountArgs } from "../../../../packages/gateway/src/security/worktree-sandbox.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/worktree-sandbox.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_worktree_sandbox_test_ts_22_3": {


const scratch: string[] = [];
function fixture() {
  const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-sandbox-")); scratch.push(root);
  const repo = join(root, "repo"), worktree = join(root, "worktree"); mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init"); writeFileSync(join(repo, "owned.txt"), "before\n"); git("add", "owned.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  git("worktree", "add", "-b", "delivery", worktree);
  writeFileSync(join(worktree, "owned.txt"), "after\n");
  return { root, repo, worktree };
}
const __jait_hook_1033 = () => { for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true }); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { repo, worktree } = fixture();
    __jait_capture(0, (worktreeGitMountArgs(worktree)), (["-v", `${repo}/.git:${repo}/.git:ro`]));
    __jait_capture(1, (worktreeGitMountArgs(repo)));
  
})();

} finally {
await __jait_hook_1033();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_worktree_sandbox_test_ts_27_3": {


const scratch: string[] = [];
function fixture() {
  const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-sandbox-")); scratch.push(root);
  const repo = join(root, "repo"), worktree = join(root, "worktree"); mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init"); writeFileSync(join(repo, "owned.txt"), "before\n"); git("add", "owned.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  git("worktree", "add", "-b", "delivery", worktree);
  writeFileSync(join(worktree, "owned.txt"), "after\n");
  return { root, repo, worktree };
}
const __jait_hook_1033 = () => { for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true }); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { root, worktree } = fixture();
    const forged = join(root, "forged"); mkdirSync(forged);
    writeFileSync(join(forged, ".git"), readFileSync(join(worktree, ".git")));
    __jait_thrown(0, () => worktreeGitMountArgs(forged));
  
})();

} finally {
await __jait_hook_1033();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_worktree_sandbox_test_ts_33_3": {


const scratch: string[] = [];
function fixture() {
  const root = mkdtempSync(join(__jait_fixture_dir, "jait-git-sandbox-")); scratch.push(root);
  const repo = join(root, "repo"), worktree = join(root, "worktree"); mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init"); writeFileSync(join(repo, "owned.txt"), "before\n"); git("add", "owned.txt");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  git("worktree", "add", "-b", "delivery", worktree);
  writeFileSync(join(worktree, "owned.txt"), "after\n");
  return { root, repo, worktree };
}
const __jait_hook_1033 = () => { for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true }); };
/*__jait_scope_open__*/{
/*__jait_source_gate__ runIf process.env.JAIT_TEST_SANDBOX === "1" */

try {
await (async()=>{

    const { repo, worktree } = fixture();
    const mainBefore = readFileSync(join(repo, "owned.txt"), "utf8");
    // Reproduce the old mount configuration: the worktree's gitdir pointer
    // points outside /project and Git cannot inspect this checkout.
    __jait_thrown(0, () => execFileSync("docker", ["run", "--rm", "--network", "none", "--user", `${process.getuid!()}:${process.getgid!()}`,
      "-e", "HOME=/tmp", "-v", `${worktree}:/project`, "-w", "/project", "jait/sandbox:latest", "git", "status", "--short"],
      { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] }));
    const output = execFileSync("docker", ["run", "--rm", "--network", "none", "--user", `${process.getuid!()}:${process.getgid!()}`,
      "-e", "HOME=/tmp", "-v", `${worktree}:/project`, ...worktreeGitMountArgs(worktree), "-w", "/project", "jait/sandbox:latest",
      "sh", "-c", "git status --short && git diff --name-only"], { encoding: "utf8", timeout: 20_000 });
    __jait_capture(1, (output));
    __jait_capture(2, (output.trim().split("\n").at(-1)));
    __jait_capture(3, (readFileSync(join(repo, "owned.txt"), "utf8")), (mainBefore));
  
})();

} finally {
await __jait_hook_1033();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
