// Translated fixture from packages/gateway/src/routes/screen-share.test.ts; expected literals are in tail_static.rs.


import { registerScreenShareRoutes } from "../../../../packages/gateway/src/routes/screen-share.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import type { AppConfig } from "../../../../packages/gateway/src/config.js";
import type { ControlAccess } from "../../../../packages/gateway/src/security/control-access.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/screen-share.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_60_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare } = await setup();
    const response = await app.inject({ method: "POST", url: "/api/screen-share/start", payload: {
      hostDeviceId: "node-1", viewerDeviceIds: ["web-1"], chatId: "chat-1",
      initiatedBy: "user", requireConsent: false,
    } });
    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json().session.pendingApproval));
    __jait_capture(2, (screenShare.getSessionForChat("chat-1")?.pendingApproval));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_71_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const screenShare = new ScreenShareService();
    for (const id of ["host", "viewer"]) {
      screenShare.registerDevice({ id, name: id, platform: "web", authorized: true, capabilities: [] });
    }
    const share = screenShare.startShare({ hostDeviceId: "host", viewerDeviceIds: ["viewer"],
      chatId: "private", initiatedBy: "agent", requireConsent: true });
    const { ws, calls } = stubWs();
    const config = { jwtSecret: "screen-share-test-secret" } as AppConfig;
    const access = { session: (id: string, user: string) => id === "private" && user === "alice" } as ControlAccess;
    const app = Fastify();
    registerScreenShareRoutes(app, { screenShare, ws, config, access });
    await app.ready();
    const headers = { authorization: `Bearer ${await signAuthToken({ id: "bob", username: "bob" }, config.jwtSecret)}` };
    const attempts = [
      { method: "GET" as const, url: "/api/screen-share/chat/private" },
      { method: "POST" as const, url: "/api/screen-share/join", payload: { sessionId: share.id, viewerDeviceId: "viewer" } },
      { method: "POST" as const, url: "/api/screen-share/leave", payload: { sessionId: share.id, viewerDeviceId: "viewer" } },
      { method: "POST" as const, url: "/api/screen-share/approve", payload: { sessionId: share.id, approved: true } },
      { method: "POST" as const, url: "/api/screen-share/handoff", payload: { sessionId: share.id, chatId: "private", controlOwner: "user" } },
      { method: "POST" as const, url: "/api/screen-share/transfer-control", payload: { sessionId: share.id, controllerDeviceId: "viewer" } },
      { method: "POST" as const, url: "/api/screen-share/stop", payload: { sessionId: share.id } },
    ];
    for (const attempt of attempts) __jait_capture(0, ((await app.inject({ ...attempt, headers })).statusCode));
    __jait_capture(1, (screenShare.getSession(share.id)));
    __jait_capture(2, (calls.state));
    const alice = { authorization: `Bearer ${await signAuthToken({ id: "alice", username: "alice" }, config.jwtSecret)}` };
    __jait_capture(3, ((await app.inject({ method: "GET", url: "/api/screen-share/chat/private", headers: alice })).statusCode));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_104_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, calls, sessionId } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/join",
      payload: { sessionId, viewerDeviceId: "web-2" },
    });

    __jait_capture(0, (res.statusCode));
    const body = res.json() as {
      ok: boolean;
      session: { id: string; chatId?: string | null; viewers: { deviceId: string }[] };
    };
    __jait_capture(1, (body.ok));
    // Same session, same owning chat: joining never forks a second capture.
    __jait_capture(2, (body.session.id), (sessionId));
    __jait_capture(3, (body.session.chatId));
    __jait_capture(4, (body.session.viewers.map((v) => v.deviceId).sort()));
    // The node is asked to renegotiate toward the new viewer with its existing capture.
    __jait_capture(5, (calls.startRequest));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_129_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/join",
      payload: { sessionId: "does-not-exist", viewerDeviceId: "web-2" },
    });

    __jait_capture(0, (res.statusCode));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_142_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, sessionId } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/join",
      payload: { sessionId, viewerDeviceId: "node-1" },
    });

    __jait_capture(0, (res.statusCode));
    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_157_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare, sessionId } = await setup();
    try {
      screenShare.addViewer(sessionId, "web-2");
      const response = await app.inject({ method: "POST", url: "/api/screen-share/leave", payload: { sessionId, viewerDeviceId: "web-1" } });
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (response.json().session.status));
      __jait_capture(2, (response.json().session.viewers.map((viewer: { deviceId: string }) => viewer.deviceId)));
      __jait_capture(3, (screenShare.getSessionForChat("chat-1")?.id), (sessionId));
      __jait_capture(4, ((await app.inject({ method: "POST", url: "/api/screen-share/leave", payload: { sessionId, viewerDeviceId: "node-1" } })).statusCode));
    } finally { await app.close(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_172_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, calls } = await setup();
    try {
      for (const [url, payload, status] of [
        ["/api/screen-share/join", {}, 400],
        ["/api/screen-share/join", { sessionId: "missing", viewerDeviceId: "web-1" }, 404],
        ["/api/screen-share/approve", {}, 400],
        ["/api/screen-share/approve", { sessionId: "missing", approved: true }, 404],
        ["/api/screen-share/handoff", {}, 400],
        ["/api/screen-share/handoff", { sessionId: "missing", chatId: "chat-1", controlOwner: "agent" }, 404],
      ] as const) {
        const response = await app.inject({ method: "POST", url, payload });
        __jait_capture(0, (response.statusCode), (status));
      }
      __jait_capture(1, ((await app.inject({ method: "GET", url: "/api/screen-share/chat/missing-chat" })).statusCode));
      __jait_capture(2, (calls));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_193_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, sessionId } = await setup();
    try {
      const found = await app.inject({ method: "GET", url: "/api/screen-share/chat/chat-1" });
      __jait_capture(0, (found.statusCode));
      __jait_capture(1, (found.json().session.id), (sessionId));
      const other = await app.inject({ method: "GET", url: "/api/screen-share/chat/chat-2" });
      __jait_capture(2, (other.statusCode));

      const stopped = await app.inject({ method: "POST", url: "/api/screen-share/stop", payload: { sessionId } });
      __jait_capture(3, (stopped.json().session.status));
      const afterStop = await app.inject({ method: "GET", url: "/api/screen-share/chat/chat-1" });
      __jait_capture(4, (afterStop.statusCode));
      const join = await app.inject({ method: "POST", url: "/api/screen-share/join", payload: { sessionId, viewerDeviceId: "web-2" } });
      __jait_capture(5, (join.statusCode));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_213_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, states, sessionId } = await setup();
    try {
      const response = await app.inject({ method: "POST", url: "/api/screen-share/start", payload: { hostDeviceId: "node-1", chatId: "chat-1" } });
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (states.map(({ id, status }) => ({ id, status }))), ([
        { id: sessionId, status: "idle" },
        { id: response.json().session.id, status: "sharing" },
      ]));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_227_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare, calls } = await setup();
    try {
      const pending = screenShare.startShare({ hostDeviceId: "node-1", chatId: "pending-chat", initiatedBy: "agent", requireConsent: true });
      screenShare.stopShare(pending.id);
      const response = await app.inject({ method: "POST", url: "/api/screen-share/approve", payload: { sessionId: pending.id, approved: true } });
      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (screenShare.getSession(pending.id)?.status));
      __jait_captureType(2, (screenShare.getSessionForChat("pending-chat")));
      __jait_capture(3, (calls.state));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_242_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare, calls } = await setup();
    try {
      const pending = screenShare.startShare({
        hostDeviceId: "node-1", viewerDeviceIds: ["web-1"], chatId: "pending-chat",
        initiatedBy: "agent", requireConsent: true,
      });
      __jait_capture(0, (pending.pendingApproval));
      const res = await app.inject({
        method: "POST", url: "/api/screen-share/join",
        payload: { sessionId: pending.id, viewerDeviceId: "web-2" },
      });
      __jait_capture(1, (res.statusCode));
      __jait_capture(2, (res.json().session.pendingApproval));
      __jait_capture(3, (calls.startRequest));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_264_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare, calls, sessionId } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/handoff",
      payload: { sessionId, controlOwner: "agent", chatId: "chat-1" },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (screenShare.getSession(sessionId)?.controlOwner));
    __jait_capture(2, (calls.handoff));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_280_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare, calls, sessionId } = await setup();
    const before = screenShare.getSession(sessionId)?.controlOwner;

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/handoff",
      payload: { sessionId, controlOwner: "agent", chatId: "chat-2" },
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (screenShare.getSession(sessionId)?.controlOwner), (before));
    __jait_capture(2, (calls.handoff));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_297_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app, screenShare, calls, sessionId } = await setup();
    try {
      const pending = screenShare.startShare({
        hostDeviceId: "node-1", chatId: "pending-chat", initiatedBy: "agent", requireConsent: true,
      });
      const handoff = (id: string, chatId: string, controlOwner: unknown) => app.inject({
        method: "POST", url: "/api/screen-share/handoff", payload: { sessionId: id, chatId, controlOwner },
      });
      __jait_capture(0, ((await handoff(pending.id, "pending-chat", "user")).statusCode));
      __jait_capture(1, ((await handoff(sessionId, "chat-1", "invalid")).statusCode));
      screenShare.stopShare(sessionId);
      __jait_capture(2, ((await handoff(sessionId, "chat-1", "agent")).statusCode));
      __jait_capture(3, (calls.handoff));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_screen_share_test_ts_316_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
function stubWs() {
  const calls = { state: 0, startRequest: 0, handoff: 0, relay: 0 };
  const states: Array<{ id: string; status: string }> = [];
  const ws = {
    broadcastScreenShareState: (state: { id: string; status: string }) => {
      calls.state += 1;
      states.push(state);
    },
    sendScreenShareStartRequest: () => {
      calls.startRequest += 1;
    },
    broadcastScreenShareControlHandoff: () => {
      calls.handoff += 1;
    },
    relayShareSignal: () => {
      calls.relay += 1;
    },
  } as unknown as WsControlPlane;
  return { ws, calls, states };
}
async function setup() {
  const screenShare = new ScreenShareService();
  const { ws, calls, states } = stubWs();
  for (const id of ["node-1", "web-1", "web-2"]) {
    screenShare.registerDevice({
      id,
      name: id,
      platform: id.startsWith("node") ? "windows" : "web",
      authorized: true,
      capabilities: id.startsWith("node") ? ["screen-capture"] : [],
    });
  }
  const app = Fastify();
  registerScreenShareRoutes(app, { screenShare, ws });
  await app.ready();

  // A chat owns a live share hosted by the node.
  const started = screenShare.startShare({
    hostDeviceId: "node-1",
    viewerDeviceIds: ["web-1"],
    chatId: "chat-1",
    nodeId: "node-1",
    initiatedBy: "user",
  });

  return { app, screenShare, calls, states, sessionId: started.id };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { app } = await setup();

    const res = await app.inject({
      method: "POST",
      url: "/api/screen-share/handoff",
      payload: { controlOwner: "agent", chatId: "chat-1" },
    });

    __jait_capture(0, (res.statusCode));
    await app.close();
  
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
