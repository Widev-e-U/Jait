// Translated fixture from packages/gateway/src/tools/browser-fast-click.test.ts; expected literals are in tail_static.rs.


import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";




import type { ToolPermission } from "../../../../packages/gateway/src/security/tool-permissions.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/browser-fast-click.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_43_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    const result = await f.tool.execute({ target: "Open Settings" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (f.browser.click.mock.calls), ([snapshot.documentUrl,snapshot.documentTimeOrigin]));
    const request = JSON.stringify(vi.mocked(evaluateDecision).mock.calls[0]);
    __jait_capture(2, (request));
    __jait_capture(3, (request));
    __jait_capture(4, (request));
    __jait_capture(5, (request));
    __jait_capture(6, (request));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_58_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    vi.mocked(systemOneEnabled).mockReturnValue(false);
    __jait_capture(0, (await f.tool.execute({ selector: "#settings" }, context)));
    __jait_capture(1, (f.browser.click.mock.calls));
    __jait_capture(2, (evaluateDecision.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_66_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    await __jait_rejected(0, f.tool.execute({ target: "Open account" }, context));
    const duplicate = { ...snapshot, elements: [snapshot.elements[0], snapshot.elements[0]] };
    f.browser.fastClickSnapshot.mockResolvedValueOnce(duplicate);
    await __jait_rejected(1, f.tool.execute({ target: "Open Settings" }, context));
    const overlapping = { ...snapshot, elements: [snapshot.elements[0], { ...snapshot.elements[0], name: "Account Settings", text: "Account Settings" }] };
    f.browser.fastClickSnapshot.mockResolvedValueOnce(overlapping);
    await __jait_rejected(2, f.tool.execute({ target: "Open Account Settings" }, context));
    const longLabel = "x".repeat(200);
    const truncated = { ...snapshot, elements: [{ ...snapshot.elements[0], name: longLabel, text: longLabel }] };
    f.browser.fastClickSnapshot.mockResolvedValueOnce(truncated);
    await __jait_rejected(3, f.tool.execute({ target: `Click ${longLabel}` }, context));
    vi.mocked(systemOneEnabled).mockReturnValue(false);
    await __jait_rejected(4, f.tool.execute({ target: "Open Settings" }, context));
    await __jait_rejected(5, f.tool.execute({ target: "Open Settings", selector: "#settings" }, context));
    __jait_capture(6, (f.browser.click.mock.calls));
    __jait_capture(7, (evaluateDecision.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_86_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    vi.mocked(evaluateDecision).mockResolvedValueOnce({ model: "fixture", answers: { target: { type: "choice", choice: "none" } } });
    await __jait_rejected(0, f.tool.execute({ target: "Open Settings" }, context));
    vi.mocked(evaluateDecision).mockResolvedValueOnce({ model: "fixture", answers: { target: { type: "choice", choice: "c0", confidence: 0.2 } } });
    await __jait_rejected(1, f.tool.execute({ target: "Open Settings" }, context));
    vi.mocked(evaluateDecision).mockRejectedValueOnce(new Error("unavailable"));
    await __jait_rejected(2, f.tool.execute({ target: "Open Settings" }, context));
    const controller = new AbortController();
    controller.abort();
    __jait_capture(3, (await f.tool.execute({ target: "Open Settings" }, { ...context, signal: controller.signal })));
    __jait_capture(4, (f.browser.click.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_100_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    f.session.secretSafe = true;
    await __jait_rejected(0, f.tool.execute({ target: "Open Settings" }, context));
    f.session.secretSafe = false;
    f.session.controller = "user";
    await __jait_rejected(1, f.tool.execute({ target: "Open Settings" }, context));
    __jait_capture(2, (evaluateDecision.mock.calls));
    __jait_capture(3, (f.browser.click.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_111_3_each0": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const change = "privacy";
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    vi.mocked(evaluateDecision).mockImplementationOnce(async () => {
      if (change === "privacy") f.session.secretSafe = true;
      else f.loseControl();
      return selected;
    });
    await __jait_rejected(0, f.tool.execute({ target: "Open Settings" }, context));
    __jait_capture(1, (f.browser.click.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_111_3_each1": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const change = "control";
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    vi.mocked(evaluateDecision).mockImplementationOnce(async () => {
      if (change === "privacy") f.session.secretSafe = true;
      else f.loseControl();
      return selected;
    });
    await __jait_rejected(0, f.tool.execute({ target: "Open Settings" }, context));
    __jait_capture(1, (f.browser.click.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_browser_fast_click_test_ts_122_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const { createBrowserInteractionTools } = await import("../../../../packages/gateway/src/tools/browser-tools.js");
const { ToolRegistry } = await import("../../../../packages/gateway/src/tools/registry.js");
const { evaluateDecision, systemOneEnabled } = await import("../../../../packages/gateway/src/services/system-one.js");
const { ConsentAwareExecutor } = await import("../../../../packages/gateway/src/security/consent-executor.js");
const { ConsentManager } = await import("../../../../packages/gateway/src/security/consent-manager.js");
const { TrustEngine } = await import("../../../../packages/gateway/src/security/trust-engine.js");
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", capturePageSnapshot: vi.fn(async () => snapshot), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
const __jait_hook_2681 = () => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
};
/*__jait_scope_open__*/{
await __jait_hook_2681();
try {
await (async()=>{

    const f = fixture();
    f.browser.click.mockImplementationOnce(async () => { f.loseControl(); });
    __jait_capture(0, (await f.tool.execute({ target: "Open Settings" }, context)));
    __jait_capture(1, (f.browser.fastClickSnapshot.mock.calls));
    __jait_capture(2, (f.browser.capturePageSnapshot.mock.calls));
  
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
