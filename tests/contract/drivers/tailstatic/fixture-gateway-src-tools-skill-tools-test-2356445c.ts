// Translated fixture from packages/gateway/src/tools/skill-tools.test.ts; expected literals are in tail_static.rs.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillRegistry } from "../../../../packages/gateway/src/skills/index.js";
import { createSkillsManageTool, createExtensionsManageTool } from "../../../../packages/gateway/src/tools/skill-tools.js";
import type { PluginManager } from "../../../../packages/gateway/src/plugins/manager.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/skill-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_26_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const tool = createSkillsManageTool({ skillRegistry: registryWithOneSkill() });
    const res = await tool.execute({ action: "list" }, ctx);
    __jait_capture(0, (res.ok));
    __jait_capture(1, ((res.data as { skills: unknown[] }).skills));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_33_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reg = registryWithOneSkill();
    const tool = createSkillsManageTool({ skillRegistry: reg });
    const enabled = await tool.execute({ action: "enable", id: "deep-research" }, ctx);
    __jait_capture(0, (enabled.ok));
    __jait_capture(1, (reg.get("deep-research")?.enabled));
    await tool.execute({ action: "disable", id: "deep-research" }, ctx);
    __jait_capture(2, (reg.get("deep-research")?.enabled));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_43_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const tool = createSkillsManageTool({ skillRegistry: registryWithOneSkill() });
    const res = await tool.execute({ action: "enable", id: "nope" }, ctx);
    __jait_capture(0, (res.ok));
    __jait_capture(1, (res.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_50_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const tool = createSkillsManageTool({ skillRegistry: registryWithOneSkill() });
    const res = await tool.execute({ action: "search" }, ctx);
    __jait_capture(0, (res.ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_58_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fakeManager = {
      listInstalled: () => [
        { id: "openclaw:whatsapp", displayName: "whatsapp", version: "0.0.0", status: "installed" },
      ],
    } as unknown as PluginManager;
    const tool = createExtensionsManageTool({ pluginManager: fakeManager });
    const res = await tool.execute({ action: "list" }, ctx);
    __jait_capture(0, (res.ok));
    __jait_capture(1, ((res.data as { plugins: unknown[] }).plugins));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_70_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fakeManager = {
      enable: async () => ({ id: "x", displayName: "X", status: "error", error: "missing dep" }),
    } as unknown as PluginManager;
    const tool = createExtensionsManageTool({ pluginManager: fakeManager });
    const res = await tool.execute({ action: "enable", id: "x" }, ctx);
    __jait_capture(0, (res.ok));
    __jait_capture(1, (res.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_97_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{
let home: string;
let previousHome: string | undefined;
const __jait_hook_3313 = async () => {
    home = await mkdtemp(join(__jait_fixture_dir, "jait-skill-tool-"));
    previousHome = process.env["HOME"];
    process.env["HOME"] = home;
  };
const __jait_hook_3481 = async () => {
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    await rm(home, { recursive: true, force: true });
  };
await __jait_hook_3313();
try {
await (async()=>{

    const reg = new SkillRegistry();
    const tool = createSkillsManageTool({ skillRegistry: reg });

    const res = await tool.execute({
      action: "create",
      id: "weather-warnings",
      name: "Weather Warnings",
      description: "Use when monitoring Austrian weather warnings.",
      body: "Call the GeoSphere API and report the active warnings.",
    }, ctx);

    __jait_capture(0, (res.ok));
    __jait_capture(1, (res.message));
    __jait_capture(2, (reg.get("weather-warnings")?.enabled));
  
})();

} finally {
await __jait_hook_3481();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_114_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{
let home: string;
let previousHome: string | undefined;
const __jait_hook_3313 = async () => {
    home = await mkdtemp(join(__jait_fixture_dir, "jait-skill-tool-"));
    previousHome = process.env["HOME"];
    process.env["HOME"] = home;
  };
const __jait_hook_3481 = async () => {
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    await rm(home, { recursive: true, force: true });
  };
await __jait_hook_3313();
try {
await (async()=>{

    const reg = new SkillRegistry();
    const tool = createSkillsManageTool({ skillRegistry: reg });

    await tool.execute({
      action: "create",
      name: "Fire Department Instagram",
      description: "Use when drafting Instagram posts for the fire department.",
      body: "Write in German, present tense.",
    }, ctx);

    __jait_captureType(0, (reg.get("fire-department-instagram")));
  
})();

} finally {
await __jait_hook_3481();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_128_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{
let home: string;
let previousHome: string | undefined;
const __jait_hook_3313 = async () => {
    home = await mkdtemp(join(__jait_fixture_dir, "jait-skill-tool-"));
    previousHome = process.env["HOME"];
    process.env["HOME"] = home;
  };
const __jait_hook_3481 = async () => {
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    await rm(home, { recursive: true, force: true });
  };
await __jait_hook_3313();
try {
await (async()=>{

    const tool = createSkillsManageTool({ skillRegistry: new SkillRegistry() });

    __jait_capture(0, ((await tool.execute({ action: "create", name: "X", body: "b" }, ctx)).message));
    __jait_capture(1, ((await tool.execute({ action: "create", name: "X", description: "d" }, ctx)).message));
    __jait_capture(2, ((await tool.execute({ action: "create", description: "d", body: "b" }, ctx)).message));
  
})();

} finally {
await __jait_hook_3481();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_skill_tools_test_ts_139_3": {


const ctx = {} as ToolContext;
function registryWithOneSkill(): SkillRegistry {
  const reg = new SkillRegistry();
  reg.add({
    id: "deep-research",
    name: "Deep Research",
    description: "Compare options and synthesize findings.",
    filePath: "/skills/deep-research/SKILL.md",
    source: "user",
    enabled: false,
  });
  return reg;
}
/*__jait_scope_open__*/{
let home: string;
let previousHome: string | undefined;
const __jait_hook_3313 = async () => {
    home = await mkdtemp(join(__jait_fixture_dir, "jait-skill-tool-"));
    previousHome = process.env["HOME"];
    process.env["HOME"] = home;
  };
const __jait_hook_3481 = async () => {
    if (previousHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = previousHome;
    await rm(home, { recursive: true, force: true });
  };
await __jait_hook_3313();
try {
await (async()=>{

    const reg = new SkillRegistry();
    const tool = createSkillsManageTool({ skillRegistry: reg });
    const input = { action: "create" as const, id: "notes", name: "Notes", description: "d", body: "b" };
    await tool.execute(input, ctx);

    const second = await tool.execute(input, ctx);

    __jait_capture(0, (second.ok));
    __jait_capture(1, (second.message));
  
})();

} finally {
await __jait_hook_3481();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
