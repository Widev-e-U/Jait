// Translated fixture from packages/gateway/src/services/git-diff-stats.test.ts; expected literals are in tail_static.rs.
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitService } from "../../../../packages/gateway/src/services/git.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/git-diff-stats.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_git_diff_stats_test_ts_31_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_521 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-diff-stats-test-"));
    git(repoDir, "init -b main");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    await writeFile(join(repoDir, "base.txt"), "line1\nline2\nline3\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_922 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_521();
try {
await (async()=>{

    // Branch off main, then advance main with large unrelated work.
    git(repoDir, "checkout -b jait/thread");
    git(repoDir, "checkout main");
    const bigContent = Array.from({ length: 500 }, (_, i) => `unrelated ${i}`).join("\n") + "\n";
    await writeFile(join(repoDir, "unrelated.txt"), bigContent);
    git(repoDir, "add -A");
    git(repoDir, "commit -m 'big unrelated work on main'");

    // The thread makes a tiny committed change plus an uncommitted edit.
    git(repoDir, "checkout jait/thread");
    await writeFile(join(repoDir, "feature.txt"), "hello\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m 'thread feature'");
    await writeFile(join(repoDir, "feature.txt"), "hello\nworld\n");

    const stats = await svc.diffStats(repoDir, "main");

    // Only feature.txt (committed + uncommitted), NOT main's 500-line file.
    __jait_capture(0, (stats.files));
    __jait_capture(1, (stats.insertions));
    __jait_capture(2, (stats.deletions));
    __jait_capture(3, (stats.hasChanges));
  
})();

} finally {
await __jait_hook_922();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_git_diff_stats_test_ts_56_3": {


function git(cwd: string, cmd: string) {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf-8" }).trim();
}
/*__jait_scope_open__*/{
let repoDir: string;
let svc: GitService;
const __jait_hook_521 = async () => {
    repoDir = await mkdtemp(join(__jait_fixture_dir, "git-diff-stats-test-"));
    git(repoDir, "init -b main");
    git(repoDir, "config user.email test@test.com");
    git(repoDir, "config user.name Test");
    await writeFile(join(repoDir, "base.txt"), "line1\nline2\nline3\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m initial");
    svc = new GitService();
  };
const __jait_hook_922 = async () => {
    await rm(repoDir, { recursive: true, force: true });
  };
await __jait_hook_521();
try {
await (async()=>{

    // Thread branch has no commits of its own; main advanced afterward.
    git(repoDir, "checkout -b jait/thread");
    git(repoDir, "checkout main");
    await writeFile(join(repoDir, "more.txt"), "a\nb\nc\nd\n");
    git(repoDir, "add -A");
    git(repoDir, "commit -m 'main advances'");

    git(repoDir, "checkout jait/thread");
    await writeFile(join(repoDir, "base.txt"), "line1\nline2\nline3\nline4\n");

    const stats = await svc.diffStats(repoDir, "main");

    // Should not surface main's new commit as this thread's work — only the
    // single uncommitted line added to the tracked file.
    __jait_capture(0, (stats.insertions));
    __jait_capture(1, (stats.deletions));
    __jait_capture(2, (stats.files));
  
})();

} finally {
await __jait_hook_922();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
