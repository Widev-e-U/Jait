// Translated fixture from packages/gateway/src/services/orchestration/workflow-tool-guard.test.ts; expected literals are in tail_static.rs.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileListTool, createFilePatchTool, createFileReadTool, createFileWriteTool } from "../../../../packages/gateway/src/tools/file-tools.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import {
  authorizeWorkflowToolCall,
  WORKFLOW_READ_TOOLS,
  WORKFLOW_WRITE_TOOLS,
  type WorkspaceMode,
} from "../../../../packages/gateway/src/services/orchestration/workflow-tool-guard.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/workflow-tool-guard.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_40_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.write", { path: "docs/new.md", content: "x" })));
    __jait_capture(1, (call("file.patch", { path: "docs/a.md", search: "a", replace: "b" })));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_45_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    const verdict = call("file.write", { path: "src/lib.ts", content: "x" });
    __jait_capture(0, (verdict.ok));
    __jait_capture(1, (verdict.ok === false && verdict.reason));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_51_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    const protectedClaims = { reads: [], writes: ["docs", "src"], protects: ["docs/a.md", "**/*.test.ts"] };
    const write = (path: string) => call("file.write", { path, content: "x" }, "write", protectedClaims);

    const protectedFile = write("docs/a.md");
    __jait_capture(0, (protectedFile.ok));
    __jait_capture(1, (protectedFile.ok === false && protectedFile.reason));
    __jait_capture(2, (call("file.patch", { path: "docs/a.md", search: "a", replace: "b" }, "write", protectedClaims).ok));
    __jait_capture(3, (write("src/deep/lib.test.ts").ok));

    // A new file next to a protected one is fine when it is not itself protected.
    __jait_capture(4, (write("docs/new.md")));
    __jait_capture(5, (write("src/lib.ts")));
    __jait_capture(6, (call("file.read", { path: "docs/a.md" }, "write", protectedClaims)));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_67_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.read", { path: "src/lib.ts" })));
    __jait_capture(1, (call("file.read", { path: "docs/a.md" })));
    __jait_capture(2, (call("file.read", { path: "other.md" }).ok));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_73_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("terminal.run", { command: "ls" }).ok));
    __jait_capture(1, (call("file.write", { path: "docs/x.md", content: "x" }, "read").ok));
    __jait_capture(2, (call("file.read", { path: "src/lib.ts" }, "read")));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_79_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.read", { path: "../outside/secret.txt" }).ok));
    __jait_capture(1, (call("file.read", { path: join(outside, "secret.txt") }).ok));
    __jait_capture(2, (call("file.write", { path: "/etc/hosts", content: "x" }).ok));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_85_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.write", { path: join(root, "docs", "abs.md"), content: "x" })));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_89_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    await symlink(outside, join(root, "docs", "escape"));
    __jait_capture(0, (call("file.write", { path: "docs/escape/pwned.md", content: "x" }).ok));
    __jait_capture(1, (call("file.read", { path: "docs/escape/secret.txt" }).ok));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_95_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.write", { path: "docsx/y.md", content: "x" }).ok));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_99_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.list", {}, "read", { reads: ["."], writes: [] })));
    __jait_capture(1, (call("file.list", {}, "read", { reads: ["src"], writes: [] }).ok));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_104_3": {


/*__jait_scope_open__*/{
let base: string;
let root: string;
let outside: string;
const claims = { reads: ["src"], writes: ["docs"] };
function call(tool: string, args: unknown, mode: WorkspaceMode = "write", declared = claims) {
    return authorizeWorkflowToolCall({ tool, args, mode, workspaceRoot: root, claims: declared });
  }
const __jait_hook_644 = async () => {
    base = await mkdtemp(join(__jait_fixture_dir, "jait-guard-"));
    root = join(base, "workspace");
    outside = join(base, "outside");
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, "docs", "a.md"), "a\n");
    await writeFile(join(root, "src", "lib.ts"), "export {};\n");
  };
const __jait_hook_1071 = async () => {
    await rm(base, { recursive: true, force: true });
  };
await __jait_hook_644();
try {
await (async()=>{

    __jait_capture(0, (call("file.read", { path: "src/\u0000lib.ts" }).ok));
    __jait_capture(1, (call("file.read", { path: 3 }).ok));
    __jait_capture(2, (call("file.read", "src/lib.ts").ok));
  
})();

} finally {
await __jait_hook_1071();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_workflow_tool_guard_test_ts_112_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    // The surface registry is only used when a tool runs, so building the definitions needs no real surfaces.
    const surfaces = {} as never;
    const registry = new ToolRegistry();
    for (const tool of [
      createFileReadTool(surfaces),
      createFileListTool(surfaces),
      createFileWriteTool(surfaces),
      createFilePatchTool(surfaces),
    ]) {
      registry.register(tool);
    }
    for (const name of [...WORKFLOW_READ_TOOLS, ...WORKFLOW_WRITE_TOOLS]) {
      __jait_capture(0, (registry.has(name)));
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
