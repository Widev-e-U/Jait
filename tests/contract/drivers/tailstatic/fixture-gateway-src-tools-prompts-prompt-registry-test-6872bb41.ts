// Translated fixture from packages/gateway/src/tools/prompts/prompt-registry.test.ts; expected literals are in tail_static.rs.



import { buildSystemPrompt } from "../../../../packages/gateway/src/tools/prompts/prompt-registry.js";
import "../../../../packages/gateway/src/tools/prompts/index.js";
import type { Skill } from "../../../../packages/gateway/src/skills/index.js";
import { JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE, PROJECT_ARTIFACT_INSTRUCTIONS, LIVE_BROWSER_UPDATE_INSTRUCTIONS } from "../../../../packages/gateway/src/tools/prompts/shared-sections.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/prompts/prompt-registry.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_11_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE), (PROJECT_ARTIFACT_INSTRUCTIONS));
    __jait_capture(1, (JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE), (LIVE_BROWSER_UPDATE_INSTRUCTIONS));
    __jait_capture(2, (LIVE_BROWSER_UPDATE_INSTRUCTIONS));
    __jait_capture(3, (LIVE_BROWSER_UPDATE_INSTRUCTIONS));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_18_3_each0": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const endpoint = { model: "gpt-4o", baseUrl: "https://api.openai.com/v1" };

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", endpoint, { projectRoot: "/work/project" });
    __jait_capture(0, (prompt), (LIVE_BROWSER_UPDATE_INSTRUCTIONS));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
    __jait_capture(6, (prompt));
    __jait_capture(7, (prompt));
    __jait_capture(8, (prompt));
    __jait_capture(9, (prompt));
    __jait_capture(10, (prompt));
    __jait_capture(11, (prompt));
    __jait_capture(12, (prompt));
    __jait_capture(13, (prompt));
    __jait_capture(14, (prompt));
    __jait_capture(15, (prompt));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_18_3_each1": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const endpoint = { model: "glm-4.7", baseUrl: "https://openrouter.ai/api/v1", backend: "openrouter" };

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", endpoint, { projectRoot: "/work/project" });
    __jait_capture(0, (prompt), (LIVE_BROWSER_UPDATE_INSTRUCTIONS));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
    __jait_capture(6, (prompt));
    __jait_capture(7, (prompt));
    __jait_capture(8, (prompt));
    __jait_capture(9, (prompt));
    __jait_capture(10, (prompt));
    __jait_capture(11, (prompt));
    __jait_capture(12, (prompt));
    __jait_capture(13, (prompt));
    __jait_capture(14, (prompt));
    __jait_capture(15, (prompt));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_18_3_each2": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const endpoint = { model: "llama3.2", baseUrl: "http://localhost:11434/v1", backend: "ollama" };

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", endpoint, { projectRoot: "/work/project" });
    __jait_capture(0, (prompt), (LIVE_BROWSER_UPDATE_INSTRUCTIONS));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
    __jait_capture(6, (prompt));
    __jait_capture(7, (prompt));
    __jait_capture(8, (prompt));
    __jait_capture(9, (prompt));
    __jait_capture(10, (prompt));
    __jait_capture(11, (prompt));
    __jait_capture(12, (prompt));
    __jait_capture(13, (prompt));
    __jait_capture(14, (prompt));
    __jait_capture(15, (prompt));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_42_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
    __jait_capture(6, (prompt));
    __jait_capture(7, (prompt));
    __jait_capture(8, (prompt));
    __jait_capture(9, (prompt));
    __jait_capture(10, (prompt));
    __jait_capture(11, (prompt));
    __jait_capture(12, (prompt));
    __jait_capture(13, (prompt));
    __jait_capture(14, (prompt));
    __jait_capture(15, (prompt));
    __jait_capture(16, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_69_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    // What ProjectService.resolveInstructionChain produces for a project
    // filed under Private > OSS.
    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
      projectInstructions: "## Private\ncasual tone\n\n## OSS\nanswer in english",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt.indexOf("casual tone")), (prompt.indexOf("answer in english")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_86_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
      projectInstructions: "## Private\ncasual tone",
    });

    const globalIndex = prompt.indexOf("<globalJaitInstructions>");
    if (globalIndex >= 0) {
      __jait_capture(0, (globalIndex), (prompt.indexOf("<projectInstructions>")));
    }
  
})();
__jait_record({slot:1,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_101_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
    });

    __jait_capture(0, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_112_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    // The block sits outside the local-model compaction branch on purpose:
    // the user typed these instructions and would notice their absence.
    const prompt = buildSystemPrompt("agent", {
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      backend: "ollama",
    }, {
      projectRoot: "/tmp/project",
      projectInstructions: "## Private\ncasual tone",
    });

    __jait_capture(0, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_127_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      backend: "ollama",
    }, {
      projectRoot: "/tmp/project",
      backend: "ollama",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_146_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_157_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const skills: Skill[] = [
      {
        id: "word-docx",
        name: "Word / DOCX",
        description: "Handle DOCX files without formatting drift.",
        filePath: "C:/skills/word-docx/SKILL.md",
        source: "user",
        enabled: true,
      },
    ];

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
      skills,
    });

    // Discovery-first contract: enabled skills contribute the lazy
    // <skillDiscovery> instruction, never an eager catalog with names,
    // descriptions and file paths (that was ~19k chars of per-request overhead).
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    __jait_capture(5, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_188_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      responseStyle: "caveman",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_201_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const originalSoulPath = process.env["JAIT_SOUL_PATH"];
    const originalGlobalPath = process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"];
    const dir = mkdtempSync(join(__jait_fixture_dir, "jait-soul-"));
    const soulPath = join(dir, "SOUL.md");
    writeFileSync(soulPath, "Always use chat.traces before memory.search for Jait chat IDs.");

    try {
      process.env["JAIT_SOUL_PATH"] = soulPath;
      delete process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"];

      const prompt = buildSystemPrompt("agent", {
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
      });

      __jait_capture(0, (prompt));
      __jait_capture(1, (prompt));
    } finally {
      if (originalSoulPath === undefined) delete process.env["JAIT_SOUL_PATH"];
      else process.env["JAIT_SOUL_PATH"] = originalSoulPath;

      if (originalGlobalPath === undefined) delete process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"];
      else process.env["JAIT_GLOBAL_INSTRUCTIONS_PATH"] = originalGlobalPath;

      rmSync(dir, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_230_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      architectureGraph: "graph TD\nA-->B",
    });
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));

    const clipped = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      architectureGraph: "graph TD\nA" + "x".repeat(5000),
    });
    __jait_capture(2, (clipped));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_249_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      projectRoot: "/tmp/project",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_261_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "zhipu/glm-4.6",
      baseUrl: "https://openrouter.ai/api/v1",
    }, {
      projectRoot: "/tmp/project",
    });

    // GLM runs natively inside Jait's agent loop (Jait tools registered
    // directly) — it is NOT an external CLI provider, so it must NOT get the
    // <jaitExternalProvider> steering block.
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    // It still gets identity + safety (internal provider keeps the wrapper shell).
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
    // Core instructions + keep-going contract
    __jait_capture(5, (prompt));
    __jait_capture(6, (prompt));
    // Explicit tool-call format discipline (GLM-specific block)
    __jait_capture(7, (prompt));
    __jait_capture(8, (prompt));
    // Shared sections — including the tools.search discovery mechanism so the
    // model can find the search tool and other Jait tools.
    __jait_capture(9, (prompt));
    __jait_capture(10, (prompt));
    __jait_capture(11, (prompt));
    __jait_capture(12, (prompt));
    __jait_capture(13, (prompt));
    __jait_capture(14, (prompt));
    // Project context injection
    __jait_capture(15, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_297_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "zhipu/glm-4.6",
      baseUrl: "https://openrouter.ai/api/v1",
    });

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_prompts_prompt_registry_test_ts_307_3": {

const { mkdtempSync, rmSync, writeFileSync } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fs", __jait_original_dir):__jait_require.resolve("fs")));
const { tmpdir } = await import((typeof Bun!=="undefined"?Bun.resolveSync("os", __jait_original_dir):__jait_require.resolve("os")));
const { join } = await import((typeof Bun!=="undefined"?Bun.resolveSync("path", __jait_original_dir):__jait_require.resolve("path")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildSystemPrompt("agent", {
      model: "glm-4.5",
      baseUrl: "https://open.bigmodel.cn/api/v1",
    });

    // Same internal-provider treatment: tool-rich prompt, no external block.
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
  
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
