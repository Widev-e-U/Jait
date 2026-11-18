// Translated fixture from packages/gateway/src/security/control-access.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { DeviceRegistry } from "../../../../packages/gateway/src/services/device-registry.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/control-access.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_control_access_test_ts_32_3": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, write } = await setup();
    const r = await app.inject({ method: "POST", url: "/api/terminals/fake-terminal/write", payload: { data: "MARKER" } });
    __jait_capture(0, (r.statusCode));
    __jait_capture(1, (write.mock.calls));
  
})();

} finally {
await __jait_hook_611();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_38_3": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, write, other } = await setup();
    const r = await app.inject({ method: "POST", url: "/api/terminals/fake-terminal/write", headers: other, payload: { data: "MARKER" } });
    __jait_capture(0, (r.statusCode));
    __jait_capture(1, (write.mock.calls));
    const list = await app.inject({ url: "/api/terminals", headers: other });
    __jait_capture(2, (list.json().terminals));
  
})();

} finally {
await __jait_hook_611();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_46_3": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, write, headers } = await setup();
    const r = await app.inject({ method: "POST", url: "/api/terminals/fake-terminal/write", headers, payload: { data: "MARKER" } });
    __jait_capture(0, (r.statusCode));
    __jait_capture(1, (write.mock.calls));
  
})();

} finally {
await __jait_hook_611();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_55_3_each0": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const nodeEnv = "production";

try {
await (async()=>{

    const plane = new WsControlPlane({ ...config, nodeEnv });
    const input = vi.fn(), approval = vi.fn(), send = vi.fn();
    plane.onTerminalInput = input; plane.onConsentApprove = approval;
    const client = { authenticated: false, userId: null, ws: { readyState: 1, send } };
    await (plane as any).handleMessage(client, { type: "terminal.input", terminalId: "fake", data: "MARKER" });
    await (plane as any).handleMessage(client, { type: "consent.approve", requestId: "fake" });
    __jait_capture(0, (input.mock.calls)); __jait_capture(1, (approval.mock.calls));
    __jait_capture(2, (JSON.parse(send.mock.calls[0]![0]).payload.code));
  
})();

} finally {
await __jait_hook_611();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_55_3_each1": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const nodeEnv = "development";

try {
await (async()=>{

    const plane = new WsControlPlane({ ...config, nodeEnv });
    const input = vi.fn(), approval = vi.fn(), send = vi.fn();
    plane.onTerminalInput = input; plane.onConsentApprove = approval;
    const client = { authenticated: false, userId: null, ws: { readyState: 1, send } };
    await (plane as any).handleMessage(client, { type: "terminal.input", terminalId: "fake", data: "MARKER" });
    await (plane as any).handleMessage(client, { type: "consent.approve", requestId: "fake" });
    __jait_capture(0, (input.mock.calls)); __jait_capture(1, (approval.mock.calls));
    __jait_capture(2, (JSON.parse(send.mock.calls[0]![0]).payload.code));
  
})();

} finally {
await __jait_hook_611();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_65_3": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const plane = new WsControlPlane(config);
    const input = vi.fn(), approval = vi.fn();
    plane.onTerminalInput = input; plane.onConsentApprove = approval;
    plane.canAccessTerminal = (_id, user) => user === "owner";
    plane.canAccessConsent = (_id, user) => user === "owner";
    const client = (userId: string) => ({ authenticated: true, userId, ws: { readyState: 1, send: vi.fn() } });
    for (const user of ["stranger", "owner"]) {
      await (plane as any).handleMessage(client(user), { type: "terminal.input", terminalId: "fake", data: "MARKER" });
      await (plane as any).handleMessage(client(user), { type: "consent.approve", requestId: "fake" });
    }
    __jait_capture(0, (input.mock.calls)); __jait_capture(1, (approval.mock.calls));
  
})();

} finally {
await __jait_hook_611();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_80_1": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };

try {
await (async()=>{

  const { app } = await setup();
  for (const url of ["/api/dev-proxy/1/", "/api/dev-file/fake", "/api/filesystem/browse?path=/tmp", "/api/consent/pending"]) {
    const r = await app.inject({ url });
    __jait_capture(0, (r.statusCode));
  }

})();

} finally {
await __jait_hook_611();
}


break;
}
case "tailstatic_packages_gateway_src_security_control_access_test_ts_89_1": {


const config = { ...loadConfig(), jwtSecret: "control-access-regression-secret", nodeEnv: "production", logLevel: "silent" };
const apps: Array<Awaited<ReturnType<typeof createServer>>> = [];
async function setup() {
  const write = vi.fn();
  const surfaces = new SurfaceRegistry();
  const snapshot = { id: "fake-terminal", type: "terminal", state: "running", sessionId: "owner-session", metadata: {} };
  surfaces.registerInstance("fake-terminal", { id: snapshot.id, type: "terminal", sessionId: snapshot.sessionId,
    state: "running", snapshot: () => snapshot, write, resize: vi.fn() } as any);
  const approve = vi.fn(() => true);
  const consentManager = { getRequest: () => ({ id: "pending", status: "pending", sessionId: "owner-session" }), approve, listPending: () => [], reject: vi.fn(() => true) } as any;
  const app = await createServer(config, { consentManager, deviceRegistry: new DeviceRegistry(), surfaceRegistry: surfaces, toolRegistry: new ToolRegistry(),
    audit: { write: vi.fn() } as any,
    sessionService: { getById: (id: string, user?: string) => id === "owner-session" && (!user || user === "owner") ? { id, userId: "owner" } : null } as any });
  apps.push(app);
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const other = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, write, approve, headers: { authorization: `Bearer ${token}` }, other: { authorization: `Bearer ${other}` } };
}
const __jait_hook_611 = async () => { for (const app of apps.splice(0)) await app.close(); };

try {
await (async()=>{

  const { app, headers, other, approve } = await setup();
  const url = "/api/mobile/consent/pending/approve";
  __jait_capture(0, ((await app.inject({ method: "POST", url })).statusCode));
  __jait_capture(1, ((await app.inject({ method: "POST", url, headers: other })).statusCode));
  __jait_capture(2, (approve.mock.calls));
  __jait_capture(3, ((await app.inject({ method: "POST", url, headers })).statusCode));
  __jait_capture(4, (approve.mock.calls));

})();

} finally {
await __jait_hook_611();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
