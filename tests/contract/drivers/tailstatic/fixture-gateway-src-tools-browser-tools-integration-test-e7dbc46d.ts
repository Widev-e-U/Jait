// Translated fixture from packages/gateway/src/tools/browser-tools-integration.test.ts; expected literals are in tail_static.rs.
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BrowserSurface } from "../../../../packages/gateway/src/surfaces/browser.js";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createScreenshotCaptureTool } from "../../../../packages/gateway/src/tools/screenshot-tools.js";
import {
  createBrowserNavigateTool, createBrowserSnapshotTool, createBrowserInspectTool,
  createBrowserInteractionTools,
} from "../../../../packages/gateway/src/tools/browser-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/browser-tools-integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_82_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.navigate", { url }, context)), ([url]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_87_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      await surface.navigate(`${url}second`);
      __jait_capture(0, ((await surface.history("back")).url), (url));
      __jait_capture(1, ((await surface.history("forward")).url), (`${url}second`));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_92_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await tools.execute("browser.snapshot", {}, context);
      __jait_capture(0, (result));
      __jait_capture(1, ((result.data as { interactiveElements: unknown[] }).interactiveElements));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_97_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.inspect", { selector: "#save" }, context)));
      __jait_capture(1, (await tools.execute("browser.inspect", { selector: "#missing" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_105_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.click", { selector: "button:has-text('Save')" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_110_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, ((await tools.execute("browser.type", { selector: "#asset", text: "workstation-01" }, context)).ok));
      __jait_capture(1, (await tools.execute("browser.inspect", { selector: "#asset" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_116_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.select", { selector: "#status", value: "owned" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_121_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.inspect", { selector: "#footer" }, context)));
      __jait_capture(1, ((await tools.execute("browser.scroll", { x: 0, y: 10000 }, context)).ok));
      __jait_capture(2, (await tools.execute("browser.inspect", { selector: "#footer" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_126_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const found = await tools.execute("browser.wait", { selector: "#save", timeoutMs: 5000 }, context);
      __jait_capture(0, (found.ok));
      const missing = await tools.execute("browser.wait", { selector: "#missing", timeoutMs: 100 }, context);
      __jait_capture(1, (missing.ok));
      __jait_capture(2, (missing.message));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_133_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const path = join(directory, "standalone.png");
      const result = await createScreenshotCaptureTool().execute({ target: url, path, waitMs: 0 }, context);
      __jait_capture(0, (result.ok));
      __jait_capture(1, ([...(await readFile(path)).subarray(0, 8)]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_139_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await createScreenshotCaptureTool().execute({ target: url, waitMs: 0 }, { ...context, projectRoot: directory });
      __jait_capture(0, (result.ok));
      const data = result.data as { path: string; capturePath: string };
      artifacts.push(data.path);
      __jait_capture(1, (data.capturePath.startsWith(join(directory, ".jait", "shots") + "/")));
      __jait_capture(2, ([...(await readFile(data.capturePath)).subarray(0, 8)]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_147_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await tools.execute("browser.screenshot", { path: join(directory, "fixture.png") }, context);
      __jait_capture(0, (result.ok));
      const data = result.data as { result: { path: string } };
      artifacts.push(data.result.path);
      const bytes = await readFile(data.result.path);
      __jait_capture(1, ([...bytes.subarray(0, 8)]));
      __jait_capture(2, (bytes.length));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_82_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.navigate", { url }, context)), ([url]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_87_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      await surface.navigate(`${url}second`);
      __jait_capture(0, ((await surface.history("back")).url), (url));
      __jait_capture(1, ((await surface.history("forward")).url), (`${url}second`));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_92_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await tools.execute("browser.snapshot", {}, context);
      __jait_capture(0, (result));
      __jait_capture(1, ((result.data as { interactiveElements: unknown[] }).interactiveElements));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_97_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.inspect", { selector: "#save" }, context)));
      __jait_capture(1, (await tools.execute("browser.inspect", { selector: "#missing" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_105_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.click", { selector: "button:has-text('Save')" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_110_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, ((await tools.execute("browser.type", { selector: "#asset", text: "workstation-01" }, context)).ok));
      __jait_capture(1, (await tools.execute("browser.inspect", { selector: "#asset" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_116_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.select", { selector: "#status", value: "owned" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_121_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.inspect", { selector: "#footer" }, context)));
      __jait_capture(1, ((await tools.execute("browser.scroll", { x: 0, y: 10000 }, context)).ok));
      __jait_capture(2, (await tools.execute("browser.inspect", { selector: "#footer" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_126_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const found = await tools.execute("browser.wait", { selector: "#save", timeoutMs: 5000 }, context);
      __jait_capture(0, (found.ok));
      const missing = await tools.execute("browser.wait", { selector: "#missing", timeoutMs: 100 }, context);
      __jait_capture(1, (missing.ok));
      __jait_capture(2, (missing.message));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_133_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const path = join(directory, "standalone.png");
      const result = await createScreenshotCaptureTool().execute({ target: url, path, waitMs: 0 }, context);
      __jait_capture(0, (result.ok));
      __jait_capture(1, ([...(await readFile(path)).subarray(0, 8)]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_139_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await createScreenshotCaptureTool().execute({ target: url, waitMs: 0 }, { ...context, projectRoot: directory });
      __jait_capture(0, (result.ok));
      const data = result.data as { path: string; capturePath: string };
      artifacts.push(data.path);
      __jait_capture(1, (data.capturePath.startsWith(join(directory, ".jait", "shots") + "/")));
      __jait_capture(2, ([...(await readFile(data.capturePath)).subarray(0, 8)]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_147_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await tools.execute("browser.screenshot", { path: join(directory, "fixture.png") }, context);
      __jait_capture(0, (result.ok));
      const data = result.data as { result: { path: string } };
      artifacts.push(data.result.path);
      const bytes = await readFile(data.result.path);
      __jait_capture(1, ([...bytes.subarray(0, 8)]));
      __jait_capture(2, (bytes.length));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_82_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.navigate", { url }, context)), ([url]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_87_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      await surface.navigate(`${url}second`);
      __jait_capture(0, ((await surface.history("back")).url), (url));
      __jait_capture(1, ((await surface.history("forward")).url), (`${url}second`));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_92_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await tools.execute("browser.snapshot", {}, context);
      __jait_capture(0, (result));
      __jait_capture(1, ((result.data as { interactiveElements: unknown[] }).interactiveElements));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_97_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.inspect", { selector: "#save" }, context)));
      __jait_capture(1, (await tools.execute("browser.inspect", { selector: "#missing" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_105_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.click", { selector: "button:has-text('Save')" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_110_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, ((await tools.execute("browser.type", { selector: "#asset", text: "workstation-01" }, context)).ok));
      __jait_capture(1, (await tools.execute("browser.inspect", { selector: "#asset" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_116_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.select", { selector: "#status", value: "owned" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_121_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      __jait_capture(0, (await tools.execute("browser.inspect", { selector: "#footer" }, context)));
      __jait_capture(1, ((await tools.execute("browser.scroll", { x: 0, y: 10000 }, context)).ok));
      __jait_capture(2, (await tools.execute("browser.inspect", { selector: "#footer" }, context)));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_126_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const found = await tools.execute("browser.wait", { selector: "#save", timeoutMs: 5000 }, context);
      __jait_capture(0, (found.ok));
      const missing = await tools.execute("browser.wait", { selector: "#missing", timeoutMs: 100 }, context);
      __jait_capture(1, (missing.ok));
      __jait_capture(2, (missing.message));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_133_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const path = join(directory, "standalone.png");
      const result = await createScreenshotCaptureTool().execute({ target: url, path, waitMs: 0 }, context);
      __jait_capture(0, (result.ok));
      __jait_capture(1, ([...(await readFile(path)).subarray(0, 8)]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_139_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await createScreenshotCaptureTool().execute({ target: url, waitMs: 0 }, { ...context, projectRoot: directory });
      __jait_capture(0, (result.ok));
      const data = result.data as { path: string; capturePath: string };
      artifacts.push(data.path);
      __jait_capture(1, (data.capturePath.startsWith(join(directory, ".jait", "shots") + "/")));
      __jait_capture(2, ([...(await readFile(data.capturePath)).subarray(0, 8)]));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_integration_test_ts_147_5_each2": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "packaged-node-bridge";
/*__jait_scope_open__*/{
let server: Server;
let url: string;
let surface: BrowserSurface;
let tools: ToolRegistry;
let directory: string;
const artifacts: string[] = [];
const context = {
      sessionId: "browser-integration", actionId: "browser-integration-action",
      projectRoot: process.cwd(), requestedBy: "test",
    };
const __jait_hook_1308 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime === "packaged-node-bridge" ? "node-bridge" : runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      const shots = resolve(__jait_original_dir, "../../../../.jait/shots");
      await mkdir(shots, { recursive: true });
      directory = await mkdtemp(join(shots, "jait-browser-integration-"));
      server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(`<!doctype html><title>Tool integration fixture</title>
          <h1>Authorized asset inventory</h1>
          <label>Asset <input id="asset" oninput="document.querySelector(\'#result\').textContent=this.value"></label>
          <select id="status" onchange="document.querySelector('#result').textContent=this.value">
            <option value="unknown">Unknown</option><option value="owned">Owned</option>
          </select>
          <button id="save" onclick="document.querySelector('#result').textContent='Asset saved'">Save</button>
          <output id="result">Ready</output>
          <div style="height:3000px"></div><p id="footer">Inventory footer</p>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server has no TCP port");
      url = `http://127.0.0.1:${address.port}/`;
      let Surface = BrowserSurface;
      if (runtime === "packaged-node-bridge") {
        const compiled = await import("../../../../packages/gateway/dist/surfaces/browser.js");
        Surface = compiled.BrowserSurface as typeof BrowserSurface;
        // An installed gateway must work without finding this repository's src.
        vi.spyOn(process, "cwd").mockReturnValue(directory);
      }
      surface = new Surface("preview-browser-browser-integration");
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tools = new ToolRegistry();
      tools.register(createBrowserNavigateTool(registry));
      tools.register(createBrowserSnapshotTool(registry));
      tools.register(createBrowserInspectTool(registry));
      for (const tool of createBrowserInteractionTools(registry)) tools.register(tool);
    };
const __jait_hook_3782 = async () => { await surface.navigate(url); };
const __jait_hook_3844 = async () => {
      await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
    };
const __jait_hook_3967 = async () => {
      try { await surface?.stop(); } finally {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        if (directory) await rm(directory, { recursive: true, force: true });
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
      }
    };
await __jait_hook_1308();
await __jait_hook_3782();
try {
await (async()=>{

      const result = await tools.execute("browser.screenshot", { path: join(directory, "fixture.png") }, context);
      __jait_capture(0, (result.ok));
      const data = result.data as { result: { path: string } };
      artifacts.push(data.result.path);
      const bytes = await readFile(data.result.path);
      __jait_capture(1, ([...bytes.subarray(0, 8)]));
      __jait_capture(2, (bytes.length));
    
})();

} finally {
await __jait_hook_3967();
await __jait_hook_3844();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
