// Translated fixture from packages/gateway/src/services/browser-task-continuation.test.ts; expected literals are in tail_static.rs.




import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/browser-task-continuation.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_21_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    const events: unknown[] = [];
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} })
      .mockResolvedValueOnce(field("#city")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(field("#city"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const result = await service.runTask({ task: "Fill the form", fieldValues: [
      { selector: "#name", name: "#name", text: "Ada", documentUrl: "https://example.test/", documentTimeOrigin: 123 }, { selector: "#city", name: "#city", text: "Paris", documentUrl: "https://example.test/", documentTimeOrigin: 123 },
    ] }, { ...context, onNestedEvent: (event: unknown) => events.push(event) });
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type").map(([, args]) => args)));
    __jait_capture(2, (JSON.stringify([events, vi.mocked(evaluateDecision).mock.calls, result])));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_38_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const mode of ["duplicate mapping", "duplicate observed", "wrong name", "wrong document", "missing"]) {
      const { service, execute } = fixture();
      if (mode === "duplicate observed") execute.mockResolvedValueOnce({ ...field("#name"), data: { ...field("#name").data, interactiveElements: [field("#name").data.interactiveElements[0], field("#name").data.interactiveElements[0]] } });
      vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
      const mapping = { selector: "#name", name: mode === "wrong name" ? "Other" : "#name", text: "Ada", documentUrl: "https://example.test/", documentTimeOrigin: mode === "wrong document" ? 124 : 123 };
      const result = await service.runTask({ task: "Fill the form", fieldValues: mode === "missing" ? [] : mode === "duplicate mapping" ? [mapping, mapping] : [mapping] }, context);
      __jait_capture(0, (result));
      __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type")));
    }
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_50_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    const unnamed = field("#permanentAddress");
    unnamed.data.interactiveElements[0].name = "";
    execute.mockResolvedValueOnce(unnamed).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(unnamed);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const result = await service.runTask({ task: "Fill the address", fieldValues: [{ selector: "#permanentAddress", name: "", text: "Example address", documentUrl: "https://example.test/", documentTimeOrigin: 123 }] }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type")));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_61_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: false, message: "stale", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } });
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const result = await service.runTask({ task: "Fill the form", fieldValues: [{ selector: "#name", name: "#name", text: "Ada", documentUrl: "https://example.test/", documentTimeOrigin: 123 }] }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type")));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_70_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} })
      .mockResolvedValueOnce(field("#city")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(field("#city"));
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const first = await service.runTask({ task: "Enter Ada and Paris", maxActions: 2 }, context);
    __jait_capture(0, (first));
    const second = await service.runTask({ resumeToken: token(first), text: "Ada" }, context);
    __jait_capture(1, (second));
    const final = await service.runTask({ resumeToken: token(second), text: "Paris" }, context);
    __jait_capture(2, (final));
    const actions = execute.mock.calls.filter(([name]) => name === "browser.type");
    __jait_capture(3, (actions.map(([, args]) => args)));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_87_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    const form = { ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [
      { tagName: "input", inputType: "text", selector: "#name", name: "Full Name" },
      { tagName: "input", inputType: "email", selector: "#email", name: "Email" },
    ] } };
    execute.mockResolvedValueOnce(form).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(form);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const first = await service.runTask({ task: "Fill the form" }, context);
    const second = await service.runTask({ resumeToken: token(first), text: "Alex Example" }, context);
    __jait_capture(0, (second));
    const criteria = vi.mocked(evaluateDecision).mock.calls[1]?.[2] as { typeTarget: { criteria: Record<string, string> } };
    __jait_capture(1, (JSON.stringify(criteria.typeTarget.criteria)));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_102_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    const nextDocument = { ...field("#name"), data: { ...field("#name").data, documentTimeOrigin: 456 } };
    execute.mockResolvedValueOnce(field("#name")).mockResolvedValueOnce({ ok: true, message: "typed", data: {} })
      .mockResolvedValueOnce(nextDocument).mockResolvedValueOnce({ ok: true, message: "typed", data: {} }).mockResolvedValueOnce(nextDocument);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(typeDecision).mockResolvedValueOnce(completeDecision);
    const first = await service.runTask({ task: "Fill both pages" }, context);
    const second = await service.runTask({ resumeToken: token(first), text: "Alex" }, context);
    __jait_capture(0, (second));
    const final = await service.runTask({ resumeToken: token(second), text: "Alex" }, context);
    __jait_capture(1, (final));
    const criteria = vi.mocked(evaluateDecision).mock.calls[2]?.[2] as { next: { criteria: Record<string, string> } };
    __jait_capture(2, (criteria.next.criteria));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_117_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision).mockResolvedValue(completeDecision);
    const first = await service.runTask({ task: "Enter Ada" }, context);
    for (const changed of [{ sessionId: "other" }, { userId: "other" }, { projectRoot: "/else" }, { executionNodeId: "else" }]) {
      __jait_capture(0, (await service.runTask({ resumeToken: token(first), text: "Ada" }, { ...context, ...changed })));
    }
    const [a, b] = await Promise.all([service.runTask({ resumeToken: token(first), text: "Ada" }, context), service.runTask({ resumeToken: token(first), text: "Ada" }, context)]);
    __jait_capture(1, ([a, b].filter(r => r.ok)));
    __jait_capture(2, ([a, b].filter(r => !r.ok)));
    __jait_capture(3, (await service.runTask({ resumeToken: token(first), text: "Ada" }, context)));
    __jait_capture(4, (execute.mock.calls.filter(([name]) => name === "browser.type")));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_130_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const expired = await service.runTask({ task: "Enter Ada" }, context);
    clock.mockReturnValue(121000);
    __jait_capture(0, (await service.runTask({ resumeToken: token(expired), text: "Ada" }, context)));
    __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type")));
    clock.mockReturnValue(122000);
    const stale = await service.runTask({ task: "Enter Ada" }, context);
    execute.mockResolvedValueOnce({ ok: false, message: "stale", data: { code: "BROWSER_STALE_TARGET", actionDispatched: false } } as never);
    __jait_capture(2, (await service.runTask({ resumeToken: token(stale), text: "Ada" }, context)));
    __jait_capture(3, (await service.runTask({ resumeToken: token(stale), text: "Ada" }, context)));
    __jait_capture(4, (execute.mock.calls.filter(([name]) => name === "browser.type")));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_145_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const first = await service.runTask({ task: "Enter Ada", maxActions: 1 }, context);
    const result = await service.runTask({ resumeToken: token(first), text: "Ada" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type")));
    const second = await service.runTask({ task: "Enter Ada" }, context);
    const controller = new AbortController(); controller.abort();
    __jait_capture(2, (await service.runTask({ resumeToken: token(second), text: "Ada" }, { ...context, signal: controller.signal })));
    __jait_capture(3, (execute.mock.calls.filter(([name]) => name === "browser.type")));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_157_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    vi.mocked(evaluateDecision).mockReset().mockResolvedValue(typeDecision);
    const controller = new AbortController();
    const pending = await service.runTask({ task: "Enter Ada" }, { ...context, signal: controller.signal });
    controller.abort();
    __jait_capture(0, (await service.runTask({ resumeToken: token(pending), text: "Ada" }, context)));
    __jait_capture(1, (execute.mock.calls.filter(([name]) => name === "browser.type")));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_166_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service } = fixture();
    const task = createBrowserWorkflowTools(service).find(tool => tool.name === "browser.task")!;
    __jait_capture(0, (task.description));
    __jait_capture(1, (task.parameters.properties));
    __jait_capture(2, (task.parameters.required ?? []));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_task_continuation_test_ts_174_3": {
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/src/services/system-one.ts",import.meta.url)), () => ({ systemOneEnabled: () => true, evaluateDecision: vi.fn() }));
const { BrowserWorkflowService } = await import("../../../../packages/gateway/src/services/browser-workflows.js");
const { evaluateDecision } = await import("../../../../packages/gateway/src/services/system-one.js");
const { createBrowserWorkflowTools } = await import("../../../../packages/gateway/src/tools/browser-workflow-tools.js");
const { ContextEvidence } = await import("../../../../packages/gateway/src/tools/context-evidence.js");
const context = { sessionId: "chat", projectRoot: "/project", executionNodeId: "node", userId: "user", providerId: "codex", actionId: "task", requestedBy: "test", apiKeys: {} };
const field = (selector: string) => ({ ok: true, message: "snapshot", data: { documentUrl: "https://example.test/", documentTimeOrigin: 123, interactiveElements: [{ tagName: "textarea", selector, name: selector }] } });
const typeDecision = { model: "test", answers: { next: { type: "choice", choice: "type" }, typeTarget: { type: "choice", choice: "c0" } } };
const completeDecision = { model: "test", answers: { next: { type: "choice", choice: "complete" } } };
function fixture() {
  const db = { select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }) };
  const execute = vi.fn(async (name: string, _input: unknown, _context: unknown) => name === "browser.snapshot" ? field("#name") : { ok: true, message: "typed", data: {} });
  return { service: new BrowserWorkflowService(db as never, execute), execute };
}
const token = (result: { data?: unknown }) => (result.data as { resumeToken: string }).resumeToken;
const __jait_hook_1531 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute } = fixture();
    execute.mockResolvedValueOnce({ ...field("#name"), data: { ...field("#name").data, textPreview: "page".repeat(50000) } } as never);
    vi.mocked(evaluateDecision).mockReset().mockResolvedValueOnce(typeDecision);
    const pending = await service.runTask({ task: "Enter Ada" }, context);
    const projection = new ContextEvidence().project(pending, context, 1024, "browser.task");
    __jait_capture(0, (projection.content), (token(pending)));
    __jait_capture(1, (projection.content));
    __jait_capture(2, (JSON.stringify(pending)));
  
})();

} finally {
await __jait_hook_1531();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
