// Translated fixture from packages/gateway/src/tools/core/search.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSearchTool } from "../../../../packages/gateway/src/tools/core/search.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/core/search.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_64_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("sample.txt", "sumPositive\n");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });
    const result = await tool.execute({ pattern: "sumPositive|other", isRegexp: true }, searchContext("regex", projectRoot));
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
    __jait_capture(2, (result.message));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_73_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("sample.txt", "foo\n");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    const result = await tool.execute(
      { pattern: "fo+", isRegexp: false, limit: 5 },
      {
        sessionId: "session-1",
        actionId: "action-1",
        projectRoot,
        requestedBy: "user",
      } as any,
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.data));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_95_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("sample.txt", "literal[1]\n");
    const rgCommand = await createFakeRg(projectRoot);
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand });

    const result = await tool.execute(
      { pattern: "literal[1]", isRegexp: true, limit: 5 },
      {
        sessionId: "session-2",
        actionId: "action-2",
        projectRoot,
        requestedBy: "user",
      } as any,
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.data), ({
      pattern: "literal[1]",
      matches: [
        {
          file: join(projectRoot, "sample.txt"),
          line: 1,
          content: "literal[1]",
        },
      ],
    }));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_124_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const longLine = "needle-" + "x".repeat(100_000);
    const projectRoot = await createTempProject("bundle.js", `${longLine}\n`);
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "needle", isRegexp: false, limit: 5 },
      {
        sessionId: "session-3",
        actionId: "action-3",
        projectRoot,
        requestedBy: "user",
      } as any,
    );

    __jait_capture(0, (result.ok));
    const matches = (result.data as any).matches;
    __jait_capture(1, (matches));
    __jait_capture(2, (matches[0].content));
    __jait_capture(3, (matches[0].content));
    // A truncated match must never be anywhere near 100k chars.
    __jait_capture(4, (matches[0].content.length));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_153_3_each0": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const _label = "a shell variable reference";
const targetLine = 'const total = "${SUM}" // running total';
const pattern = "${SUM}";

try {
await (async()=>{

    // The surrounding lines are what make this a real check: a pattern the
    // shell mangled into an empty string matches *every* line, not just one.
    const projectRoot = await createTempProject(
      "sample.ts",
      ["const alpha = 1", targetLine, "const beta = 2", "const gamma = 3"].join("\n") + "\n",
    );
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern, isRegexp: false, limit: 5 },
      searchContext("session-shell-safety", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).matches));
    __jait_capture(2, ((result.data as any).matches[0].content));
  
})();

} finally {
await __jait_hook_324();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_153_3_each1": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const _label = "a backtick expression";
const targetLine = "const label = `id-${row}`";
const pattern = "`id-${row}`";

try {
await (async()=>{

    // The surrounding lines are what make this a real check: a pattern the
    // shell mangled into an empty string matches *every* line, not just one.
    const projectRoot = await createTempProject(
      "sample.ts",
      ["const alpha = 1", targetLine, "const beta = 2", "const gamma = 3"].join("\n") + "\n",
    );
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern, isRegexp: false, limit: 5 },
      searchContext("session-shell-safety", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).matches));
    __jait_capture(2, ((result.data as any).matches[0].content));
  
})();

} finally {
await __jait_hook_324();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_153_3_each2": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const _label = "a backslash escape";
const targetLine = "const re = /\\d+\\.\\d+/";
const pattern = "\\d+\\.\\d+";

try {
await (async()=>{

    // The surrounding lines are what make this a real check: a pattern the
    // shell mangled into an empty string matches *every* line, not just one.
    const projectRoot = await createTempProject(
      "sample.ts",
      ["const alpha = 1", targetLine, "const beta = 2", "const gamma = 3"].join("\n") + "\n",
    );
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern, isRegexp: false, limit: 5 },
      searchContext("session-shell-safety", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).matches));
    __jait_capture(2, ((result.data as any).matches[0].content));
  
})();

} finally {
await __jait_hook_324();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_178_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject(
      "many.txt",
      Array.from({ length: 200 }, (_, i) => `needle line ${i}`).join("\n") + "\n",
    );
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "needle", isRegexp: false, limit: 5 },
      searchContext("session-limit", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).matches));
    __jait_capture(2, (result.message));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_197_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("provider-model-selector.tsx", "export {}\n");
    await writeFile(join(projectRoot, "unrelated.md"), "docs\n", "utf8");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "model-selector", mode: "files", limit: 5 },
      searchContext("session-files", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).files), ([join(projectRoot, "provider-model-selector.tsx")]));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_211_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("sample.txt", "content\n");
    const tool = createSearchTool(createRegistryStub() as any);

    const result = await tool.execute(
      { pattern: "nothing-here", mode: "files", limit: 5 },
      searchContext("session-files-empty", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).files));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_226_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("placeholder.txt", "x\n");
    await mkdir(join(projectRoot, "apps", "web", "src"), { recursive: true });
    await writeFile(join(projectRoot, "apps", "web", "src", "app.ts"), "const needle = 1;\n", "utf8");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    // process.cwd() is the monorepo root here, where "apps/web/src" also exists —
    // so a wrong base would still "work". Assert on the match instead.
    const result = await tool.execute(
      { pattern: "needle", path: "apps/web/src", limit: 5 },
      searchContext("session-relative", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).matches));
    __jait_capture(2, ((result.data as any).matches[0].file.endsWith("app.ts")));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_244_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("package.json", '{"react-virtual":"1"}\n');
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    const result = await tool.execute(
      { pattern: "react-virtual", path: "package.json", limit: 5 },
      searchContext("session-file-path", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).matches));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_257_3": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const projectRoot = await createTempProject("sample.txt", "foo\n");
    const tool = createSearchTool(createRegistryStub() as any, { rgCommand: "jait-missing-rg" });

    const result = await tool.execute(
      { pattern: "foo", path: "does/not/exist", limit: 5 },
      searchContext("session-missing-path", projectRoot),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.message));
  
})();

} finally {
await __jait_hook_324();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_core_search_test_ts_272_1": {


const tempDirs: string[] = [];
async function createTempProject(fileName: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(__jait_fixture_dir, "jait-search-test-"));
  tempDirs.push(dir);
  execFileSync("git", ["init", "--quiet"], { cwd: dir });
  await writeFile(join(dir, fileName), content, "utf8");
  return dir;
}
async function createFakeRg(dir: string): Promise<string> {
  const rgPath = join(dir, "rg");
  await writeFile(
    rgPath,
    [
      "#!/bin/sh",
      'case " $* " in',
      '  *" --fixed-strings "*) printf \'%s\\n\' "sample.txt:1:literal[1]" ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return rgPath;
}
function searchContext(sessionId: string, projectRoot: string) {
  return { sessionId, actionId: `${sessionId}-action`, projectRoot, requestedBy: "user" } as any;
}
function createRegistryStub() {
  return {
    getBySession() {
      return [];
    },
  };
}
const __jait_hook_324 = async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
};

try {
await (async()=>{

  const root = await createTempProject("active.json", "{}");
  await mkdir(join(root, "config")); await writeFile(join(root, "config/service.json"), "{}");
  await writeFile(join(root, "notes.txt"), "{}");
  // Use a bounded test executable so this case also runs without system rg.
  const rgPath = join(root, "filename-rg.cjs");
  await writeFile(rgPath, [
    `#!${process.execPath}`,
    'const fs = require("node:fs");',
    'const args = process.argv.slice(2);',
    'if (args[0] === "--files") {',
    '  process.stdout.write("active.json\\nconfig/service.json\\nother.json\\nnotes.txt\\n");',
    '} else {',
    '  const pattern = args[args.indexOf("--") + 1];',
    '  const matches = fs.readFileSync(0, "utf8").split("\\n").filter(line => new RegExp(pattern, "i").test(line));',
    '  process.stdout.write(matches.join("\\n") + "\\n");',
    '}',
    '',
  ].join("\n"), { mode: 0o755 });
  const tool = createSearchTool(createRegistryStub() as any, { rgCommand: rgPath });
  const result = await tool.execute({ pattern: "service|active", isRegexp: true, mode: "files", include: "*.json" }, searchContext("file-regex", root));
  __jait_capture(0, (result.ok));
  __jait_capture(1, ((result.data as any).files.sort()), ([join(root, "active.json"), join(root, "config/service.json")].sort()));

})();

} finally {
await __jait_hook_324();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
