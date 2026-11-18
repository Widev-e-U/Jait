// Translated fixture from packages/gateway/src/services/project-search.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ProjectSearchUnavailableError,
  normalizeProjectSearchLimit,
  projectSearchCandidateLimit,
  rankProjectFilePaths,
  searchProject,
} from "../../../../packages/gateway/src/services/project-search.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/project-search.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_project_search_test_ts_36_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    for (let index = 0; index < 30; index += 1) {
      await writeProjectFile(root, `decoy-${String(index).padStart(2, "0")}.ts`, "targetHelper();\n");
    }
    await writeProjectFile(
      root,
      "src/late-definition.ts",
      "export function targetHelper() { return true; }\n",
    );

    const result = await searchProject({
      root,
      query: "targetHelper",
      mode: "content",
      limit: 1,
    });

    __jait_capture(0, (result.mode));
    if (result.mode !== "content") throw new Error("unexpected mode");
    __jait_capture(1, (result.matches[0]?.relativePath));
    __jait_capture(2, (result.limited));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_60_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    for (let index = 0; index < 30; index += 1) {
      await writeProjectFile(
        root,
        `a/search-service-helper-${String(index).padStart(2, "0")}.ts`,
        "export {};\n",
      );
    }
    await writeProjectFile(root, "z/search-service.ts", "export {};\n");

    const result = await searchProject({
      root,
      query: "search-service",
      mode: "files",
      limit: 1,
    });

    __jait_capture(0, (result.mode));
    if (result.mode !== "files") throw new Error("unexpected mode");
    __jait_capture(1, (result.files[0]?.relativePath));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_83_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ranked = rankProjectFilePaths(
      ["dist/parser.js", "tests/parser.test.ts", "src/parser.ts"],
      "parser",
      3,
    );

    __jait_capture(0, (ranked.map((entry) => entry.relativePath)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_97_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject("needle-root-");
    await writeProjectFile(root, "alpha.ts", "export {};\n");

    const result = await searchProject({
      root,
      query: "needle-root",
      mode: "files",
      limit: 10,
    });

    __jait_capture(0, (result.mode));
    if (result.mode !== "files") throw new Error("unexpected mode");
    __jait_capture(1, (result.files));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_113_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ranked = rankProjectFilePaths(
      ["src/zeta-parser.ts", "src/alpha-parser.ts"],
      "parser",
      2,
    );

    __jait_capture(0, (ranked.map((entry) => entry.relativePath)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_126_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    await writeProjectFile(root, ".gitignore", "node_modules/\n");
    await writeProjectFile(root, "node_modules/hidden-package.ts", "export {};\n");

    const excluded = await searchProject({
      root,
      query: "hidden-package",
      mode: "files",
      limit: 10,
    });
    const included = await searchProject({
      root,
      query: "hidden-package",
      mode: "files",
      limit: 10,
      includeIgnoredFiles: true,
    });

    __jait_capture(0, (excluded.mode));
    __jait_capture(1, (included.mode));
    if (excluded.mode !== "files" || included.mode !== "files") throw new Error("unexpected mode");
    __jait_capture(2, (excluded.files));
    __jait_capture(3, (included.files.map((entry) => entry.relativePath)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_154_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    const target = 'const value = "${VAR};$(touch impossible)"';
    await writeProjectFile(root, "literal.ts", `${target}\n`);

    const result = await searchProject({
      root,
      query: "${VAR};$(touch impossible)",
      mode: "content",
      limit: 10,
    });

    __jait_capture(0, (result.mode));
    if (result.mode !== "content") throw new Error("unexpected mode");
    __jait_capture(1, (result.matches));
    __jait_capture(2, (result.matches[0]?.content), (target));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_174_3_each0": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const value = 0;

try {
await (async()=>{

      __jait_thrown(0, () => normalizeProjectSearchLimit(value));
    
})();

} finally {
await __jait_hook_458();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_174_3_each1": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const value = -1;

try {
await (async()=>{

      __jait_thrown(0, () => normalizeProjectSearchLimit(value));
    
})();

} finally {
await __jait_hook_458();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_174_3_each2": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const value = 1.5;

try {
await (async()=>{

      __jait_thrown(0, () => normalizeProjectSearchLimit(value));
    
})();

} finally {
await __jait_hook_458();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_174_3_each3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const value = Number.NaN;

try {
await (async()=>{

      __jait_thrown(0, () => normalizeProjectSearchLimit(value));
    
})();

} finally {
await __jait_hook_458();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_174_3_each4": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const value = Number.POSITIVE_INFINITY;

try {
await (async()=>{

      __jait_thrown(0, () => normalizeProjectSearchLimit(value));
    
})();

} finally {
await __jait_hook_458();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_183_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeProjectSearchLimit(10_000)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_187_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (projectSearchCandidateLimit(20)));
    __jait_capture(1, (projectSearchCandidateLimit(200)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_194_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    await writeProjectFile(root, "safe.ts", "aaaa!\n");

    await __jait_captureRejected(0, (searchProject(
        {
          root,
          query: "(a+)+$",
          mode: "content",
          isRegexp: true,
        },
        { rgCommand: "jait-missing-rg" },
      )));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_213_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    await writeProjectFile(root, ".gitignore", "secret/\n");
    await writeProjectFile(root, "visible/needle.ts", "needle\n");
    await writeProjectFile(root, "secret/needle.ts", "needle\n");

    const result = await searchProject(
      { root, query: "needle", mode: "content" },
      { rgCommand: "jait-missing-rg" },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    __jait_capture(0, (result.matches.map((match) => match.relativePath)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_229_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The old behaviour threw "safe_fallback_unavailable" here, which named a
    // machine-level problem the model could not fix or route around — so it
    // retried the identical call instead. Enumeration is now native, so the
    // search simply works, with the same privacy guarantee Git provided.
    const looseRoot = await mkdtemp(join(__jait_fixture_dir, "jait-project-search-loose-"));
    tempDirectories.push(looseRoot);
    await writeProjectFile(looseRoot, ".gitignore", "secret/\nbuild/*.js\n");
    await writeProjectFile(looseRoot, "needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "nested/deep/needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "secret/needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "build/needle.js", "needle\n");

    const result = await searchProject(
      { root: looseRoot, query: "needle", mode: "content" },
      { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    __jait_capture(0, (result.matches.map((match) => match.relativePath).sort()));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_253_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const looseRoot = await mkdtemp(join(__jait_fixture_dir, "jait-project-search-nested-"));
    tempDirectories.push(looseRoot);
    await writeProjectFile(looseRoot, ".gitignore", "*.gen.ts\n");
    await writeProjectFile(looseRoot, "pkg/.gitignore", "!keep.gen.ts\ntmp/\n");
    await writeProjectFile(looseRoot, "top.gen.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/keep.gen.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/drop.gen.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/tmp/needle.ts", "needle\n");
    await writeProjectFile(looseRoot, "pkg/src/needle.ts", "needle\n");

    const result = await searchProject(
      { root: looseRoot, query: "needle", mode: "content" },
      { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
    );
    if (result.mode !== "content") throw new Error("unexpected mode");
    __jait_capture(0, (result.matches.map((match) => match.relativePath).sort()));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_275_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const looseRoot = await mkdtemp(join(__jait_fixture_dir, "jait-project-search-files-"));
    tempDirectories.push(looseRoot);
    await writeProjectFile(looseRoot, ".gitignore", "node_modules/\n");
    await writeProjectFile(looseRoot, "src/widget-view.ts", "x\n");
    await writeProjectFile(looseRoot, "node_modules/widget-view.ts", "x\n");

    const result = await searchProject(
      { root: looseRoot, query: "widget-view", mode: "files" },
      { rgCommand: "jait-missing-rg", gitCommand: "jait-missing-git" },
    );
    if (result.mode !== "files") throw new Error("unexpected mode");
    __jait_capture(0, (result.files.map((file) => file.relativePath)));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_292_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();

    await __jait_rejected(0, searchProject({ root: join(root, "not-here"), query: "anything" }, { rgCommand: "jait-missing-rg" }));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_300_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    await writeProjectFile(root, "pkg.json", '{"name":"x"}\n');

    // spawn() throws ENOTDIR synchronously for a file cwd, and reports a missing
    // directory as ENOENT — indistinguishable from a missing binary.
    await __jait_rejected(0, searchProject({ root: join(root, "pkg.json"), query: "name" }, { rgCommand: "jait-missing-rg" }));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_project_search_test_ts_311_3": {


const tempDirectories: string[] = [];
async function createProject(prefix = "jait-project-search-"): Promise<string> {
  const root = await mkdtemp(join(__jait_fixture_dir, prefix));
  tempDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
async function writeProjectFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}
const __jait_hook_458 = async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await createProject();
    await writeProjectFile(root, "src/app.ts", "const measurementsCache = 1;\n");

    const result = await searchProject(
      { root, query: "measurementsCache", mode: "content", limit: 5 },
      { rgCommand: "jait-missing-rg" },
    );

    if (result.mode !== "content") throw new Error("expected content mode");
    __jait_capture(0, (result.matches));
    __jait_capture(1, (result.matches[0]?.file.endsWith("src/app.ts")));
  
})();

} finally {
await __jait_hook_458();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
