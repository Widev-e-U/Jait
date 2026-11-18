// Translated fixture from packages/gateway/src/tools/email-tools.test.ts; expected literals are in tail_static.rs.
import type { EmailService } from "../../../../packages/gateway/src/services/email/index.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { createEmailTools } from "../../../../packages/gateway/src/tools/email-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/email-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_18_3_each0": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service[method].mock.calls), ([...args]));
    __jait_capture(2, (JSON.stringify(result)));
    if (name === "email_read") __jait_capture(3, (result.data));
    if (["email_send", "email_tag", "email_delete"].includes(name)) {
      __jait_capture(4, (ws.sendUICommand.mock.calls), ([{ command: "email.control", data: { action: "refresh", accountId: "account-1" } },context.sessionId]));
    } else {
      __jait_capture(5, (ws.sendUICommand.mock.calls));
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_33_3_each0": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockRejectedValue(new Error("Mailbox disconnected")) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    __jait_capture(0, (await tool.execute(input, context)));
    __jait_capture(1, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_18_3_each1": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service[method].mock.calls), ([...args]));
    __jait_capture(2, (JSON.stringify(result)));
    if (name === "email_read") __jait_capture(3, (result.data));
    if (["email_send", "email_tag", "email_delete"].includes(name)) {
      __jait_capture(4, (ws.sendUICommand.mock.calls), ([{ command: "email.control", data: { action: "refresh", accountId: "account-1" } },context.sessionId]));
    } else {
      __jait_capture(5, (ws.sendUICommand.mock.calls));
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_33_3_each1": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockRejectedValue(new Error("Mailbox disconnected")) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    __jait_capture(0, (await tool.execute(input, context)));
    __jait_capture(1, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_18_3_each2": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service[method].mock.calls), ([...args]));
    __jait_capture(2, (JSON.stringify(result)));
    if (name === "email_read") __jait_capture(3, (result.data));
    if (["email_send", "email_tag", "email_delete"].includes(name)) {
      __jait_capture(4, (ws.sendUICommand.mock.calls), ([{ command: "email.control", data: { action: "refresh", accountId: "account-1" } },context.sessionId]));
    } else {
      __jait_capture(5, (ws.sendUICommand.mock.calls));
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_33_3_each2": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockRejectedValue(new Error("Mailbox disconnected")) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    __jait_capture(0, (await tool.execute(input, context)));
    __jait_capture(1, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_18_3_each3": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service[method].mock.calls), ([...args]));
    __jait_capture(2, (JSON.stringify(result)));
    if (name === "email_read") __jait_capture(3, (result.data));
    if (["email_send", "email_tag", "email_delete"].includes(name)) {
      __jait_capture(4, (ws.sendUICommand.mock.calls), ([{ command: "email.control", data: { action: "refresh", accountId: "account-1" } },context.sessionId]));
    } else {
      __jait_capture(5, (ws.sendUICommand.mock.calls));
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_33_3_each3": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockRejectedValue(new Error("Mailbox disconnected")) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    __jait_capture(0, (await tool.execute(input, context)));
    __jait_capture(1, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_18_3_each4": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockResolvedValue(output) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    const result = await tool.execute(input, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service[method].mock.calls), ([...args]));
    __jait_capture(2, (JSON.stringify(result)));
    if (name === "email_read") __jait_capture(3, (result.data));
    if (["email_send", "email_tag", "email_delete"].includes(name)) {
      __jait_capture(4, (ws.sendUICommand.mock.calls), ([{ command: "email.control", data: { action: "refresh", accountId: "account-1" } },context.sessionId]));
    } else {
      __jait_capture(5, (ws.sendUICommand.mock.calls));
    }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_33_3_each4": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{
const { name, method, input, args, output } = { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { [method]: vi.fn().mockRejectedValue(new Error("Mailbox disconnected")) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === name)!;
    __jait_capture(0, (await tool.execute(input, context)));
    __jait_capture(1, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_42_3": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { sendMessage: vi.fn() };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find((tool) => tool.name === "email_view")!;
    __jait_capture(0, ((await tool.execute({ action: "compose", to: "reviewer@example.test", body: "Draft for review" }, context)).ok));
    __jait_capture(1, (ws.sendUICommand.mock.calls), ([context.sessionId]));
    __jait_capture(2, (service.sendMessage.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_55_3": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { resolveAccount: vi.fn().mockReturnValue(account), getMessage: vi.fn().mockResolvedValue(message) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find(tool => tool.name === "email_view")!;
    const result = await tool.execute({ action: "open", messageId: "message-1", accountId: "account-1" }, context);
    __jait_capture(0, (result), ({ ok: true, data: { accountId: "account-1", message } }));
    __jait_capture(1, (JSON.stringify(result)));
    __jait_capture(2, (service.resolveAccount.mock.calls));
    __jait_capture(3, (service.getMessage.mock.calls));
    __jait_capture(4, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_66_3": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { resolveAccount: vi.fn().mockImplementation(() => { throw new Error("Account not found"); }) };
    const ws = { sendUICommand: vi.fn() };
    const tool = createEmailTools(service as unknown as EmailService, ws as unknown as WsControlPlane).find(tool => tool.name === "email_view")!;
    __jait_capture(0, ((await tool.execute({ action: "open" }, context)).ok));
    __jait_capture(1, (await tool.execute({ action: "open", messageId: "foreign", accountId: "foreign" }, context)));
    __jait_capture(2, (ws.sendUICommand.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_email_tools_test_ts_74_3": {


const context = { sessionId: "email-tests", actionId: "email-action", projectRoot: "/project", requestedBy: "test", userId: "owner-1" };
const account = { id: "account-1", email: "owner@example.test", provider: "gmail", accessToken: "must-not-leak" };
const message = { id: "message-1", subject: "Maintenance window", from: "admin@example.test", date: "2026-10-09T08:00:00Z", bodyText: "", bodyHtml: "<p>Review the <b>asset inventory</b>.</p>" };
const cases = [
  { name: "email_list", method: "listMessages", input: { accountId: "account-1", folder: "inbox", query: "maintenance", limit: 5 },
    args: ["owner-1", "account-1", { folder: "inbox", query: "maintenance", limit: 5 }], output: { account, messages: [message] } },
  { name: "email_read", method: "getMessage", input: { id: "message-1", accountId: "account-1" }, args: ["owner-1", "account-1", "message-1"], output: message },
  { name: "email_send", method: "sendMessage", input: { accountId: "account-1", to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory." },
    args: ["owner-1", "account-1", { to: "reviewer@example.test", subject: "Inventory review", body: "Review the inventory.", cc: undefined, bcc: undefined, replyToMessageId: undefined, html: undefined }], output: undefined },
  { name: "email_tag", method: "tagMessage", input: { accountId: "account-1", id: "message-1", add: ["STARRED"], remove: ["UNREAD"] }, args: ["owner-1", "account-1", "message-1", ["STARRED"], ["UNREAD"]], output: undefined },
  { name: "email_delete", method: "deleteMessage", input: { accountId: "account-1", id: "message-1" }, args: ["owner-1", "account-1", "message-1"], output: undefined },
];
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { listAccounts: vi.fn().mockReturnValue([account]) };
    const tool = createEmailTools(service as unknown as EmailService).find(tool => tool.name === "email_accounts")!;
    const result = await tool.execute({}, context);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (service.listAccounts.mock.calls));
    __jait_capture(2, (JSON.stringify(result)));
  
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
