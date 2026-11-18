// Translated fixture from packages/gateway/src/tools/link-tools.test.ts; expected literals are in tail_static.rs.
import { mcpContentForToolResult } from "../../../../packages/gateway/src/routes/mcp-server.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createJaitCatalogTool } from "../../../../packages/gateway/src/tools/catalog-tools.js";
import { jaitLinkTool } from "../../../../packages/gateway/src/tools/link-tools.js";
import { ASK_MODE_TOOLS, SWARM_ORCHESTRATION_TOOLS } from "../../../../packages/gateway/src/tools/chat-modes.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/link-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_12_3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (await jaitLinkTool.execute({ href: "/agents", label: "  View the updated team  " }, context)));
    __jait_capture(1, (jaitLinkTool.defaultConsentLevel));
    __jait_capture(2, (ASK_MODE_TOOLS.has("jait.link")));
    __jait_capture(3, (SWARM_ORCHESTRATION_TOOLS.has("jait.link")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_20_3_each0": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/jobs";

try {
await (async()=>{

    const result = await jaitLinkTool.execute({ href, label: "View changes" }, context);
    __jait_capture(0, (result.data), ({ href }));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_20_3_each1": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/network";

try {
await (async()=>{

    const result = await jaitLinkTool.execute({ href, label: "View changes" }, context);
    __jait_capture(0, (result.data), ({ href }));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_20_3_each2": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/settings";

try {
await (async()=>{

    const result = await jaitLinkTool.execute({ href, label: "View changes" }, context);
    __jait_capture(0, (result.data), ({ href }));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_20_3_each3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/chat?sessionId=abc%26def";

try {
await (async()=>{

    const result = await jaitLinkTool.execute({ href, label: "View changes" }, context);
    __jait_capture(0, (result.data), ({ href }));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_20_3_each4": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/threads?threadId=thread-1";

try {
await (async()=>{

    const result = await jaitLinkTool.execute({ href, label: "View changes" }, context);
    __jait_capture(0, (result.data), ({ href }));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each0": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/emails";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each1": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/email";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each2": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/settings";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/todo";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each4": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/messenger";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each5": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/chat";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_24_3_each6": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const path = "/";

try {
await (async()=>{

    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    __jait_capture(0, (result.ok));
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    __jait_capture(1, (url.searchParams.getAll("q")), ([search]));
    __jait_capture(2, (url.hash));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_32_3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await jaitLinkTool.execute({ href: "/settings?tab=tools&toolsQ=file&q=old", label: "Tools", search: "" }, context);
    __jait_capture(0, (result.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_36_3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href: "/jobs", label: "Jobs", search: "test" }, context)).ok));
    __jait_capture(1, ((await jaitLinkTool.execute({ href: "/emails", label: "Mail", search: "a".repeat(4096) }, context)).ok));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_40_3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register(jaitLinkTool);
    const result = await createJaitCatalogTool(registry).execute({ pageId: "settings" }, context);
    __jait_capture(0, (result.data));
    __jait_capture(1, (registry.listForMcp().find(tool => tool.name === "jait.link")?.parameters));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each0": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "https://evil.test";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each1": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "//evil.test/agents";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each2": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "javascript:alert(1)";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/api/auth";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each4": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/agents#unsupported";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each5": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/\\evil.test";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_47_3_each6": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const href = "/agents\n";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_50_3_each0": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const label = "";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href: "/agents", label }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_50_3_each1": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const label = "  ";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href: "/agents", label }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_50_3_each2": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const label = "x".repeat(161);

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href: "/agents", label }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_50_3_each3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const label = "label\ncontrol";

try {
await (async()=>{

    __jait_capture(0, ((await jaitLinkTool.execute({ href: "/agents", label }, context)).ok));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_link_tools_test_ts_53_3": {


const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register(jaitLinkTool);
    __jait_capture(0, (registry.listForMcp().map(tool => tool.name)));
    __jait_capture(1, (registry.search("render link")[0].name));
    const catalog = await createJaitCatalogTool(registry).execute({ pageId: "chat" }, context);
    __jait_capture(2, ((catalog.data as { matches: { name: string }[] }).matches.map(tool => tool.name)));
    const result = await jaitLinkTool.execute({ href: "/agents", label: "View team" }, context);
    const text = (mcpContentForToolResult(result)[0] as { text: string }).text;
    __jait_capture(3, (JSON.parse(text.slice(text.indexOf("{")))));
  
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
