// Translated fixture from packages/gateway/src/tools/browser-tools.test.ts; expected literals are in tail_static.rs.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import type { ToolDefinition, ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import {
  createBrowserNavigateTool, createBrowserSnapshotTool, createBrowserInspectTool,
  createBrowserInteractionTools, createBrowserSandboxStartTool,
} from "../../../../packages/gateway/src/tools/browser-tools.js";
import type { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/browser-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each0": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each0": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each0": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each0": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each0": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each0": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each1": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.snapshot", input: {}, method: "describe", args: [] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each1": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.snapshot", input: {}, method: "describe", args: [] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each1": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.snapshot", input: {}, method: "describe", args: [] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each1": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.snapshot", input: {}, method: "describe", args: [] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each1": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.snapshot", input: {}, method: "describe", args: [] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each1": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.snapshot", input: {}, method: "describe", args: [] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each2": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each2": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each2": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each2": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each2": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each2": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each4": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each4": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each4": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each4": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each4": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each4": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each5": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each5": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each5": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each5": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each5": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each5": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each6": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each6": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each6": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each6": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each6": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each6": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each7": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each7": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each7": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each7": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each7": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each7": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_82_3_each8": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const signal = new AbortController().signal;
    const result = await f.tool(name).execute(input, { ...context, signal });
    __jait_capture(0, (result.ok));
    if (name === "browser.screenshot") {
      __jait_capture(1, (f.surface.screenshot.mock.calls), ([signal]));
    } else {
      __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls), ([...args,signal]));
    }
    __jait_capture(3, (f.registry.startSurface.mock.calls));
    __jait_capture(4, (f.collaboration.assertAgentControl.mock.calls), ([f.surface.id]));
    if (name === "browser.screenshot") {
      const data = result.data as { result: { path: string; capturePath: string } };
      artifacts.push(data.result.path);
      __jait_capture(5, (data.result.capturePath), (capturePath));
      __jait_capture(6, (await readFile(data.result.path)), (await readFile(capturePath)));
    } else {
      __jait_capture(7, (result.data), ({ browserId: f.surface.id, title: snapshot.title, textPreview: snapshot.text }));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_104_3_each8": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    __jait_capture(0, (await f.tool(name).execute(input, { ...context, signal: AbortSignal.abort() })));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.registry.startSurface.mock.calls));
    __jait_capture(3, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_113_3_each8": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.assertAgentControl.mockImplementation(() => { throw new Error("Browser controlled by user"); });
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.getSurface.mock.calls));
    __jait_capture(2, (f.surface[method as keyof typeof f.surface].mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_121_3_each8": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.state = "stopped";
    await __jait_rejected(0, f.tool(name).execute(input, context));
    __jait_capture(1, (f.registry.startSurface.mock.calls));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_128_3_each8": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const action = f.surface[method as keyof typeof f.surface] as ReturnType<typeof vi.fn>;
    action.mockRejectedValue(new Error("Browser disconnected"));
    await __jait_rejected(0, f.tool(name).execute(input, context));
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_135_3_each8": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
const { name, input, method, args } = { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] };
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.collaboration.getSessionByBrowserId.mockReturnValue({
      id: "preview-session", browserId: f.surface.id, controller: "agent", secretSafe: true,
    } as ReturnType<typeof f.collaboration.getSessionByBrowserId>);
    const result = await f.tool(name).execute(input, context);
    __jait_capture(0, (result.data));
    if (name === "browser.screenshot") {
      __jait_capture(1, (result.ok));
      __jait_capture(2, (f.surface.screenshot.mock.calls));
    } else {
      __jait_capture(3, (result.data));
      __jait_capture(4, (JSON.stringify(result.data)), (snapshot.text));
    }
  
})();

} finally {
await __jait_hook_2191();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_153_3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.registry.getSurface.mockReturnValue(undefined);
    const tool = createBrowserNavigateTool(f.registry as unknown as SurfaceRegistry);
    await tool.execute({ url: snapshot.url }, context);
    __jait_capture(0, (f.registry.startSurface.mock.calls), (["browser",`browser-${context.sessionId}`,{
      sessionId: context.sessionId, projectRoot: context.projectRoot, userId: undefined,
    }]));
  
})();

} finally {
await __jait_hook_2191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_163_3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    const result = await f.tool("browser.screenshot").execute({}, { ...context, projectRoot: directory });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.message));
    const requestedPath = f.surface.screenshot.mock.calls[0]?.[0];
    __jait_capture(3, (requestedPath?.startsWith(join(directory, ".jait", "shots", "browser-"))));
    const data = result.data as { result: { path: string } };
    artifacts.push(data.result.path);
  
})();

} finally {
await __jait_hook_2191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_175_3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.screenshot.mockResolvedValue("/remote/capture.png");
    f.ws.proxyFsOp.mockResolvedValue({ content: Buffer.from("remote-image").toString("base64") });
    const result = await f.tool("browser.screenshot").execute({}, { ...context, executionNodeId: "test-node" });
    const data = result.data as { result: { path: string } };
    artifacts.push(data.result.path);
    __jait_capture(0, (f.ws.proxyFsOp.mock.calls));
    __jait_capture(1, (await readFile(data.result.path, "utf8")));
  
})();

} finally {
await __jait_hook_2191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_186_3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const f = fixture();
    f.surface.inspect.mockRejectedValue(new Error("Page navigating"));
    __jait_capture(0, (await f.tool("browser.click").execute({ selector: "#save" }, context)), ({
      ok: true, data: { browserId: f.surface.id, actionResult: { selector: "#save" } },
    }));
  
})();

} finally {
await __jait_hook_2191();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_tools_test_ts_196_3": {


const context: ToolContext = {
  sessionId: "browser-tests", actionId: "browser-action",
  projectRoot: process.cwd(), requestedBy: "test",
};
const snapshot = {
  url: "https://example.com/form", title: "Asset inventory", text: "Asset saved",
  elements: [{ role: "button", name: "Save", selector: "#save" }],
  activeElement: null, dialogs: [], obstruction: null,
};
const cases = [
  { name: "browser.navigate", input: { url: snapshot.url }, method: "navigate", args: [snapshot.url] },
  { name: "browser.snapshot", input: {}, method: "describe", args: [] },
  { name: "browser.inspect", input: { selector: "#save" }, method: "inspect", args: ["#save"] },
  { name: "browser.click", input: { selector: "#save" }, method: "click", args: ["#save"] },
  { name: "browser.type", input: { selector: "#asset", text: "workstation" }, method: "typeText", args: ["#asset", "workstation"] },
  { name: "browser.scroll", input: { x: 0, y: 600 }, method: "scroll", args: [0, 600] },
  { name: "browser.select", input: { selector: "#status", value: "owned" }, method: "select", args: ["#status", "owned"] },
  { name: "browser.wait", input: { selector: "#ready", timeoutMs: 125 }, method: "waitFor", args: ["#ready", 125] },
  { name: "browser.screenshot", input: {}, method: "screenshot", args: [undefined] },
];
let directory: string;
let capturePath: string;
const artifacts: string[] = [];
function fixture() {
  const surface = {
    id: "preview-browser-browser-tests", type: "browser", state: "running",
    getLiveViewInfo: vi.fn().mockReturnValue({ novncUrl: "/live" }),
    navigate: vi.fn().mockResolvedValue(snapshot),
    describe: vi.fn().mockResolvedValue("Asset inventory: Asset saved"),
    inspect: vi.fn().mockResolvedValue({ snapshot, target: { selector: "#save", found: true } }),
    click: vi.fn().mockResolvedValue(undefined),
    typeText: vi.fn().mockResolvedValue(undefined),
    scroll: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(capturePath),
  };
  const registry = {
    getSurface: vi.fn().mockReturnValue(surface),
    startSurface: vi.fn().mockResolvedValue(surface),
  };
  const collaboration = {
    getSessionByPreviewSessionId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id }),
    getSessionByBrowserId: vi.fn().mockReturnValue({ id: "preview-session", browserId: surface.id, controller: "agent" }),
    assertAgentControl: vi.fn(),
  };
  const ws = { proxyFsOp: vi.fn() };
  const typedRegistry = registry as unknown as SurfaceRegistry;
  const tools: ToolDefinition[] = [
    createBrowserNavigateTool(typedRegistry, collaboration),
    createBrowserSnapshotTool(typedRegistry, collaboration),
    createBrowserInspectTool(typedRegistry, collaboration),
    ...createBrowserInteractionTools(typedRegistry, collaboration, ws),
  ];
  return { surface, registry, collaboration, ws, tool: (name: string) => tools.find((t) => t.name === name)! };
}
const __jait_hook_1982 = async () => {
  directory = await mkdtemp(join(__jait_fixture_dir, "jait-browser-tools-"));
  capturePath = join(directory, "capture.png");
  await writeFile(capturePath, Buffer.from([137, 80, 78, 71]));
};
const __jait_hook_2191 = async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(artifacts.splice(0).map((path) => rm(path, { force: true })));
};
/*__jait_scope_open__*/{
await __jait_hook_1982();
try {
await (async()=>{

    const manager = { startBrowserSandbox: vi.fn().mockResolvedValue({ containerId: "sandbox-browser" }) };
    const tool = createBrowserSandboxStartTool(manager as unknown as SandboxManager);
    const result = await tool.execute({ novncPort: 16080, vncPort: 15900, mountMode: "read-only" }, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (manager.startBrowserSandbox.mock.calls), ([{ projectRoot: context.projectRoot, novncPort: 16080, vncPort: 15900, mountMode: "read-only" }]));
  
})();

} finally {
await __jait_hook_2191();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
