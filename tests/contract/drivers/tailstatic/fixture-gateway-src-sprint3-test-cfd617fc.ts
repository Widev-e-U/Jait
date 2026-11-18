// Translated fixture from packages/gateway/src/sprint3.test.ts; expected literals are in tail_static.rs.
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PathGuard, PathTraversalError } from "../../../../packages/gateway/src/security/path-guard.js";
import { FileSystemSurface } from "../../../../packages/gateway/src/surfaces/filesystem.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { FileSystemSurfaceFactory } from "../../../../packages/gateway/src/surfaces/filesystem.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createToolRegistry } from "../../../../packages/gateway/src/tools/index.js";
import { createOsQueryTool } from "../../../../packages/gateway/src/tools/os-tools.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { TerminalSurfaceFactory } from "../../../../packages/gateway/src/surfaces/terminal.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint3.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint3_test_ts_28_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({ projectRoot: project });
    const result = guard.validate("src/index.ts");
    __jait_capture(0, (result));
    __jait_capture(1, (result));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_35_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({ projectRoot: project });
    __jait_thrown(0, () => guard.validate("../../etc/passwd"), (PathTraversalError));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_40_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({ projectRoot: project });
    __jait_thrown(0, () => guard.validate("src/\0malicious"), (PathTraversalError));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_45_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = process.platform === "win32"
      ? new PathGuard({ projectRoot: "C:\\Users\\test\\project" })
      : new PathGuard({ projectRoot: "/tmp/project" });
    const deniedTarget = process.platform === "win32"
      ? "C:\\Windows\\System32\\cmd.exe"
      : "/etc/passwd";
    __jait_thrown(0, () => guard.validate(deniedTarget), (PathTraversalError));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_55_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({
      projectRoot: project,
      deniedPaths: [".env"],
    });
    __jait_thrown(0, () => guard.validate(".env"), (PathTraversalError));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_63_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({ projectRoot: project });
    __jait_capture(0, (guard.isAllowed("src/index.ts")));
    __jait_capture(1, (guard.isAllowed("../../etc/passwd")));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_69_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({ projectRoot: project, checkSymlinks: true });
    const outsideDir = mkdtempSync(join(__jait_fixture_dir, "jait-outside-"));
    writeFileSync(join(outsideDir, "secret.txt"), "secret");

    try {
      symlinkSync(join(outsideDir, "secret.txt"), join(project, "src", "link.txt"));
      await __jait_rejected(0, guard.validateWithSymlinkCheck("src/link.txt"), (PathTraversalError));
    } catch (err) {
      // Symlink creation may fail on Windows without admin rights — skip gracefully
      if ((err as NodeJS.ErrnoException).code === "EPERM") {
        // Can't test symlinks without permissions
        return;
      }
      throw err;
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_91_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_587 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-pathguard-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "index.ts"), "console.log('hello')");
  };
const __jait_hook_812 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_587();
try {
await (async()=>{

    const guard = new PathGuard({ projectRoot: project });
    const result = await guard.validateWithSymlinkCheck("src/newfile.ts");
    __jait_capture(0, (result));
  
})();

} finally {
await __jait_hook_812();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_120_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    __jait_capture(0, (fs.state));
    __jait_capture(1, (fs.sessionId));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_125_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    const content = await fs.read("src/hello.ts");
    __jait_capture(0, (content));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_130_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    await fs.write("src/deep/nested/file.ts", "const y = 1;\n");
    const content = readFileSync(join(project, "src", "deep", "nested", "file.ts"), "utf-8");
    __jait_capture(0, (content));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_136_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    const result = await fs.patch("src/hello.ts", "42", "99");
    __jait_capture(0, (result.matched));
    const content = readFileSync(join(project, "src", "hello.ts"), "utf-8");
    __jait_capture(1, (content));
    __jait_capture(2, (content));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_144_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    const result = await fs.patch("src/hello.ts", "nonexistent", "replaced");
    __jait_capture(0, (result.matched));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_149_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    writeFileSync(join(project, "src", "other.ts"), "");
    const entries = await fs.list("src");
    __jait_capture(0, (entries));
    __jait_capture(1, (entries));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_156_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    __jait_capture(0, (await fs.exists("src/hello.ts")));
    __jait_capture(1, (await fs.exists("src/nope.ts")));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_161_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    const info = await fs.statFile("src/hello.ts");
    __jait_capture(0, (info.size));
    __jait_capture(1, (info.isDirectory));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_167_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    await __jait_rejected(0, fs.read("../../etc/passwd"));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_171_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    await __jait_rejected(0, fs.write("../../tmp/evil.txt", "pwned"));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_175_3": {


/*__jait_scope_open__*/{
let project: string;
let fs: FileSystemSurface;
const __jait_hook_3707 = async () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-fs-"));
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "hello.ts"), 'export const x = 42;\n');

    fs = new FileSystemSurface("fs-test");
    await fs.start({ sessionId: "test-session", projectRoot: project });
  };
const __jait_hook_4050 = async () => {
    await fs.stop();
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_3707();
try {
await (async()=>{

    await fs.read("src/hello.ts");
    await fs.read("src/hello.ts");
    const snap = fs.snapshot();
    __jait_capture(0, (snap.metadata.operationCount));
  
})();

} finally {
await __jait_hook_4050();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_199_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_6572 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-registry-"));
  };
const __jait_hook_6661 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_6572();
try {
await (async()=>{

    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());

    const s = await registry.startSurface("filesystem", "fs-1", {
      sessionId: "s1",
      projectRoot: project,
    });

    __jait_capture(0, (s.state));
    __jait_capture(1, (s.sessionId));
    __jait_capture(2, (registry.listSnapshots()));
  
})();

} finally {
await __jait_hook_6661();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_213_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_6572 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-registry-"));
  };
const __jait_hook_6661 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_6572();
try {
await (async()=>{

    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());

    await registry.startSurface("filesystem", "fs-1", {
      sessionId: "s1",
      projectRoot: project,
    });

    const stopped = await registry.stopSurface("fs-1");
    __jait_capture(0, (stopped));
    __jait_capture(1, (registry.listSurfaces()));
  
})();

} finally {
await __jait_hook_6661();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_227_3": {


/*__jait_scope_open__*/{
let project: string;
const __jait_hook_6572 = () => {
    project = mkdtempSync(join(__jait_fixture_dir, "jait-registry-"));
  };
const __jait_hook_6661 = () => {
    rmSync(project, { recursive: true, force: true });
  };
await __jait_hook_6572();
try {
await (async()=>{

    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());

    await registry.startSurface("filesystem", "fs-a", { sessionId: "a", projectRoot: project });
    await registry.startSurface("filesystem", "fs-b", { sessionId: "b", projectRoot: project });
    await registry.startSurface("filesystem", "fs-a2", { sessionId: "a", projectRoot: project });

    __jait_capture(0, (registry.getBySession("a")));
    __jait_capture(1, (registry.getBySession("b")));
  
})();

} finally {
await __jait_hook_6661();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_245_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "test.tool",
      description: "A test tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "done" }),
    });

    __jait_capture(0, (registry.has("test.tool")));
    __jait_capture(1, (registry.listNames()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_258_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "Echoes input",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: async (input: { text: string }) => ({
        ok: true,
        message: input.text,
        data: { echo: input.text },
      }),
    });

    const result = await registry.execute("echo", { text: "hello" }, {
      sessionId: "s1",
      actionId: "a1",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_286_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const result = await registry.execute("nope", {}, {
      sessionId: "s1",
      actionId: "a1",
      projectRoot: "/tmp",
      requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_304_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const surfaceRegistry = new SurfaceRegistry();
    const tools = createToolRegistry(surfaceRegistry);

    const names = tools.listNames();
    __jait_capture(0, (names));
    __jait_capture(1, (names));
    __jait_capture(2, (names));
    __jait_capture(3, (names));
    __jait_capture(4, (names));
    __jait_capture(5, (names));
    __jait_capture(6, (names));
    __jait_capture(7, (names));
    __jait_capture(8, (names));
    __jait_capture(9, (names));
    __jait_capture(10, (names));
    __jait_capture(11, (names));
    __jait_capture(12, (names.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_330_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const tool = createOsQueryTool();
    const result = await tool.execute({ query: "info" }, {
      sessionId: "s1",
      actionId: "a1",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    __jait_capture(0, (result.ok));
    const data = result.data as Record<string, unknown>;
    __jait_captureType(1, (data.platform));
    __jait_captureType(2, (data.hostname));
    __jait_capture(3, (data.cpus));
    __jait_capture(4, (data.totalMemoryGB));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_347_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const tool = createOsQueryTool();
    const result = await tool.execute({ query: "env" }, {
      sessionId: "s1",
      actionId: "a1",
      projectRoot: "/tmp",
      requestedBy: "test",
    });

    __jait_capture(0, (result.ok));
    const data = result.data as Record<string, string>;
    // Should NOT expose JWT_SECRET or similar
    __jait_captureType(1, (data["JWT_SECRET"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_397_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const res = await app.inject({ headers, method: "GET", url: "/api/terminals" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { terminals: unknown[] };
    __jait_capture(1, (body.terminals));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_404_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const res = await app.inject({ headers, method: "GET", url: "/api/tools" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { tools: { name: string; description: string }[] };
    __jait_capture(1, (body.tools.length));
    __jait_capture(2, (body.tools.map((t) => t.name)));
    __jait_capture(3, (body.tools.map((t) => t.name)));
    __jait_capture(4, (body.tools.map((t) => t.name)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_414_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const res = await app.inject({ headers, method: "GET", url: "/api/surfaces" });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { surfaces: unknown[]; registeredTypes: string[] };
    __jait_capture(1, (body.surfaces));
    __jait_capture(2, (body.registeredTypes));
    __jait_capture(3, (body.registeredTypes));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_423_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const res = await app.inject({ headers,
      method: "POST",
      url: "/api/tools/execute",
      payload: { tool: "surfaces.list", input: {}, sessionId: "s1" },
    });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { ok: boolean; data: { surfaces: unknown[]; registeredTypes: string[] } };
    __jait_capture(1, (body.ok));
    __jait_capture(2, (body.data.registeredTypes));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_435_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const res = await app.inject({ headers,
      method: "POST",
      url: "/api/tools/execute",
      payload: { tool: "nope", input: {} },
    });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { ok: boolean; message: string };
    __jait_capture(1, (body.ok));
    __jait_capture(2, (body.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_447_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const res = await app.inject({ headers,
      method: "POST",
      url: "/api/tools/execute",
      payload: { tool: "os.query", input: { query: "info" }, sessionId: "s1" },
    });
    __jait_capture(0, (res.statusCode));
    const body = res.json() as { ok: boolean; data: Record<string, unknown> };
    __jait_capture(1, (body.ok));
    __jait_captureType(2, (body.data.platform));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_sprint3_test_ts_459_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let headers: { authorization: string };
let surfaceRegistry: SurfaceRegistry;
let toolRegistry: ReturnType<typeof createToolRegistry>;
const __jait_hook_12316 = async () => {
    headers = { authorization: "Bearer " + await signAuthToken({ id: "test-owner", username: "owner" }, loadConfig().jwtSecret) };
    const audit = {
      write: () => "audit-test-id",
      hasAction: () => false,
      getBySession: () => [],
      getAll: () => [],
    };
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());
    surfaceRegistry.register(new FileSystemSurfaceFactory());
    toolRegistry = createToolRegistry(surfaceRegistry);

    const config = { ...loadConfig(), logLevel: "silent" };
    app = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: audit as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
    });
  };
await __jait_hook_12316();
try {
await (async()=>{

    const ws = {
      registerGatewayFsNode: vi.fn(),
      getFsNodes: vi.fn(() => []),
      proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote output", data: { node: "node-1" } })),
    };
    const config = { ...loadConfig(), logLevel: "silent" };
    const remoteApp = await createServer(config, {
      sessionService: { getById: (_id: string, userId: string) => userId === "test-owner" ? { userId } : null } as any,
      audit: {
        write: () => "audit-test-id",
        hasAction: () => false,
        getBySession: () => [],
        getAll: () => [],
      } as unknown as import("./services/audit.js").AuditWriter,
      surfaceRegistry,
      toolRegistry,
      ws: ws as unknown as import("./ws.js").WsControlPlane,
    });

    const res = await remoteApp.inject({ headers,
      method: "POST",
      url: "/api/tools/execute",
      payload: {
        tool: "terminal.run",
        input: { command: "docker ps --format '{{.Image}}'" },
        sessionId: "s1",
        projectRoot: "/repo",
        nodeId: "node-1",
      },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (ws.proxyToolOp.mock.calls));
    __jait_capture(2, (res.json()));
  
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
