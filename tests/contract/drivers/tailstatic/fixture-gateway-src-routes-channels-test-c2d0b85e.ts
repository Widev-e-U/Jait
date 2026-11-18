// Translated fixture from packages/gateway/src/routes/channels.test.ts; expected literals are in tail_static.rs.

import { openRawSqlite } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { ChannelManager, type ReplyGenerator } from "../../../../packages/gateway/src/channels/manager.js";
import { registerChannelRoutes } from "../../../../packages/gateway/src/routes/channels.js";
import type { ChannelConnector, ChannelConnectorEvents, ChannelStatus, OutboundMessage } from "../../../../packages/gateway/src/channels/types.js";
import type { LLMConfig } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import type { AppConfig } from "../../../../packages/gateway/src/config.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/channels.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_channels_test_ts_45_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    const res = await app.inject({ method: "GET", url: "/api/channels" });
    __jait_capture(0, (res.statusCode));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_50_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    const res = await app.inject({ method: "GET", url: "/api/channels", headers: await authHeaders() });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_56_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    const res = await app.inject({ method: "POST", url: "/api/channels/whatsapp/start", headers: await authHeaders() });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));
    __jait_capture(2, (res.json().qr));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_63_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    await app.inject({ method: "POST", url: "/api/channels/whatsapp/start", headers: await authHeaders() });
    const res = await app.inject({ method: "GET", url: "/api/channels/whatsapp/status", headers: await authHeaders() });
    __jait_capture(0, (res.json()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_69_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    const res = await app.inject({
      method: "PATCH",
      url: "/api/channels/whatsapp/config",
      headers: await authHeaders(),
      payload: { allowedSenders: ["123"], respondToAll: true },
    });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_80_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    const res = await app.inject({ method: "GET", url: "/api/channels/telegram/status", headers: await authHeaders() });
    __jait_capture(0, (res.statusCode));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_85_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
const __jait_hook_1860 = async () => { ({ app } = await buildApp()); };
await __jait_hook_1860();
try {
await (async()=>{

    await app.inject({ method: "POST", url: "/api/channels/whatsapp/start", headers: await authHeaders() });
    const res = await app.inject({ method: "POST", url: "/api/channels/whatsapp/stop", headers: await authHeaders() });
    __jait_capture(0, (res.json()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_101_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
let mgr: Awaited<ReturnType<typeof buildApp>>["mgr"];
async function patch(payload: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: "/api/channels/whatsapp/config", headers: await authHeaders(), payload });
  }
const __jait_hook_4133 = async () => { ({ app, mgr } = await buildApp()); };
await __jait_hook_4133();
try {
await (async()=>{

    const res = await patch({ token: "secret-bot-token" });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));
    __jait_captureType(2, (res.json().token));
    __jait_capture(3, (mgr.getConfig("whatsapp").token));

    const list = await app.inject({ method: "GET", url: "/api/channels", headers: await authHeaders() });
    __jait_capture(4, (list.json()[0].config));
    __jait_captureType(5, (list.json()[0].config.token));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_113_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
let mgr: Awaited<ReturnType<typeof buildApp>>["mgr"];
async function patch(payload: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: "/api/channels/whatsapp/config", headers: await authHeaders(), payload });
  }
const __jait_hook_4133 = async () => { ({ app, mgr } = await buildApp()); };
await __jait_hook_4133();
try {
await (async()=>{

    await patch({ token: "secret-bot-token" });
    await patch({ respondToAll: true });
    __jait_capture(0, (mgr.getConfig("whatsapp").token));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_119_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
let mgr: Awaited<ReturnType<typeof buildApp>>["mgr"];
async function patch(payload: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: "/api/channels/whatsapp/config", headers: await authHeaders(), payload });
  }
const __jait_hook_4133 = async () => { ({ app, mgr } = await buildApp()); };
await __jait_hook_4133();
try {
await (async()=>{

    await patch({ token: "secret-bot-token" });
    const res = await patch({ token: null });
    __jait_capture(0, (res.json()));
    __jait_capture(1, (mgr.getConfig("whatsapp").token));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_126_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
let mgr: Awaited<ReturnType<typeof buildApp>>["mgr"];
async function patch(payload: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: "/api/channels/whatsapp/config", headers: await authHeaders(), payload });
  }
const __jait_hook_4133 = async () => { ({ app, mgr } = await buildApp()); };
await __jait_hook_4133();
try {
await (async()=>{

    const res = await app.inject({ method: "POST", url: "/api/channels/whatsapp/pair", headers: await authHeaders() });
    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json().error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_channels_test_ts_132_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
class FakeConnector implements ChannelConnector {
  readonly id = "whatsapp";
  readonly label = "WhatsApp";
  private _status: ChannelStatus = "stopped";
  async start(events: ChannelConnectorEvents) { this._status = "qr"; events.onStatus("qr", { qr: "data:image/png;base64,abc" }); }
  async stop() { this._status = "stopped"; }
  async send(_msg: OutboundMessage) {}
  status() { return this._status; }
  currentQr() { return this._status === "qr" ? "data:image/png;base64,abc" : null; }
}
const noopGen: ReplyGenerator = { async generate() { return ""; } };
const fakeLLM = { baseUrl: "http://x", apiKey: "x", model: "m" } as LLMConfig;
const config = { jwtSecret: "test-secret" } as AppConfig;
const authUser = { id: "user-1", username: "tester" };
async function authHeaders() {
  const token = await signAuthToken(authUser, config.jwtSecret);
  return { Authorization: `Bearer ${token}` };
}
async function buildApp() {
  const sqlite = await openRawSqlite(":memory:");
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: noopGen });
  mgr.register(new FakeConnector());
  const app = Fastify();
  registerChannelRoutes(app, config, mgr);
  return { app, mgr };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof buildApp>>["app"];
let mgr: Awaited<ReturnType<typeof buildApp>>["mgr"];
async function patch(payload: Record<string, unknown>) {
    return app.inject({ method: "PATCH", url: "/api/channels/whatsapp/config", headers: await authHeaders(), payload });
  }
const __jait_hook_4133 = async () => { ({ app, mgr } = await buildApp()); };
await __jait_hook_4133();
try {
await (async()=>{

    const res = await app.inject({ method: "POST", url: "/api/channels/nope/pair", headers: await authHeaders() });
    __jait_capture(0, (res.statusCode));
  
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
