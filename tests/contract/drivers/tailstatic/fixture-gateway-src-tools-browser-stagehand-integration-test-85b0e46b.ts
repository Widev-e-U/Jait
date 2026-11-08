// Translated fixture from packages/gateway/src/tools/browser-stagehand.integration.test.ts; expected literals are in tail_static.rs.
import { createServer } from "node:http";
import { resolve } from "node:path";
import { BrowserSurface } from "../../../../packages/gateway/src/surfaces/browser.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { StagehandBrowserIntelligence, type BrowserModel } from "../../../../packages/gateway/src/services/browser-intelligence.js";
import { BrowserWorkflowService } from "../../../../packages/gateway/src/services/browser-workflows.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ConsentAwareExecutor } from "../../../../packages/gateway/src/security/consent-executor.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import { TrustEngine } from "../../../../packages/gateway/src/security/trust-engine.js";
import type { ToolPermission } from "../../../../packages/gateway/src/security/tool-permissions.js";
import { createBrowserOpenTool, createBrowserInteractionTools, createBrowserIntelligenceTools } from "../../../../packages/gateway/src/tools/browser-tools.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import type { BrowserWorkflowStep } from "@jait/shared";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/browser-stagehand.integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_browser_stagehand_integration_test_ts_122_3": {


/*__jait_source_gate__ skipIf process.env["JAIT_STAGEHAND_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const projectRoot = resolve(__jait_original_dir, "../../../..");
const context = { sessionId: "stagehand-integration", actionId: "test", projectRoot, requestedBy: "test", userId: "test" };
const registry = new SurfaceRegistry();
const tools = new ToolRegistry();
let browser: BrowserSurface;
let url: string;
let service: BrowserWorkflowService;
let sqlite: { close(): void };
let inferenceCalls = 0;
const consent = new ConsentManager({ defaultTimeoutMs: 15_000 });
let submitted = 0;
const server = createServer((req, res) => {
    if (req.url === "/submitted") submitted++;
    res.setHeader("Content-Type", "text/html");
    res.end(`<!doctype html><title>Workflow fixture</title>
      <label>Asset <input id="asset"></label>
      <button onclick="document.querySelector('#result').textContent='Saved '+document.querySelector('#asset').value;fetch('/submitted')">Save asset</button>
      <output id="result">Ready</output>`);
  });
const model: BrowserModel = { generate: async params => {
    inferenceCalls++;
    const tree = JSON.stringify(params.messages);
    if (tree.includes("Read fixture result")) {
      if (!tree.includes("Ready")) throw new Error("The fixture output is missing from the real page tree");
      const properties = (params as { responseFormat?: { schema?: { properties?: Record<string, unknown> } } }).responseFormat?.schema?.properties ?? {};
      const structuredContent = "progress" in properties ? { progress: "All fixture data read", completed: true } : { result: "Ready" };
      return { outputFormat: "json_schema", role: "assistant", content: { type: "text", text: JSON.stringify(structuredContent) }, structuredContent };
    }
    const selectingInput = tree.includes("Find the Asset input");
    const pattern = selectingInput ? /\[([0-9]+-[0-9]+)\] textbox: Asset/ : /\[([0-9]+-[0-9]+)\] button: Save asset/;
    const id = tree.match(pattern)?.[1];
    if (!id) throw new Error("The SDK did not provide the expected real accessibility tree");
    const structuredContent = { elements: [{ elementId: id, description: selectingInput ? "Fill asset" : "Save asset",
      method: selectingInput ? "fill" : "click", arguments: selectingInput ? ["{{asset}}"] : [] }] };
    return { outputFormat: "json_schema", role: "assistant", content: { type: "text", text: JSON.stringify(structuredContent) }, structuredContent };
  } };
const __jait_hook_3694 = async () => {
    vi.stubEnv("BROWSER_LIVE_VIEW", "true");
    vi.stubEnv("BROWSER_RUNTIME", "node-bridge");
    await new Promise<void>(done => server.listen(0, "0.0.0.0", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture port");
    url = `http://127.0.0.1:${address.port}`;
    browser = new BrowserSurface("browser-stagehand-integration");
    registry.registerInstance(browser.id, browser);
    await browser.start(context);
    tools.register(createBrowserOpenTool(registry));
    for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    for (const tool of createBrowserIntelligenceTools(registry, undefined, new StagehandBrowserIntelligence(() => model))) tools.register(tool);
    const permissions = new Map<string, ToolPermission>();
    for (const name of ["browser.open", "browser.type", "browser.click", "browser.check", "browser.extract"]) {
      permissions.set(name, { toolName: name, consentLevel: name === "browser.click" ? "always" : "none", risk: "low", description: "Synthetic fixture permission" });
    }
    const executor = new ConsentAwareExecutor({ toolRegistry: tools, consentManager: consent, trustEngine: new TrustEngine(), permissions, sessionApprovals: new Set() });
    const database = await openDatabase(":memory:");
    sqlite = database.sqlite;
    migrateDatabase(database.sqlite);
    service = new BrowserWorkflowService(database.db, (name, input, ctx) => executor.execute(name, input, ctx));
  };
const __jait_hook_5262 = async () => {
    service?.stop();
    try { await browser?.stop(); } finally {
      sqlite?.close();
      await new Promise<void>(done => server.close(() => done()));
      vi.unstubAllEnvs();
    }
  };
await __jait_hook_3694();
try {
await (async()=>{

    await browser.navigate(url);
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let finish!: (value: { outputFormat: "json_schema"; role: "assistant"; content: { type: "text"; text: string }; structuredContent: unknown }) => void;
    const adapter = new StagehandBrowserIntelligence(() => ({ generate: async () => {
      entered();
      return new Promise(resolve => { finish = resolve; });
    } }));
    const controller = new AbortController();
    const pending = adapter.observe(browser, "Find the Save asset button", { ...context, signal: controller.signal });
    try {
      await started;
      await __jait_rejected(0, adapter.observe(browser, "Find", context));
      controller.abort();
      await __jait_rejected(1, pending);
      __jait_capture(2, (await browser.describe()));
    } finally {
      finish?.({ outputFormat: "json_schema", role: "assistant", content: { type: "text", text: '{"elements":[]}' }, structuredContent: { elements: [] } });
    }
    const recovered = new StagehandBrowserIntelligence(() => model);
    const observation = await recovered.observe(browser, "Find the Save asset button", context);
    __jait_capture(3, (observation));
  
})();

} finally {
await __jait_hook_5262();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
