// Translated fixture from packages/gateway/src/sprint5.test.ts; expected literals are in tail_static.rs.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import {
  BrowserSurfaceFactory,
  type BrowserDriver,
  type BrowserPageSnapshot,
  type BrowserPerformanceMetrics,
} from "../../../../packages/gateway/src/surfaces/browser.js";
import {
  createBrowserNavigateTool,
  createBrowserSnapshotTool,
  createBrowserInspectTool,
  createBrowserInteractionTools,
  createWebFetchTool,
  createWebSearchTool,
} from "../../../../packages/gateway/src/tools/browser-tools.js";
import { SSRFGuard } from "../../../../packages/gateway/src/security/ssrf-guard.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint5.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint5_test_ts_188_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
let registry: SurfaceRegistry;
let driver: MockBrowserDriver;
let projectRoot: string;
const __jait_hook_5721 = () => {
    projectRoot = mkdtempSync(join(__jait_fixture_dir, "jait-sprint5-"));
    toolContext.projectRoot = projectRoot;
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  };
const __jait_hook_6021 = () => {
    rmSync(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_5721();
try {
await (async()=>{

    const navigate = createBrowserNavigateTool(registry);
    const snapshot = createBrowserSnapshotTool(registry);

    const navResult = await navigate.execute({ url: "https://example.com" }, toolContext);
    __jait_capture(0, (navResult.ok));
    __jait_capture(1, (driver.calls));

    const snapResult = await snapshot.execute({}, toolContext);
    __jait_capture(2, (snapResult.ok));
    const data = snapResult.data as {
      snapshot: string;
      activeElement: { selector: string };
      dialogs: Array<{ title: string }>;
      obstruction: { hasModal: boolean };
      interactiveElements: Array<{ selectors: Array<{ kind: string }> }>;
    };
    __jait_capture(3, (data.snapshot));
    __jait_capture(4, (data.snapshot));
    __jait_capture(5, (data.snapshot));
    __jait_capture(6, (data.activeElement.selector));
    __jait_capture(7, (data.dialogs[0]?.title));
    __jait_capture(8, (data.obstruction.hasModal));
    __jait_capture(9, (data.interactiveElements[0]?.selectors[0]?.kind));
  
})();

} finally {
await __jait_hook_6021();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_214_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
let registry: SurfaceRegistry;
let driver: MockBrowserDriver;
let projectRoot: string;
const __jait_hook_5721 = () => {
    projectRoot = mkdtempSync(join(__jait_fixture_dir, "jait-sprint5-"));
    toolContext.projectRoot = projectRoot;
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  };
const __jait_hook_6021 = () => {
    rmSync(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_5721();
try {
await (async()=>{

    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    const inspect = createBrowserInspectTool(registry);

    const result = await inspect.execute({ selector: "#submit" }, toolContext);

    __jait_capture(0, (result.ok));
    const data = result.data as {
      target: { selector: string; obscured: boolean; interceptedBy: { role: string } };
      activeElement: { selector: string };
      dialogs: Array<{ title: string }>;
    };
    __jait_capture(1, (data.target.selector));
    __jait_capture(2, (data.target.obscured));
    __jait_capture(3, (data.target.interceptedBy.role));
    __jait_capture(4, (data.activeElement.selector));
    __jait_capture(5, (data.dialogs[0]?.title));
  
})();

} finally {
await __jait_hook_6021();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_233_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
let registry: SurfaceRegistry;
let driver: MockBrowserDriver;
let projectRoot: string;
const __jait_hook_5721 = () => {
    projectRoot = mkdtempSync(join(__jait_fixture_dir, "jait-sprint5-"));
    toolContext.projectRoot = projectRoot;
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  };
const __jait_hook_6021 = () => {
    rmSync(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_5721();
try {
await (async()=>{

    const sourcePath = "/remote/project/capture.png";
    const png = Buffer.from("test screenshot");
    const proxyFsOp = vi.fn(async () => ({ content: png.toString("base64") }));
    const screenshotTool = createBrowserInteractionTools(registry, undefined, { proxyFsOp } as any)
      .find((tool) => tool.name === "browser.screenshot")!;

    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    const result = await screenshotTool.execute({ path: sourcePath }, {
      ...toolContext,
      executionNodeId: "remote-node",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (proxyFsOp.mock.calls), (["remote-node","readBinary",{ path: sourcePath }]));
    const displayPath = (result.data as { result: { path: string } }).result.path;
    __jait_capture(2, (displayPath));
    __jait_capture(3, (readFileSync(displayPath)), (png));
    unlinkSync(displayPath);
  
})();

} finally {
await __jait_hook_6021();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_254_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
let registry: SurfaceRegistry;
let driver: MockBrowserDriver;
let projectRoot: string;
const __jait_hook_5721 = () => {
    projectRoot = mkdtempSync(join(__jait_fixture_dir, "jait-sprint5-"));
    toolContext.projectRoot = projectRoot;
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  };
const __jait_hook_6021 = () => {
    rmSync(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_5721();
try {
await (async()=>{

    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    const tools = createBrowserInteractionTools(registry);

    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    await byName.get("browser.click")!.execute({ selector: "#submit" }, toolContext);
    await byName.get("browser.type")!.execute({ selector: "#email", text: "a@b.com" }, toolContext);
    await byName.get("browser.scroll")!.execute({ x: 0, y: 200 }, toolContext);
    await byName.get("browser.select")!.execute({ selector: "#country", value: "US" }, toolContext);
    await byName.get("browser.wait")!.execute({ selector: "#ready", timeoutMs: 50 }, toolContext);
    const screenshot = await byName.get("browser.screenshot")!.execute({ path: "artifacts/page.png" }, toolContext);

    __jait_capture(0, (screenshot.ok));
    const displayPath = (screenshot.data as { result: { path: string } }).result.path;
    __jait_capture(1, (readFileSync(displayPath).toString()));
    unlinkSync(displayPath);
    const capturePath = join(projectRoot, "artifacts/page.png");
    __jait_capture(2, (readFileSync(capturePath).toString()));
    unlinkSync(capturePath);
    __jait_capture(3, (driver.calls), ([`screenshot:${capturePath}`]));
  
})();

} finally {
await __jait_hook_6021();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_285_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
let registry: SurfaceRegistry;
let driver: MockBrowserDriver;
let projectRoot: string;
const __jait_hook_5721 = () => {
    projectRoot = mkdtempSync(join(__jait_fixture_dir, "jait-sprint5-"));
    toolContext.projectRoot = projectRoot;
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  };
const __jait_hook_6021 = () => {
    rmSync(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_5721();
try {
await (async()=>{

    await createBrowserNavigateTool(registry).execute({ url: "https://example.com" }, toolContext);
    driver.failClickSelector = "#submit";
    const tools = createBrowserInteractionTools(registry);
    const click = tools.find((tool) => tool.name === "browser.click");

    await __jait_rejected(0, click!.execute({ selector: "#submit" }, toolContext));
  
})();

} finally {
await __jait_hook_6021();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_296_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
let registry: SurfaceRegistry;
let driver: MockBrowserDriver;
let projectRoot: string;
const __jait_hook_5721 = () => {
    projectRoot = mkdtempSync(join(__jait_fixture_dir, "jait-sprint5-"));
    toolContext.projectRoot = projectRoot;
    registry = new SurfaceRegistry();
    driver = new MockBrowserDriver();
    registry.register(new BrowserSurfaceFactory({ driverFactory: async () => driver }));
  };
const __jait_hook_6021 = () => {
    rmSync(projectRoot, { recursive: true, force: true });
  };
await __jait_hook_5721();
try {
await (async()=>{

    const collaboration = {
      assertAgentControl: vi.fn(),
      getSessionByBrowserId: vi.fn().mockReturnValue({
        id: "bs_secret",
        secretSafe: true,
        controller: "agent",
      }),
    };

    await createBrowserNavigateTool(registry, collaboration as any).execute({ url: "https://example.com" }, toolContext);

    const snapshot = await createBrowserSnapshotTool(registry, collaboration as any).execute({}, toolContext);
    __jait_capture(0, (snapshot.ok));
    __jait_capture(1, (snapshot.message));
    __jait_capture(2, (snapshot.data));

    const inspect = await createBrowserInspectTool(registry, collaboration as any).execute({ selector: "#submit" }, toolContext);
    __jait_capture(3, (inspect.ok));
    __jait_capture(4, (inspect.message));
    __jait_capture(5, (inspect.data));

    const screenshotTool = createBrowserInteractionTools(registry, collaboration as any)
      .find((tool) => tool.name === "browser.screenshot");
    const screenshot = await screenshotTool!.execute({ path: "artifacts/page-secret.png" }, toolContext);
    __jait_capture(6, (screenshot.ok));
    __jait_capture(7, (screenshot.message));
    __jait_capture(8, (driver.calls));
  
})();

} finally {
await __jait_hook_6021();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_355_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
const originalFetch = globalThis.fetch;
const __jait_hook_12922 = () => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_WEB_SEARCH_MODEL"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["XAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["MOONSHOT_API_KEY"];
  };

try {
await (async()=>{

    const guard = new SSRFGuard();
    __jait_thrown(0, () => guard.validate("http://127.0.0.1:8080"));
    __jait_thrown(1, () => guard.validate("http://192.168.1.20"));
    __jait_thrown(2, () => guard.validate("http://localhost"));
    __jait_thrown(3, () => guard.validate("https://example.com"));
  
})();

} finally {
await __jait_hook_12922();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_363_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
const originalFetch = globalThis.fetch;
const __jait_hook_12922 = () => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_WEB_SEARCH_MODEL"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["XAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["MOONSHOT_API_KEY"];
  };

try {
await (async()=>{

    globalThis.fetch = vi.fn(async () => new Response("<h1>ok</h1>", {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;

    const tool = createWebFetchTool(new SSRFGuard());
    const result = await tool.execute({ url: "https://example.com/" }, toolContext);

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as { status: number }).status));
    await __jait_rejected(2, tool.execute({ url: "http://127.0.0.1/" }, toolContext));
  
})();

} finally {
await __jait_hook_12922();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_377_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
const originalFetch = globalThis.fetch;
const __jait_hook_12922 = () => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_WEB_SEARCH_MODEL"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["XAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["MOONSHOT_API_KEY"];
  };

try {
await (async()=>{

    process.env["OPENAI_API_KEY"] = "test-openai";
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/responses")) {
        return new Response(JSON.stringify({
          output_text: "SQLite WAL notes",
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { url: "https://sqlite.org/wal.html", title: "SQLite WAL" },
                ],
              },
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        web: {
          results: [{ title: "Brave result", url: "https://brave.example", description: "Snippet" }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    globalThis.fetch = mockFetch as typeof fetch;

    const tool = createWebSearchTool();
    const auto = await tool.execute({ query: "vitest" }, toolContext);
    __jait_capture(0, (auto.ok));
    __jait_capture(1, ((auto.data as { provider: string }).provider));
    __jait_capture(2, ((auto.data as { results: unknown[] }).results.length));

    process.env["BRAVE_API_KEY"] = "test-key";
    const brave = await tool.execute({ query: "typescript", provider: "brave" }, toolContext);
    __jait_capture(3, (brave.ok));
    __jait_capture(4, ((brave.data as { provider: string }).provider));
  
})();

} finally {
await __jait_hook_12922();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_416_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
const originalFetch = globalThis.fetch;
const __jait_hook_12922 = () => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_WEB_SEARCH_MODEL"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["XAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["MOONSHOT_API_KEY"];
  };

try {
await (async()=>{

    process.env["OPENAI_API_KEY"] = "test-openai";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes("/responses")) {
        return new Response(JSON.stringify({
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { title: "Fallback Result", url: "https://fallback.example" },
                ],
              },
            },
          ],
          output_text: "Fallback snippet",
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const tool = createWebSearchTool();
    const result = await tool.execute({ query: "sqlite wal", provider: "grok" }, toolContext);
    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as { provider: string }).provider));
    __jait_capture(2, (result.message));
  
})();

} finally {
await __jait_hook_12922();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint5_test_ts_445_3": {


const toolContext = {
  sessionId: "sprint5",
  actionId: "a1",
  projectRoot: "",
  requestedBy: "test",
};
class MockBrowserDriver implements BrowserDriver {
  liveView = { display: ":99", vncPort: 5900, websockifyPort: 6080, novncUrl: "/live" };
  calls: string[] = [];
  currentUrl = "about:blank";
  failClickSelector: string | null = null;

  async navigate(url: string): Promise<void> {
    this.calls.push(`navigate:${url}`);
    this.currentUrl = url;
  }
  async click(selector: string): Promise<void> {
    if (this.failClickSelector === selector) {
      throw new Error("Element is not clickable");
    }
    this.calls.push(`click:${selector}`);
  }
  async typeText(selector: string, text: string): Promise<void> {
    this.calls.push(`type:${selector}:${text}`);
  }
  async scroll(x: number, y: number): Promise<void> {
    this.calls.push(`scroll:${x},${y}`);
  }
  async select(selector: string, value: string): Promise<void> {
    this.calls.push(`select:${selector}:${value}`);
  }
  async waitFor(selector: string, timeoutMs: number): Promise<void> {
    this.calls.push(`wait:${selector}:${timeoutMs}`);
  }
  async screenshot(path?: string): Promise<string> {
    this.calls.push(`screenshot:${path ?? "auto"}`);
    const outputPath = path ?? "artifacts/default.png";
    if (!outputPath.startsWith("/remote/")) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, "test screenshot");
    }
    return outputPath;
  }
  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.currentUrl,
      title: "Mock Title",
      text: "Hello from mock browser",
      elements: [
        {
          role: "button",
          name: "Submit",
          selector: "#submit",
          selectors: [
            { kind: "id", value: "submit", selector: "#submit" },
            { kind: "role", value: "button:Submit", selector: "role=button[name=\"Submit\"]" },
          ],
        },
        {
          role: "textbox",
          name: "Email",
          selector: "#email",
          placeholder: "Enter email",
          selectors: [
            { kind: "id", value: "email", selector: "#email" },
            { kind: "placeholder", value: "Enter email", selector: "placeholder=Enter email" },
          ],
        },
      ],
      activeElement: {
        role: "textbox",
        name: "Email",
        selector: "#email",
        selectors: [{ kind: "id", value: "email", selector: "#email" }],
        tagName: "input",
        type: "email",
      },
      dialogs: [
        {
          role: "dialog",
          title: "Sign in",
          name: "Sign in",
          selector: "[data-testid=\"login-dialog\"]",
          selectors: [{ kind: "testId", value: "login-dialog", selector: "[data-testid=\"login-dialog\"]" }],
          ariaModal: true,
          open: true,
        },
      ],
      obstruction: {
        hasModal: true,
        dialogCount: 1,
        activeDialogTitle: "Sign in",
        topLayer: [
          {
            role: "dialog",
            tagName: "div",
            selector: "[data-testid=\"login-dialog\"]",
            reason: "open dialog",
          },
        ],
        notes: ["1 dialog(s) visible."],
      },
    };
  }
  async diagnose(selector: string) {
    return {
      selector,
      found: selector !== "#missing",
      role: "button",
      name: "Submit",
      selector: "#submit",
      selectors: [{ kind: "id", value: "submit", selector: "#submit" }],
      tagName: "button",
      disabled: false,
      offscreen: false,
      obscured: selector === "#submit",
      obstructionReason: selector === "#submit" ? "Another element is receiving pointer hits at the target center point." : undefined,
      interceptedBy: selector === "#submit"
        ? {
          role: "dialog",
          tagName: "div",
          selector: "[data-testid=\"login-dialog\"]",
          reason: "hit-test interceptor",
        }
        : null,
      inDialog: true,
      dialogTitle: "Sign in",
    };
  }
  async getMetrics(): Promise<BrowserPerformanceMetrics> {
    return {
      sampledAt: new Date().toISOString(),
      url: this.currentUrl,
      title: "Mock Title",
      navigation: { domContentLoadedMs: 120, loadMs: 240, type: "navigate" },
      paint: { firstPaintMs: 80, firstContentfulPaintMs: 95 },
      webVitals: { lcpMs: 140, cls: 0.02, inpMs: 45 },
      resources: { total: 8, scripts: 2, stylesheets: 1, images: 3, fonts: 1, largestTransferSize: 32_000 },
      memory: { usedJsHeapSize: 1_000_000, totalJsHeapSize: 2_000_000, jsHeapSizeLimit: 4_000_000 },
    };
  }
  async close(): Promise<void> {
    this.calls.push("close");
  }
}
/*__jait_scope_open__*/{
const originalFetch = globalThis.fetch;
const __jait_hook_12922 = () => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    delete process.env["OPENAI_API_KEY"];
    delete process.env["OPENAI_BASE_URL"];
    delete process.env["OPENAI_WEB_SEARCH_MODEL"];
    delete process.env["BRAVE_API_KEY"];
    delete process.env["PERPLEXITY_API_KEY"];
    delete process.env["OPENROUTER_API_KEY"];
    delete process.env["XAI_API_KEY"];
    delete process.env["GEMINI_API_KEY"];
    delete process.env["MOONSHOT_API_KEY"];
  };

try {
await (async()=>{

    const tool = createWebSearchTool();
    const result = await tool.execute({ query: "SQLite WAL mode best practices", provider: "openai", limit: 5 }, toolContext);
    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as { provider: string }).provider));
    __jait_capture(2, (result.message));
  
})();

} finally {
await __jait_hook_12922();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
