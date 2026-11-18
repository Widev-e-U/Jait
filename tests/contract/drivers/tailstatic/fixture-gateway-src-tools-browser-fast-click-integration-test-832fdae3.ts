// Translated fixture from packages/gateway/src/tools/browser-fast-click.integration.test.ts; expected literals are in tail_static.rs.
import { createServer, type ServerResponse } from "node:http";
import { BrowserSurface } from "../../../../packages/gateway/src/surfaces/browser.js";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { createBrowserInteractionTools } from "../../../../packages/gateway/src/tools/browser-tools.js";
import type { ToolDefinition } from "../../../../packages/gateway/src/tools/contracts.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { ConsentAwareExecutor } from "../../../../packages/gateway/src/security/consent-executor.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import { TrustEngine } from "../../../../packages/gateway/src/security/trust-engine.js";
import type { ToolPermission } from "../../../../packages/gateway/src/security/tool-permissions.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { BrowserWorkflowService } from "../../../../packages/gateway/src/services/browser-workflows.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/browser-fast-click.integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_80_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const result = await tool.execute({ target: "Click Save" }, context);
      __jait_capture(0, (result));
      __jait_capture(1, (requests.at(-1)));
      __jait_capture(2, (requests.at(-1)));
      __jait_capture(3, (requests.at(-1)), (base));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_88_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      await surface.navigate(`${base}/large`);
      __jait_capture(0, (await tool.execute({ target: "Click Save" }, context)));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
      await surface.navigate(`${base}/duplicate`);
      const count = requests.length;
      await __jait_rejected(2, tool.execute({ target: "Click Save" }, context));
      __jait_capture(3, (requests), (count));
      __jait_capture(4, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_99_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const snapshot = (await surface.inspect()).snapshot;
      const guardFor = (id: string) => {
        const element = snapshot.elements.find(item => item.id === id)!;
        return { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: element.tagName!, name: element.name ?? "", text: element.text ?? "" };
      };
      await surface.typeText("#field", "hello", undefined, guardFor("field"));
      await surface.select("#choice", "b", undefined, guardFor("choice"));
      await surface.navigate(`${base}/page`);
      await __jait_rejected(0, surface.typeText("#field", "stale", undefined, guardFor("field")));
      await __jait_rejected(1, surface.select("#choice", "b", undefined, guardFor("choice")));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_112_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      await surface.navigate(`${base}/textarea`);
      const snapshot = (await surface.inspect()).snapshot;
      const address = snapshot.elements.find(item => item.id === "currentAddress")!;
      const other = snapshot.elements.find(item => item.placeholder === "Other Address")!;
      __jait_capture(0, (address.role));
      for (const element of [address, other]) {
        __jait_captureType(1, (element.selector));
        const guard = { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: element.tagName!, name: element.name ?? "", text: element.text ?? "" };
        await surface.typeText(element.selector!, "Address entered", undefined, guard);
      }
      __jait_capture(2, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_126_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const snapshot = (await surface.inspect()).snapshot;
      const field = snapshot.elements.find(item => item.id === "field")!;
      const choice = snapshot.elements.find(item => item.id === "choice")!;
      const guard = (item: typeof field) => ({ documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: item.tagName!, name: item.name ?? "", text: item.text ?? "" });
      await surface.click("#mutate");
      await __jait_rejected(0, surface.typeText("#field", "hello", undefined, { ...guard(field), inputType: "text" }));
      await __jait_rejected(1, surface.select("#choice", "b", undefined, { ...guard(choice), option: { value: "b", label: "B" } }));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_136_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "save")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "" });
      await surface.navigate(`${base}/page`);
      await __jait_rejected(0, tool.execute({ selector: "#save", expected }, context));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_145_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "save")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "" });
      await surface.navigate(`${base}/page`);
      __jait_capture(0, (await tool.execute({ selector: "#save", expected }, { ...context, browserTaskRecoverStale: true })));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_154_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "field")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "", inputType: "text" });
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      const type = createBrowserInteractionTools(registry).find(item => item.name === "browser.type")!;
      await surface.navigate(`${base}/page`);
      __jait_capture(0, (await type.execute({ selector: "#field", text: "hello", expected }, { ...context, browserTaskRecoverStale: true })));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_164_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const pending = tool.execute({ target: "Press Save" }, context);
      const response = await modelRequest;
      await surface.navigate(`${base}/different`);
      answer(response);
      await __jait_rejected(0, pending);
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_176_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const pending = tool.execute({ target: "Activate Save" }, context);
      const response = await modelRequest;
      await surface.navigate(`${base}/page`);
      answer(response);
      await __jait_rejected(0, pending);
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_188_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      await surface.navigate(`${base}/block`);
      const snapshot = (await surface.inspect()).snapshot;
      const moved = new Promise<void>(resolve => { mouseMoved = resolve; });
      const controller = new AbortController();
      const pending = surface.click("#save", controller.signal, { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: "button", name: "Save", text: "Save" })
        .then(() => "clicked", () => "cancelled");
      await Promise.race([moved, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Mouse did not move")), 3000))]);
      controller.abort();
      __jait_capture(0, (await pending));
      await new Promise(resolve => setTimeout(resolve, 750));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_241_5_each0": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "in-process";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const controller = new AbortController();
      const pending = tool.execute({ target: "Choose Save" }, { ...context, signal: controller.signal });
      const response = await modelRequest;
      controller.abort();
      answer(response);
      await __jait_rejected(0, pending);
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_80_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const result = await tool.execute({ target: "Click Save" }, context);
      __jait_capture(0, (result));
      __jait_capture(1, (requests.at(-1)));
      __jait_capture(2, (requests.at(-1)));
      __jait_capture(3, (requests.at(-1)), (base));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_88_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      await surface.navigate(`${base}/large`);
      __jait_capture(0, (await tool.execute({ target: "Click Save" }, context)));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
      await surface.navigate(`${base}/duplicate`);
      const count = requests.length;
      await __jait_rejected(2, tool.execute({ target: "Click Save" }, context));
      __jait_capture(3, (requests), (count));
      __jait_capture(4, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_99_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const snapshot = (await surface.inspect()).snapshot;
      const guardFor = (id: string) => {
        const element = snapshot.elements.find(item => item.id === id)!;
        return { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: element.tagName!, name: element.name ?? "", text: element.text ?? "" };
      };
      await surface.typeText("#field", "hello", undefined, guardFor("field"));
      await surface.select("#choice", "b", undefined, guardFor("choice"));
      await surface.navigate(`${base}/page`);
      await __jait_rejected(0, surface.typeText("#field", "stale", undefined, guardFor("field")));
      await __jait_rejected(1, surface.select("#choice", "b", undefined, guardFor("choice")));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_112_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      await surface.navigate(`${base}/textarea`);
      const snapshot = (await surface.inspect()).snapshot;
      const address = snapshot.elements.find(item => item.id === "currentAddress")!;
      const other = snapshot.elements.find(item => item.placeholder === "Other Address")!;
      __jait_capture(0, (address.role));
      for (const element of [address, other]) {
        __jait_captureType(1, (element.selector));
        const guard = { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: element.tagName!, name: element.name ?? "", text: element.text ?? "" };
        await surface.typeText(element.selector!, "Address entered", undefined, guard);
      }
      __jait_capture(2, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_126_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const snapshot = (await surface.inspect()).snapshot;
      const field = snapshot.elements.find(item => item.id === "field")!;
      const choice = snapshot.elements.find(item => item.id === "choice")!;
      const guard = (item: typeof field) => ({ documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: item.tagName!, name: item.name ?? "", text: item.text ?? "" });
      await surface.click("#mutate");
      await __jait_rejected(0, surface.typeText("#field", "hello", undefined, { ...guard(field), inputType: "text" }));
      await __jait_rejected(1, surface.select("#choice", "b", undefined, { ...guard(choice), option: { value: "b", label: "B" } }));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_136_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "save")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "" });
      await surface.navigate(`${base}/page`);
      await __jait_rejected(0, tool.execute({ selector: "#save", expected }, context));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_145_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "save")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "" });
      await surface.navigate(`${base}/page`);
      __jait_capture(0, (await tool.execute({ selector: "#save", expected }, { ...context, browserTaskRecoverStale: true })));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_154_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      const observed = (await surface.inspect()).snapshot;
      const element = observed.elements.find(item => item.id === "field")!;
      const expected = JSON.stringify({ documentUrl: observed.documentUrl, documentTimeOrigin: observed.documentTimeOrigin, tagName: element.tagName, name: element.name ?? "", text: element.text ?? "", inputType: "text" });
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      const type = createBrowserInteractionTools(registry).find(item => item.name === "browser.type")!;
      await surface.navigate(`${base}/page`);
      __jait_capture(0, (await type.execute({ selector: "#field", text: "hello", expected }, { ...context, browserTaskRecoverStale: true })));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_164_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const pending = tool.execute({ target: "Press Save" }, context);
      const response = await modelRequest;
      await surface.navigate(`${base}/different`);
      answer(response);
      await __jait_rejected(0, pending);
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_176_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const pending = tool.execute({ target: "Activate Save" }, context);
      const response = await modelRequest;
      await surface.navigate(`${base}/page`);
      answer(response);
      await __jait_rejected(0, pending);
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_188_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      await surface.navigate(`${base}/block`);
      const snapshot = (await surface.inspect()).snapshot;
      const moved = new Promise<void>(resolve => { mouseMoved = resolve; });
      const controller = new AbortController();
      const pending = surface.click("#save", controller.signal, { documentUrl: snapshot.documentUrl!, documentTimeOrigin: snapshot.documentTimeOrigin!, tagName: "button", name: "Save", text: "Save" })
        .then(() => "clicked", () => "cancelled");
      await Promise.race([moved, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Mouse did not move")), 3000))]);
      controller.abort();
      __jait_capture(0, (await pending));
      await new Promise(resolve => setTimeout(resolve, 750));
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_integration_test_ts_241_5_each1": {


/*__jait_source_gate__ skipIf process.env["JAIT_BROWSER_INTEGRATION"] !== "1" */
/*__jait_scope_open__*/{
const runtime = "node-bridge";
/*__jait_scope_open__*/{
let server: ReturnType<typeof createServer>;
let base: string;
let surface: BrowserSurface;
let tool: ToolDefinition;
let hold: ((response: ServerResponse) => void) | undefined;
let mouseMoved: (() => void) | undefined;
const requests: string[] = [];
const context = { sessionId: `fast-${runtime}`, actionId: "test", projectRoot: process.cwd(), requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "", SYSTEM_ONE_MODEL: "fixture" } };
function answer(response: ServerResponse) {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: { target: { type: "choice", choice: "c0", confidence: 0.99 } } }) } }] }));
    }
const __jait_hook_1772 = async () => {
      vi.stubEnv("BROWSER_LIVE_VIEW", "false");
      vi.stubEnv("BROWSER_HEADLESS", "true");
      vi.stubEnv("BROWSER_RUNTIME", runtime);
      vi.stubEnv("BROWSER_CHANNEL", "");
      vi.stubEnv("BROWSER_FALLBACK_CHANNELS", "");
      server = createServer((request, response) => {
        if (request.url === "/textarea") {
          response.setHeader("Content-Type", "text/html");
          response.end(`<textarea id="currentAddress" placeholder="Current Address" oninput="document.querySelector('#result').textContent = this.value"></textarea><textarea placeholder="Other Address"></textarea><p id="result"></p>`);
          return;
        }
        if (request.url === "/moved") {
          mouseMoved?.();
          response.end("ok");
          return;
        }
        if (request.url === "/v1/chat/completions") {
          let body = "";
          request.on("data", chunk => { body += String(chunk); });
          request.on("end", () => {
            requests.push(body);
            if (hold) hold(response);
            else answer(response);
          });
          return;
        }
        response.setHeader("Content-Type", "text/html");
        const slowMove = request.url === "/block" ? `<script>window.addEventListener('mousemove', () => { fetch('/moved'); const until = Date.now() + 500; while (Date.now() < until) {} }, { once: true });</script>` : "";
        const many = request.url === "/large" || request.url === "/duplicate" ? Array.from({ length: 70 }, (_, i) => `<button>Item ${i}</button>`).join("") : "";
        const duplicate = request.url === "/duplicate" ? '<button id="another-save">Save</button>' : "";
        response.end('<title>Fixture</title><p>Private text</p>' + many + '<button id="save" onclick="document.querySelector(\'#status\').textContent=\'Saved\'">Save</button>' + duplicate + '<button id="mutate" onclick="document.getElementById(&quot;field&quot;).type=&quot;password&quot;;document.querySelector(&quot;#choice option[value=b]&quot;).value=&quot;changed&quot;">Mutate</button><input id="field" aria-label="Search"><select id="choice" aria-label="Choice"><option value="a">A</option><option value="b">B</option></select><output id="status">Ready</output>' + slowMove);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Fixture server did not start");
      base = `http://127.0.0.1:${address.port}`;
      context.apiKeys.SYSTEM_ONE_BASE_URL = `${base}/v1`;
      surface = new BrowserSurface(`browser-${context.sessionId}`);
      await surface.start(context);
      const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
      tool = createBrowserInteractionTools(registry).find(item => item.name === "browser.click")!;
    };
const __jait_hook_4675 = async () => { await surface.navigate(`${base}/page`); };
const __jait_hook_4748 = () => { hold = undefined; mouseMoved = undefined; };
const __jait_hook_4816 = async () => {
      await surface?.stop();
      await new Promise<void>(resolve => server.close(() => resolve()));
      vi.unstubAllEnvs();
    };
await __jait_hook_1772();
await __jait_hook_4675();
try {
await (async()=>{

      let ready!: (response: ServerResponse) => void;
      const modelRequest = new Promise<ServerResponse>(resolve => { ready = resolve; });
      hold = ready;
      const controller = new AbortController();
      const pending = tool.execute({ target: "Choose Save" }, { ...context, signal: controller.signal });
      const response = await modelRequest;
      controller.abort();
      answer(response);
      await __jait_rejected(0, pending);
      __jait_capture(1, ((await surface.inspect()).snapshot.text));
    
})();

} finally {
await __jait_hook_4816();
await __jait_hook_4748();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
