// Translated fixture from packages/gateway/src/services/browser-workflows.test.ts; expected literals are in tail_static.rs.

import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { browserWorkflowRuns } from "../../../../packages/gateway/src/db/schema.js";
import { createBrowserWorkflowTools } from "../../../../packages/gateway/src/tools/browser-workflow-tools.js";
import { BrowserWorkflowService } from "../../../../packages/gateway/src/services/browser-workflows.js";
import type { ToolContext, ToolResult } from "../../../../packages/gateway/src/tools/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/browser-workflows.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_32_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (browserWorkflowSchema.safeParse(definition).success));
    for (const patch of [
      { formatVersion: 2 }, { inputs: [definition.inputs[0], definition.inputs[0]] },
      { steps: [{ action: "execute", label: "Code", script: "alert(1)" }] },
      { steps: [{ action: "open", label: "Open", url: "https://example.com", browserId: "other-chat" }] },
      { steps: [{ action: "open", label: "Open", url: "{{unknown}}" }] },
      { steps: [{ action: "click", label: "Click", selector: "#submit" }] },
      { steps: [...definition.steps, { action: "wait", label: "Wait", selector: "body", timeoutMs: 999999 }] },
    ]) __jait_capture(1, (browserWorkflowSchema.safeParse({ ...definition, ...patch }).success));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_44_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, saved } = await fixture();
    __jait_capture(0, (service.get(saved.id, context)), (saved));
    __jait_capture(1, (service.list({ ...context, userId: "other" })));
    __jait_capture(2, (service.list({ ...context, projectRoot: "/other" })));
    __jait_thrown(3, () => service.get(saved.id, { ...context, userId: "other" }));
    __jait_thrown(4, () => service.save(definition, context, saved.id, 9));
    __jait_capture(5, (service.save({ ...definition, name: "Updated" }, context, saved.id, 1).revision));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_54_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, saved, execute, db } = await fixture();
    const onNestedEvent = vi.fn();
    const result = await service.run(saved.id, { month: "literal {{month}} $()" }, { ...context, onNestedEvent }, 1);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (execute.mock.calls.map(call => call[0])));
    __jait_capture(2, (execute.mock.calls[1]?.[1]));
    __jait_capture(3, (execute.mock.calls[1]?.[2]), ({ sessionId: context.sessionId, userId: context.userId, projectRoot: context.projectRoot }));
    __jait_capture(4, (onNestedEvent.mock.calls));
    __jait_capture(5, (service.listRuns(context)[0]));
    __jait_capture(6, (JSON.stringify(db.select().from(browserWorkflowRuns).all())));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_67_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, saved, execute } = await fixture();
    await __jait_rejected(0, service.run(saved.id, { unexpected: "x" }, context, 1));
    await __jait_rejected(1, service.run(saved.id, {}, context, 2));
    const required = service.save({ ...definition, inputs: [{ name: "month", description: "Month" }] }, context);
    await __jait_rejected(2, service.run(required.id, {}, context, 1));
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "https://user:password@example.com"]) {
      const unsafe = service.save({ ...definition, steps: [{ action: "open", label: "Open", url }] }, context);
      await __jait_rejected(3, service.run(unsafe.id, {}, context, 1));
    }
    __jait_capture(4, (execute.mock.calls));
    __jait_capture(5, (service.listRuns(context)));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_81_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, saved, execute } = await fixture(async name => {
      if (name === "browser.type") throw new Error("secret page text");
      return { ok: true, message: "done" };
    });
    const result = await service.run(saved.id, {}, context, 1);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (JSON.stringify(result)));
    __jait_capture(2, (execute.mock.calls));
    __jait_capture(3, (service.listRuns(context)[0]));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_93_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const status of ["done", "unable", "browser_changed"]) {
      const { service, execute } = await fixture(async name => ({ ok: true, message: "done", data: name === "browser.handoff" ? { status } : undefined }));
      const saved = service.save({ ...definition, steps: [definition.steps[0], { action: "checkpoint", label: "Login", message: "Log in in the browser" }, definition.steps[2]] }, context);
      __jait_capture(0, ((await service.run(saved.id, {}, context, 1)).ok), (status === "done"));
      __jait_capture(1, (execute.mock.calls), (status === "done" ? 3 : 2));
    }
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_102_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const { service, saved, execute } = await fixture(async (_name, _input, ctx) => {
      entered();
      await new Promise<void>(resolve => ctx.signal!.addEventListener("abort", () => resolve(), { once: true }));
      return { ok: true, message: "settled" };
    });
    const pending = service.run(saved.id, {}, context, 1);
    await started;
    await __jait_rejected(0, service.run(saved.id, {}, context, 1));
    const run = service.listRuns(context)[0]!;
    __jait_thrown(1, () => service.cancel(run.id, { ...context, userId: "other" }));
    service.cancel(run.id, context);
    __jait_capture(2, ((await pending).ok));
    __jait_capture(3, (service.getRun(run.id, context)));
    __jait_capture(4, (execute.mock.calls));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_121_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, execute, db } = await fixture(async name => ({ ok: true, message: "done", data: name === "browser.extract" ? { values: { result: "page-data" } } : undefined }));
    const tools = createBrowserWorkflowTools(service);
    const save = tools.find(tool => tool.name === "browser.workflow.save")!;
    const definitionWithOutput = { ...definition, steps: [...definition.steps,
      { action: "check", label: "Verify", selector: "#results", text: "{{month}}" },
      { action: "extract", label: "Read", instruction: "Read results for {{month}}", fields: [{ name: "result", type: "string", description: "Result for {{month}}" }] },
    ] };
    const result = await save.execute({ definition: definitionWithOutput }, context);
    const saved = result.data as { id: string; revision: number };
    __jait_capture(0, (await service.run(saved.id, { month: "November" }, context, saved.revision)));
    __jait_capture(1, (execute.mock.calls[4]?.[1]));
    __jait_capture(2, (JSON.stringify(db.select().from(browserWorkflowRuns).all())));
    await __jait_rejected(3, save.execute({ definition: { ...definition, steps: [{ action: "execute", label: "Unsafe" }] } }, context));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_browser_workflows_test_ts_137_3": {

const { browserWorkflowSchema } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/shared", __jait_original_dir):__jait_require.resolve("@jait/shared")));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", userId: "owner", requestedBy: "test" };
const definition: BrowserWorkflowDefinition = {
  formatVersion: 1, name: "Find invoices", description: "Repeat a browser task",
  inputs: [{ name: "month", description: "Invoice month", default: "2026-10" }],
  steps: [
    { action: "open", label: "Open portal", url: "https://example.com/invoices" },
    { action: "type", label: "Choose month", selector: "#month", text: "{{month}}" },
    { action: "wait", label: "Check results", selector: "#results" },
  ],
};
const closers: (() => void)[] = [];
async function fixture(handler: (name: string, input: unknown, ctx: ToolContext) => Promise<ToolResult> = async () => ({ ok: true, message: "done" })) {
  const execute = vi.fn(handler);
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new BrowserWorkflowService(db, execute);
  closers.push(() => { service.stop(); sqlite.close(); });
  const saved = service.save(definition, context);
  return { db, service, execute, saved };
}
const __jait_hook_1121 = () => { for (const close of closers.splice(0)) close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, saved, db, execute } = await fixture();
    await service.run(saved.id, {}, context, 1);
    const run = service.listRuns(context)[0]!;
    db.update(browserWorkflowRuns).set({ status: "waiting_for_user", nextStep: 1, progress: JSON.stringify([{ label: "Login", status: "waiting_for_user" }]) }).run();
    execute.mockClear();
    const restarted = new BrowserWorkflowService(db, execute);
    __jait_capture(0, (restarted.getRun(run.id, context)));
    __jait_capture(1, (execute.mock.calls));
  
})();

} finally {
await __jait_hook_1121();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
