// Translated fixture from packages/gateway/src/services/browser-adaptive-task.test.ts; expected literals are in tail_static.rs.



import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/browser-adaptive-task.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_17_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { interactiveElements: [], visualContent: { canvas: true, iframe: true } } } as never);
    vi.mocked(callJaitLlmCompletion).mockClear();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    await service.runTask({ task: "Inspect the page" }, context);
    __jait_capture(0, (vi.mocked(callJaitLlmCompletion).mock.calls[0]?.[1][1]?.content));
    __jait_capture(1, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_26_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#menu", name: "Menu" }] } } as never)
      .mockResolvedValueOnce({ ok: false, message: "The verified target could not be clicked.", data: {} } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } });
    __jait_capture(0, (await service.runTask({ task: "Open menu" }, context)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_33_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#old", name: "Old" }] } } as never)
      .mockResolvedValueOnce({ ok: false, message: "Target changed", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } as never)
      .mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#new", name: "New" }] } } as never)
      .mockResolvedValueOnce({ ok: true, message: "clicked", data: {} } as never);
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    const result = await service.runTask({ task: "Open menu", maxActions: 1 }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_47_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    const field = { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "input", inputType: "text", selector: "#field", name: "Search" }] };
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: field } as never)
      .mockResolvedValueOnce({ ok: false, message: "Target changed", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } as never);
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    const pending = await service.runTask({ task: "Search", maxActions: 1 }, context);
    const resumeToken = (pending.data as { resumeToken: string }).resumeToken;
    const result = await service.runTask({ resumeToken, text: "query" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (await service.runTask({ resumeToken, text: "query" }, context)));
    __jait_capture(2, (execute.mock.calls.filter(call => call[0] === "browser.type")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_61_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockImplementation(async (name: string) => name === "browser.snapshot"
      ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#menu", name: "Menu" }] } }
      : { ok: false, message: "Target changed", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } });
    __jait_capture(0, (await service.runTask({ task: "Open menu", maxActions: 1 }, context)));
    __jait_capture(1, (execute.mock.calls.filter(call => call[0] === "browser.click")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_70_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 1 } } });
    const result = await service.runTask({ task: "Open the menu and save" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_80_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service } = fixture();
    vi.mocked(callJaitLlmCompletion).mockClear().mockResolvedValueOnce("Menu opened; save remains").mockResolvedValueOnce("Save is visible");
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Open menu and save" }, context);
    const secondPrompt = vi.mocked(callJaitLlmCompletion).mock.calls[1]?.[1][1]?.content ?? "";
    __jait_capture(0, (secondPrompt));
    __jait_capture(1, (secondPrompt));
    __jait_capture(2, (vi.mocked(evaluateDecision).mock.calls[1]?.[1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_92_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "none" } } })
      .mockResolvedValueOnce({ model: "test", answers: { target: { type: "choice", choice: "c0", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 1 } } });
    const result = await service.runTask({ task: "Open the menu" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls[1]?.[0]));
    __jait_capture(2, (execute.mock.calls[1]?.[1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_103_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" } } })
      .mockResolvedValueOnce({ model: "test", answers: { target: { type: "choice", choice: "none" } } });
    __jait_capture(0, (await service.runTask({ task: "Open the menu" }, context)));
    __jait_capture(1, (execute.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_111_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: "#menu", name: "Menu" }] } })
      .mockResolvedValueOnce({ ok: true, message: "clicked", data: { interactiveElements: [], captureSuppressed: true } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c0", confidence: 1 } } });
    __jait_capture(0, (await service.runTask({ task: "Open the menu" }, context)));
    __jait_capture(1, (execute.mock.calls.map(call => call[0])));
    __jait_capture(2, (evaluateDecision.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_120_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    const elements = Array.from({ length: 20 }, (_, i) => ({ selector: `#c${i}`, tagName: "button", name: `Button ${i}`, text: "" }));
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: elements } });
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 1 }, clickTarget: { type: "choice", choice: "c15", confidence: 1 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 1 } } });
    await service.runTask({ task: "Click Button 15" }, context);
    __jait_capture(0, (execute.mock.calls[0]));
    const args = execute.mock.calls[1]?.[1] as unknown as { selector: string; expected: string };
    __jait_capture(1, (args.selector));
    __jait_capture(2, (JSON.parse(args.expected)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_133_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { interactiveElements: [{ selector: "#go", tagName: "button", name: "Go" }] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click" }, clickTarget: { type: "choice", choice: "c0" } } });
    __jait_capture(0, (await service.runTask({ task: "Go" }, context)));
    __jait_capture(1, (execute.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_140_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [
      { selector: "#q", tagName: "input", inputType: "search", name: "Search" },
      { selector: "#choice", tagName: "select", name: "Choice", options: [{ value: "b", label: "B", disabled: false }] },
    ] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" }, selectTarget: { type: "choice", choice: "c0" } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    const pending = await service.runTask({ task: "Search hello" }, context);
    __jait_capture(0, (pending));
    await service.runTask({ resumeToken: (pending.data as { resumeToken: string }).resumeToken, text: "hello" }, context);
    __jait_capture(1, (execute.mock.calls[1]?.[0]));
    __jait_capture(2, (execute.mock.calls.some(call => call[0] === "browser.select")));
    __jait_capture(3, (vi.mocked(evaluateDecision).mock.calls[0]?.[2]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_154_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ selector: "#choice", tagName: "select", name: "Choice", options: [{ value: "b", label: "B", disabled: false }] }] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "select" }, selectTarget: { type: "choice", choice: "c0" } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Choose B" }, context);
    const args = execute.mock.calls[1]?.[1] as unknown as { value: string; expected: string };
    __jait_capture(0, (args.value));
    __jait_capture(1, (JSON.parse(args.expected).option));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_163_3_each0": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const operation = "down";

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { scrollPosition: { x: 0, y: 500, height: 500 }, interactiveElements: [] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: operation } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Explore the page" }, context);
    __jait_capture(0, (execute.mock.calls[1]?.[0]), (operation === "wait" ? "browser.wait" : "browser.scroll"));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_163_3_each1": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const operation = "up";

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { scrollPosition: { x: 0, y: 500, height: 500 }, interactiveElements: [] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: operation } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Explore the page" }, context);
    __jait_capture(0, (execute.mock.calls[1]?.[0]), (operation === "wait" ? "browser.wait" : "browser.scroll"));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_163_3_each2": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const operation = "wait";

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { scrollPosition: { x: 0, y: 500, height: 500 }, interactiveElements: [] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: operation } } }).mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete" } } });
    await service.runTask({ task: "Explore the page" }, context);
    __jait_capture(0, (execute.mock.calls[1]?.[0]), (operation === "wait" ? "browser.wait" : "browser.scroll"));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_170_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ selector: "#password", tagName: "input", inputType: "password", name: "Password" }] } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    __jait_capture(0, (await service.runTask({ task: "Enter password" }, context)));
    __jait_capture(1, (execute.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_177_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    __jait_capture(0, (await service.runTask({ task: "Do something" }, context)));
    __jait_capture(1, (execute.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_183_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset()
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "click", confidence: 0.36 }, clickTarget: { type: "choice", choice: "c0", confidence: 0.2 } } })
      .mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "complete", confidence: 0.1 } } });
    const result = await service.runTask({ task: "Open the menu", maxActions: 1 }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls[1]?.[1]));
    __jait_capture(2, (evaluateDecision.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_193_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "suppressed", data: { interactiveElements: [] } });
    vi.mocked(evaluateDecision).mockReset();
    __jait_capture(0, (await service.runTask({ task: "Do something" }, context)));
    __jait_capture(1, (evaluateDecision.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_200_3_each0": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const failure = "configuration";

try {
await (async()=>{

    const { service, execute } = fixture();
    if (failure === "configuration") vi.mocked(resolveJaitLlmConfig).mockImplementationOnce(() => { throw new Error("secret"); });
    else vi.mocked(callJaitLlmCompletion).mockRejectedValueOnce(new Error("secret"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    const result = await service.runTask({ task: "Do something" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (evaluateDecision.mock.calls));
    __jait_capture(2, (execute.mock.calls));
    __jait_capture(3, (JSON.stringify(result)));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_200_3_each1": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const failure = "request";

try {
await (async()=>{

    const { service, execute } = fixture();
    if (failure === "configuration") vi.mocked(resolveJaitLlmConfig).mockImplementationOnce(() => { throw new Error("secret"); });
    else vi.mocked(callJaitLlmCompletion).mockRejectedValueOnce(new Error("secret"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue({ model: "test", answers: { next: { type: "choice", choice: "stop" } } });
    const result = await service.runTask({ task: "Do something" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (evaluateDecision.mock.calls));
    __jait_capture(2, (execute.mock.calls));
    __jait_capture(3, (JSON.stringify(result)));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_211_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector: "#answer", name: "Answer" }] } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    vi.mocked(callJaitLlmCompletion).mockClear();
    const result = await service.runTask({ task: "Enter an answer" }, { ...context, providerId: "jait" });
    __jait_capture(0, (result));
    // The single advisory call occurs before the decision; text generation makes no additional call.
    __jait_capture(1, (callJaitLlmCompletion.mock.calls));
    __jait_capture(2, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_222_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector: "#answer", value: "sensitive existing value" }] } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    vi.mocked(callJaitLlmCompletion).mockClear();
    vi.mocked(resolveJaitLlmConfig).mockClear();
    const result = await service.runTask({ task: "Enter an answer" }, { ...context, providerId: "codex", model: "selected-cli-model" });
    __jait_capture(0, (result));
    __jait_capture(1, (JSON.stringify(result)));
    __jait_capture(2, (callJaitLlmCompletion.mock.calls));
    __jait_capture(3, (resolveJaitLlmConfig.mock.calls));
    __jait_capture(4, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_235_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector: "#answer" }] } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce({ model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } });
    const controller = new AbortController();
    vi.mocked(evaluateDecision).mockReset().mockImplementationOnce(async () => { controller.abort(); return { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } }; });
    const result = await service.runTask({ task: "Enter an answer" }, { ...context, signal: controller.signal });
    __jait_capture(0, (result));
    __jait_capture(1, ((result.data as { status?: string }).status));
    __jait_capture(2, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_adaptive_task_test_ts_246_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/jait-llm.ts",import.meta.url)), () => ({ resolveJaitLlmConfig: vi.fn(() => ({})), callJaitLlmCompletion: vi.fn(async () => "hello") }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { callJaitLlmCompletion, resolveJaitLlmConfig } = await import("../../../../packages/gateway/src/services/jait-llm.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const context = { sessionId: "chat", projectRoot: "/project", actionId: "task", requestedBy: "test", apiKeys: {} };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string) => name === "browser.snapshot"
    ? { ok: true, message: "captured", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "button", selector: execute.mock.calls.length === 1 ? "#menu" : "#save", name: execute.mock.calls.length === 1 ? "Menu" : "Save" }] } }
    : { ok: true, message: "clicked", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockRejectedValue(Object.assign(new Error("secret"), { code: "timeout" }));
    const result = await service.runTask({ task: "Do something" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (JSON.stringify(result)));
  
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
