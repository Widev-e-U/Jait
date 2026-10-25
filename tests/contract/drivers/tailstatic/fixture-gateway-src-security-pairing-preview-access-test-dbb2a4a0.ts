// Translated fixture from packages/gateway/src/security/pairing-preview-access.test.ts; expected literals are in tail_static.rs.


import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer as httpServer } from "node:http";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { NodeCredentialsService } from "../../../../packages/gateway/src/services/node-credentials.js";
import { registerAuthRoutes } from "../../../../packages/gateway/src/routes/auth.js";
import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { nodes } from "../../../../packages/gateway/src/db/schema.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/pairing-preview-access.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_24_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { default: cookie } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@fastify/cookie", __jait_original_dir):__jait_require.resolve("@fastify/cookie")));
const { default: WebSocket, WebSocketServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}
const __jait_hook_1011 = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    cleanups.push(() => sqlite.close());
    const users = new UserService(db), app = Fastify();
    await app.register(cookie); registerAuthRoutes(app, config, users); cleanups.push(() => app.close());
    const register = (username: string, invitation?: string) => app.inject({ method: "POST", url: "/api/auth/register", payload: { username, password: "test-password-only", invitation } });
    const first = await register("owner"); __jait_capture(0, (first.statusCode));
    __jait_capture(1, ((await register("stranger")).statusCode));
    const invited = await app.inject({ method: "POST", url: "/api/auth/invitations", headers: { authorization: "Bearer " + first.json().access_token } });
    __jait_capture(2, (invited.statusCode));
    const code = invited.json().invitation;
    const second = await register("friend", code); __jait_capture(3, (second.statusCode));
    __jait_capture(4, ((await register("reused-code", code)).statusCode));
    __jait_capture(5, ((await app.inject({ method: "POST", url: "/api/auth/invitations", headers: { authorization: "Bearer " + second.json().access_token } })).statusCode));
    __jait_capture(6, (users.countUsers()));
  
})();

} finally {
await __jait_hook_1011();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_43_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { default: cookie } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@fastify/cookie", __jait_original_dir):__jait_require.resolve("@fastify/cookie")));
const { default: WebSocket, WebSocketServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}
const __jait_hook_1011 = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:"); migrateDatabase(sqlite);
    cleanups.push(() => sqlite.close());
    const now = new Date().toISOString();
    db.insert(nodes).values({ nodeId: "node-a", firstSeenAt: now, lastSeenAt: now, createdAt: now, updatedAt: now }).run();
    const credentials = new NodeCredentialsService(db);
    __jait_capture(0, (credentials.bind("node-a", "owner")));
    __jait_capture(1, (credentials.bind("node-a", "stranger")));
    const token = credentials.issue("node-a", "owner")!;
    __jait_capture(2, (new NodeCredentialsService(db).resolve(token)));
    __jait_capture(3, (sqlite.prepare("SELECT token_hash FROM node_credentials").get()), ({ token_hash: token }));
    const plane = new WsControlPlane(config, db);
    const client = { authenticated: false, userId: null, terminalSubscriptions: new Set(), ws: { send: vi.fn(), close: vi.fn(), readyState: 1 } };
    __jait_capture(4, (await (plane as any).authenticateClient(client, token)));
    const input = vi.fn(); plane.onTerminalInput = input; plane.canAccessTerminal = () => true;
    await (plane as any).handleMessage(client, { type: "terminal.input", terminalId: "fake", data: "MARKER" });
    __jait_capture(5, (input.mock.calls));
    __jait_capture(6, (credentials.revoke("node-a", "stranger")));
    __jait_capture(7, (credentials.revoke("node-a", "owner")));
    __jait_captureType(8, (new NodeCredentialsService(db).resolve(token)));
    await (plane as any).handleMessage(client, { type: "fs.register-node", payload: { id: "node-a", name: "a", platform: "linux" } });
    __jait_capture(9, (plane.getFsNodes()));
  
})();

} finally {
await __jait_hook_1011();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_81_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { default: cookie } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@fastify/cookie", __jait_original_dir):__jait_require.resolve("@fastify/cookie")));
const { default: WebSocket, WebSocketServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}
const __jait_hook_1011 = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    let observed: import("node:http").IncomingHttpHeaders = {};
    const upstream = httpServer((req, res) => { observed = req.headers; res.setHeader("content-type", "text/javascript"); res.setHeader("set-cookie", "jait_token=evil"); res.end('export const ok = true'); });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => upstream.close(() => resolve())));
    const port = (upstream.address() as import("node:net").AddressInfo).port;
    const { app, token, headers, other } = await previewSetup(port, __jait_fixture_dir);
    const response = await app.inject({ url: `/api/dev-proxy/${port}/main.js`, headers: { ...headers, cookie: "jait_token=" + token } });
    __jait_capture(0, (response.statusCode));
    __jait_captureType(1, (observed.authorization)); __jait_captureType(2, (observed.cookie));
    __jait_captureType(3, (response.headers["set-cookie"]));
    __jait_capture(4, ((await app.inject({ url: `/api/dev-proxy/${port}/`, headers: other })).statusCode));
    __jait_capture(5, ((await app.inject({ url: "/api/dev-proxy/1/", headers })).statusCode));
  
})();

} finally {
await __jait_hook_1011();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_95_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { default: cookie } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@fastify/cookie", __jait_original_dir):__jait_require.resolve("@fastify/cookie")));
const { default: WebSocket, WebSocketServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}
const __jait_hook_1011 = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = mkdtempSync(join(__jait_fixture_dir, "jait-preview-access-"));
    const outside = mkdtempSync(join(__jait_fixture_dir, "jait-preview-outside-"));
    cleanups.push(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
    const html = join(root, "index.html"); writeFileSync(html, "<html><head></head><body>preview</body></html>");
    writeFileSync(join(outside, "private.txt"), "private-marker"); symlinkSync(join(outside, "private.txt"), join(root, "escape.txt"));
    const { app, headers, other } = await previewSetup(4321, root);
    const url = "/api/dev-file/" + Buffer.from(html).toString("base64url");
    __jait_capture(0, ((await app.inject({ url, headers })).statusCode));
    __jait_capture(1, ((await app.inject({ url, headers: other })).statusCode));
    __jait_capture(2, ((await app.inject({ url: url + "/escape.txt", headers })).statusCode));
    const grant = await app.inject({ method: "POST", url: "/api/preview/access", headers, payload: { source: url } });
    __jait_capture(3, (grant.statusCode));
    const scopedUrl = new URL(grant.json().url);
    const rendered = await app.inject({ url: scopedUrl.pathname, headers: { origin: "null" } });
    __jait_capture(4, (rendered.statusCode));
    __jait_capture(5, (rendered.headers["content-security-policy"]));
    __jait_capture(6, (rendered.headers["content-security-policy"]));
    const grantToken = scopedUrl.pathname.split("/")[2];
    __jait_capture(7, ((await app.inject({ url: "/api/filesystem/nodes", headers: { authorization: "Bearer " + grantToken } })).statusCode));
    __jait_capture(8, ((await app.inject({ url: scopedUrl.pathname.replace("/file/", "/proxy/") })).statusCode));

  
})();

} finally {
await __jait_hook_1011();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_118_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { default: cookie } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@fastify/cookie", __jait_original_dir):__jait_require.resolve("@fastify/cookie")));
const { default: WebSocket, WebSocketServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}
const __jait_hook_1011 = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, token, headers } = await previewSetup(4321, __jait_fixture_dir);
    const evil = { origin: "https://attacker.invalid", cookie: "jait_token=" + token };
    __jait_capture(0, ((await app.inject({ url: "/api/tools", headers: evil })).statusCode));
    __jait_capture(1, ((await app.inject({ method: "POST", url: "/api/auth/refresh", headers: evil })).statusCode));
    __jait_capture(2, ((await app.inject({ url: "/api/filesystem/nodes", headers: { ...headers, origin: "http://tauri.localhost" } })).statusCode));
  
})();

} finally {
await __jait_hook_1011();
}
}

break;
}
case "tailstatic_packages_gateway_src_security_pairing_preview_access_test_ts_127_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { default: cookie } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@fastify/cookie", __jait_original_dir):__jait_require.resolve("@fastify/cookie")));
const { default: WebSocket, WebSocketServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const config = { ...loadConfig(), jwtSecret: "paired-preview-security-test", logLevel: "silent", nodeEnv: "production" };
const cleanups: Array<() => unknown> = [];
async function previewSetup(port: number, root: string) {
  const app = await createServer(config, {
    projectService: { list: (_status: unknown, user: string) => user === "owner" ? [{ rootPath: root }] : [] } as any,
    sessionService: { getById: (id: string, user: string) => id === "preview-session" && user === "owner" ? { id, userId: user } : null } as any,
    previewService: { list: () => [{ sessionId: "preview-session", status: "ready", port, projectRoot: root, remoteBrowser: { novncPort: port } }] } as any,
  });
  cleanups.push(() => app.close());
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const stranger = await signAuthToken({ id: "stranger", username: "stranger" }, config.jwtSecret);
  return { app, token, headers: { authorization: "Bearer " + token }, other: { authorization: "Bearer " + stranger } };
}
const __jait_hook_1011 = async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); };

try {
await (async()=>{

  const upstream = httpServer();
  const upstreamWs = new WebSocketServer({ server: upstream });
  upstreamWs.on("connection", (socket) => {
    socket.on("message", (data) => socket.send(data.toString()));
    socket.send("upstream-ready");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => { upstreamWs.close(); return new Promise<void>((resolve) => upstream.close(() => resolve())); });
  const port = (upstream.address() as import("node:net").AddressInfo).port;
  const { app, headers } = await previewSetup(port, __jait_fixture_dir);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const appPort = (app.server.address() as import("node:net").AddressInfo).port;
  const grant = await app.inject({ method: "POST", url: "/api/preview/access", headers: { ...headers, host: "127.0.0.1:" + appPort },
    payload: { source: "/noVNC/vnc_lite.html?path=api/live-view/" + port + "/websockify" } });
  __jait_capture(0, (grant.statusCode));
  const viewer = new URL(grant.json().url);
  const path = viewer.searchParams.get("path");
  const socket = new WebSocket("ws://127.0.0.1:" + appPort + "/" + path, { origin: "http://tauri.localhost" });
  cleanups.push(() => socket.terminate());
  // A message from upstream proves both proxy legs are ready, even under load.
  const ready = new Promise<string>((resolve, reject) => {
    socket.once("message", (data) => resolve(data.toString()));
    socket.once("error", reject);
  });
  await ready;
  const echo = new Promise<string>((resolve) => socket.once("message", (data) => resolve(data.toString())));
  socket.send("native-preview-marker");
  __jait_capture(1, (await echo));

})();

} finally {
await __jait_hook_1011();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
